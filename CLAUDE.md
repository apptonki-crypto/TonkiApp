# CLAUDE.md

Tonki is a loyalty app for local businesses (Mexico). A business publishes posts, registers a sale in pesos, and shows a QR. The customer pays it over Stellar from their Pollar wallet and earns "Tonkis" (points) at the business's cashback percentage. Pollar (`@pollar/core`, `@pollar/react` 0.12) handles login and the payment rail. Stellar/Soroban is used to verify payments and, optionally, to run post "dynamics" as on-chain contracts.

UI text, comments, commit messages and `docs/` are in **Spanish**. Keep new user-facing strings and docs in Spanish.

## Commands

```bash
npm run dev              # next dev on 0.0.0.0:3000
npm run build
npm run lint             # eslint (next core-web-vitals + typescript)
npm test                 # vitest run (all *.test.ts, node env, no network)
npx vitest run src/lib/charges/settlement/horizon.test.ts   # single file
npx vitest run -t "name of test"                            # single test
npx tsc --noEmit         # typecheck (not wired to a script)

npx prisma migrate dev   # local schema changes
npx prisma generate      # also runs on postinstall
npm run db:seed          # prisma/seed.mjs: a test user and admin plus a few posts (they can't log in; login is Pollar only)
npm run chain:smoke      # deploys a throwaway contract on testnet, no DB
npm run chain:migrate    # dry run; add `-- --apply [--kind going]` to write

cd contracts && cargo test && stellar contract build   # Soroban contract
docker compose up -d db  # local MySQL 8 on :3306
```

## Stack

Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 (`@tailwindcss/postcss`), Prisma 6 on **MySQL**, zod 4, jose (session JWT), `@stellar/stellar-sdk` 14, Freighter (airdrop signing), recharts, framer-motion, vitest 3. Contracts in Rust (soroban-sdk).

## Layout

```
app/                    routes (pages + app/api/**/route.ts)
  (app)/                customer/business shell with bottom navbar: dashboard, rewards, negocios, account, cobro/[token], dinamica/[token]
  admin/                business admin area (own header): dashboard, crm, cobrar, airdrop/*
  onboarding/empresa/   mandatory one-time business profile
  login/, presentacion/, page.tsx (landing)
src/lib/<domain>/       all business logic; route handlers stay thin
  auth/                 Pollar token verification, session JWT, roles, business-profile gate
  charges/              sale/charge creation, Tonkis credit; settlement/ = Stellar payment intent, Horizon check, onramp
  posts/                feed, uploads; dynamics/ = DB rules; chain/ = Soroban client, job outbox, worker, reconciler
  crm/, airdrop/, establishment/, rewards/, users/, api/
src/components/         shared client components (PollarAppProvider wraps the whole app)
src/generated/prisma/   generated Prisma client (gitignored; do not edit)
prisma/                 schema.prisma, migrations/, seeds
contracts/              Cargo workspace; contracts/tonki-dynamic = one contract instance per dynamic
scripts/                chain-smoke.ts, migrate-dynamics-to-chain.ts (run via vite-node)
docs/                   Spanish product/engineering docs (see below)
```

## Conventions

- Import app code as `src/...` (tsconfig path + vitest alias), e.g. `import prisma from "src/lib/db"`. `@/*` maps to the repo root.
- Prisma client: `import prisma from "src/lib/db"` (generated output `src/generated/prisma`, not `@prisma/client`). DB columns are snake_case.
- API responses use `apiSuccess({...}, status)` / `apiError(msg, status)` from `src/lib/api/response.ts`; the shape is `{ success: true, ...data }` or `{ success: false, error }`. Error messages are Spanish and user-facing.
- Parse bodies with `parseRequestJson` (`src/lib/api/readJsonSafely.ts`) and validate with zod schemas in each domain's `schemas.ts`.
- Authorize in route handlers with `requireActiveAdminSession()` / `requireActiveClient` (`src/lib/api/`), which re-read the user from the DB (status must be `active`). Don't rely on the JWT role alone for writes.
- Client-side fetch helpers live next to their domain as `fetch*Client.ts`.
- Tests are colocated `*.test.ts`, pure/mocked (no DB, no network). `src/lib/posts/chain/testing.ts` has chain fakes.

## Auth and roles

- Login is Pollar only (Google, email code, or Freighter). The browser gets a Pollar token; `POST /api/auth/pollar/session` verifies it server-side (`verifyPollarToken.ts`, `POLLAR_SECRET_KEY`), finds or creates the `User` (`pollarAccount.ts`), and sets the `tonki_session` cookie (HS256 JWT, 7 days, `AUTH_SECRET` ≥ 32 chars).
- `User.type`: `"admin"` = a **business** account, `"user"` = a customer, `"staff"` = a waiter of one business (`StaffMember`, joined via a one-time `StaffInvite` link at `/mesero/unirse/[token]`). There is no superuser role.
- `middleware.ts` protects routes by an explicit `matcher` list, redirects non-admins away from `/admin`, keeps `staff` inside `/mesero`, and keeps everyone else out of `/mesero` except the invite link. **Add new protected routes to that matcher.** `/negocios`, `/cobro` preview and landing pages are partly public.
- Staff APIs authorize with `requireActiveStaffSession()` (`src/lib/api/requireActiveStaff.ts`), which returns the business `adminId`. A waiter's charge has `admin_id` = the business and `created_by_staff_id` = the waiter. If the JWT role goes stale (a waiter was revoked), `GET /api/auth/refresh` re-issues the cookie from the DB role.
- A business without `business_profile_completed_at` is redirected to `/onboarding/empresa` by `redirectIfBusinessProfileMissing()` in layouts.
- Return paths after login go through `sanitizeAuthReturnPath`.

## Charge settlement (payments)

Flow: business creates a `Charge` in MXN + QR → customer opens `/cobro/[token]` → `POST /api/cobro/[token]/intent` locks asset, amount, destination (the business admin's `wallet_address`) and a unique memo (`tonki-` + 16 hex) → the browser pays with Pollar `sendPayment` → `POST /api/cobro/[token]` with `tx_hash` → server verifies on Horizon (memo, destination, asset, amount, source) → `pay_status = confirmed` → `creditChargeForUser` awards Tonkis.

- Tonkis are credited only after Horizon confirmation. Never credit on the client's word.
- Horizon `not_found`/`unavailable` returns 202 `{ retry: true }`; the client retries.
- The server never calls Pollar to quote, create orders or sign; the onramp (`RampLoadCard.tsx`) runs in the browser session.
- Pollar Pay (`/v2/charges`) is unavailable (`BRANCH_NOT_FOUND`). Don't build on it.
- Details: `docs/COBROS_POLLAR_TECNICO.md`, `docs/RAMP_REGISTRO.md`.

## Post dynamics and on-chain mode

Up to 5 dynamics per post. Kinds: `time_promo`, `going`, `promo_code`, `qr`, `consumption`. Rules live in `src/lib/posts/dynamics/rules.ts` **and** are duplicated in `contracts/contracts/tonki-dynamic/src/lib.rs`. Change both together and re-upload the WASM. Already-deployed contracts keep the old rules.

`DYNAMICS_CHAIN_MODE` = `off` (default, DB only) | `shadow` (DB authoritative, mirrored to contracts) | `on` (contract authoritative for kinds in `DYNAMICS_CHAIN_KINDS` with `chain_status = 'active'`). Stellar writes never happen inside a DB transaction. They are queued in `DynamicChainJob` (outbox, idempotent on `(dynamic_id, type, dedupe_key)`) and processed by the worker at `/api/internal/dynamics/chain` (Bearer `CRON_SECRET`). Full runbook: `docs/DINAMICAS_ONCHAIN.md`.

## Environment

`.env` / `.env.local` are gitignored. Never prefix server secrets with `NEXT_PUBLIC_`.

- Core: `DATABASE_URL`, `AUTH_SECRET`, `APP_URL` / `NEXT_PUBLIC_APP_URL`
- Pollar: `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY`, `NEXT_PUBLIC_POLLAR_NETWORK`, `POLLAR_SECRET_KEY` (optional `POLLAR_TOKEN_VERIFY_URL`, `POLLAR_USERS_URL`)
- Payments: `PAYMENT_ASSET` (`native` default or `CODE:ISSUER`), `PAYMENT_MXN_PER_ASSET` (else CoinGecko, 60 s cache), `HORIZON_URL`
- Chain: `DYNAMICS_CHAIN_MODE`, `DYNAMICS_CHAIN_KINDS`, `STELLAR_DEPLOYER_SECRET_KEY`, `DYNAMIC_WASM_HASH`, `DYNAMICS_HASH_SECRET`, `DYNAMICS_MIN_BALANCE_XLM`, `CRON_SECRET`, `STELLAR_NETWORK`, `STELLAR_RPC_URL`, `STELLAR_NETWORK_PASSPHRASE`, `STELLAR_EXPLORER_URL`
- Airdrop: `STELLAR_AIRDROP_NETWORK`, `STELLAR_HORIZON_URL`

Chain config reads env via functions taking an `env` argument (`readChainMode(env = process.env)`), so tests pass a plain object.

## Gotchas

- Production DB is on Hostinger. It has 4 migrations that aren't in this repo (see the end of `docs/COBROS_POLLAR_TECNICO.md`), so `prisma migrate dev` against it can conflict. Use `migrate deploy` there, and check which DB `DATABASE_URL` points at before running migrations or `chain:migrate --apply`.
- Uploads are written to `public/uploads/` on local disk (gitignored). Paths are resolved through `resolveSafePostAttachmentPath`.
- `next.config.ts` hardcodes `allowedDevOrigins: ["192.168.100.48"]` for LAN dev testing and sets security headers.
- A business admin needs a valid Stellar `wallet_address` (`^G[A-Z2-7]{55}$`) to receive payments. Otherwise its charges can't be paid.
- Prize redemption reserves Tonkis on `PrizeRedemption` (`pending`), and the business marks `delivered`. Cancel while pending returns the points. `/rewards` and `/account` show the spendable balance; leaderboards and airdrops still sum lifetime `Reward.points`.
- The feed shows only real posts and stops when the API cursor runs out. The demo/placeholder feed was removed on purpose.

## Docs (`docs/`, Spanish)

`GENERAL.md` (what exists, route map) · `FLUJOS.md` (step-by-step flows) · `FALTANTES.md` (what's missing or not operable) · `COBROS_POLLAR_TECNICO.md` (payments, engineering; the file without a suffix is the summary for management) · `RAMP_REGISTRO.md` (onramp registration not yet built) · `DINAMICAS_ONCHAIN.md` (Soroban rollout) · `PERFIL_EMPRESA_Y_LUGARES_TECNICO.md` (business profile and places hive; same suffix convention). Read the relevant doc before changing a domain, and update it when behavior changes.
