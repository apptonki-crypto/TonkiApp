# Tonki

App de lealtad para negocios locales. El negocio publica, cobra un consumo con un QR y el cliente recibe Tonkis. El ingreso y la wallet son de Pollar; el cobro se comprueba en Stellar (Horizon).

## Desarrollo

```bash
npm install            # también corre prisma generate
docker compose up -d db
npx prisma migrate dev
npm run db:seed
npm run dev            # http://localhost:3000
```

`npm test` corre vitest; `npm run lint` corre eslint. Variables de entorno: ver `CLAUDE.md`.

## Arquitectura

```
app/          vistas, rutas y API
src/lib/      cobros, dinámicas, auth, CRM, airdrop
src/components/
prisma/       esquema y migraciones
contracts/    contrato Soroban de las dinámicas
scripts/      prueba y migración on-chain
docs/
```

## Documentación

| Tema | Ingeniería | Dirección |
|---|---|---|
| Cobros y ramp | [`COBROS_POLLAR_TECNICO.md`](./docs/COBROS_POLLAR_TECNICO.md) | [`COBROS_POLLAR.md`](./docs/COBROS_POLLAR.md) |
| Registro del ramp (no implementado) | [`RAMP_REGISTRO.md`](./docs/RAMP_REGISTRO.md) | |
| Perfil de empresa y lugares | [`PERFIL_EMPRESA_Y_LUGARES_TECNICO.md`](./docs/PERFIL_EMPRESA_Y_LUGARES_TECNICO.md) | [`PERFIL_EMPRESA_Y_LUGARES.md`](./docs/PERFIL_EMPRESA_Y_LUGARES.md) |
| Dinámicas en Stellar | [`DINAMICAS_ONCHAIN.md`](./docs/DINAMICAS_ONCHAIN.md) | |

- [`docs/GENERAL.md`](./docs/GENERAL.md): qué hay hoy en toda la página
- [`docs/FLUJOS.md`](./docs/FLUJOS.md): pasos para hacer cada cosa
- [`docs/FALTANTES.md`](./docs/FALTANTES.md): lo que no está listo para operarse
