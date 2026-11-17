# Contratos Soroban de Tonki

Workspace de Cargo con un contrato por tipo de pieza. Hoy:

- `contracts/tonki-dynamic`: una instancia por dinámica de publicación (promoción, "Voy", código, QR, consumo). Sus reglas reflejan `src/lib/posts/dynamics/rules.ts`.

```bash
cargo test                  # reglas del contrato
stellar contract build      # genera target/wasm32v1-none/release/tonki_dynamic.wasm
```

Despliegue, variables de entorno y rollout: `docs/DINAMICAS_ONCHAIN.md`.
