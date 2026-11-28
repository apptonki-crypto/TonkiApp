# Tonki

**App de lealtad para negocios locales en México.**

El negocio publica posts con promociones, registra una venta y muestra un QR. El cliente paga desde su wallet de Pollar, el pago se verifica en Stellar/Horizon, y el cliente recibe Tonkis (puntos) según el porcentaje de cashback del negocio. Los puntos se acumulan y pueden canjearse por premios.

🔗 **Demo:** [tonki.io](https://tonki.io)

---

## Cómo funciona

### Para el negocio (admin)
1. Inicia sesión con Pollar y completa tu perfil de empresa.
2. Publica posts con dinámicas: `time_promo`, `going`, `promo_code`, `qr`, `consumption`.
3. Ve a **Cobrar**, escribe el monto en pesos y muestra el QR al cliente.
4. Gestiona tu CRM, airdrop de puntos y premios desde el panel admin.

### Para el cliente
1. Inicia sesión con Pollar (Google, email o Freighter).
2. Escanea el QR del negocio en `/cobro/[token]`.
3. Paga con tu wallet Pollar — el pago viaja por Stellar.
4. Recibes Tonkis de inmediato al confirmar el pago en Horizon.
5. Acumula puntos y canjéalos por premios en `/rewards`.

### Dinámicas en Stellar
Cada dinámica de un post puede vivir como contrato Soroban en mainnet. El contrato `tonki-dynamic` registra participaciones y cobros on-chain, verifica reglas (meta, tiempo, duplicados) y emite eventos. El servidor actúa como custodio: firma las invocaciones y el contrato prueba lo que el servidor afirmó.

---

## Stack

Next.js 16 · React 19 · TypeScript strict · Tailwind v4 · Prisma 6 / MySQL · Soroban (Rust) · `@stellar/stellar-sdk` 14 · Pollar (`@pollar/core`, `@pollar/react` 0.12) · Vitest 3

---

## Desarrollo local

```bash
npm install              # también corre prisma generate
docker compose up -d db  # MySQL 8 en :3306
npx prisma migrate dev
npm run db:seed          # usuario de prueba y posts de ejemplo
npm run dev              # http://localhost:3000
```

```bash
npm test                 # vitest (sin red ni DB)
npm run lint             # eslint next/core-web-vitals + typescript
npx tsc --noEmit         # typecheck
```

```bash
# Contratos Soroban
cd contracts
cargo test
stellar contract build
```

Variables de entorno: ver [`CLAUDE.md`](./CLAUDE.md).

---

## Arquitectura

```
app/                rutas Next.js y handlers de API
  (app)/            shell del cliente/negocio (navbar)
  admin/            panel del negocio
  onboarding/       perfil obligatorio al registrarse
src/lib/            lógica de negocio por dominio
  auth/             sesión JWT, verificación Pollar, roles
  charges/          cobros, crédito de Tonkis, settlement Stellar
  posts/            feed, dinámicas (DB + Soroban)
  crm/, airdrop/, rewards/, users/
src/components/     componentes cliente compartidos
contracts/          contrato Soroban tonki-dynamic (Rust)
prisma/             schema y migraciones
scripts/            despliegue y migración on-chain
docs/               documentación en español
```

---

## Documentación

| Tema | Archivo |
|---|---|
| Qué existe hoy (mapa de rutas) | [`docs/GENERAL.md`](./docs/GENERAL.md) |
| Flujos paso a paso | [`docs/FLUJOS.md`](./docs/FLUJOS.md) |
| Lo que falta | [`docs/FALTANTES.md`](./docs/FALTANTES.md) |
| Cobros y Pollar (técnico) | [`docs/COBROS_POLLAR_TECNICO.md`](./docs/COBROS_POLLAR_TECNICO.md) |
| Dinámicas on-chain (Soroban) | [`docs/DINAMICAS_ONCHAIN.md`](./docs/DINAMICAS_ONCHAIN.md) |
| Perfil de empresa y lugares | [`docs/PERFIL_EMPRESA_Y_LUGARES_TECNICO.md`](./docs/PERFIL_EMPRESA_Y_LUGARES_TECNICO.md) |
