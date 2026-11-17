# Dinámicas on-chain (Stellar / Soroban)

Cada dinámica de una publicación (promoción por tiempo, "Voy", código promocional, QR, consumo) puede tener **su propio contrato** en Stellar. Prisma sigue guardando la publicación, el texto y las participaciones como **espejo** para el feed; el contrato es la fuente de verdad del progreso y del cierre cuando el modo es `on`.

Un contrato por dinámica, firmado por **una cuenta custodial de la empresa** (`STELLAR_DEPLOYER_SECRET_KEY`). El usuario no firma nada.

## Piezas

| Pieza | Dónde |
| --- | --- |
| Contrato Rust | `contracts/contracts/tonki-dynamic` (`cargo test`, `stellar contract build`) |
| Cliente Soroban, cola, worker, reconciliador | `src/lib/posts/chain/` |
| Endpoint del worker (cron) | `POST/GET /api/internal/dynamics/chain` |
| Estado, costos y saldo (admin) | `GET /api/admin/dynamics/chain?days=30` |
| Migración de dinámicas existentes | `npm run chain:migrate` |
| Prueba contra testnet | `npm run chain:smoke` |

Las escrituras a Stellar nunca ocurren dentro de una transacción de base de datos. Se encolan en `DynamicChainJob` (patrón outbox, idempotente por `(dynamic_id, type, dedupe_key)`) y las procesa el worker con reintentos y backoff (15 s base, 30 min máximo, 8 intentos).

## Variables de entorno

Solo servidor. **Nunca** con prefijo `NEXT_PUBLIC_` ni en el repositorio.

| Variable | Para qué |
| --- | --- |
| `DYNAMICS_CHAIN_MODE` | `off` (por defecto), `shadow` u `on` |
| `DYNAMICS_CHAIN_KINDS` | Lista separada por comas: `going,qr,time_promo,promo_code,consumption`. Vacía = todos |
| `STELLAR_DEPLOYER_SECRET_KEY` | Cuenta custodial (`S…`), con XLM |
| `DYNAMIC_WASM_HASH` | Hash del WASM subido a la red (64 hex) |
| `DYNAMICS_HASH_SECRET` | ≥ 32 caracteres. Clave del HMAC de la config (el código promocional no queda en claro en la cadena) |
| `DYNAMICS_MIN_BALANCE_XLM` | Umbral de alerta de saldo (50 por defecto) |
| `CRON_SECRET` | ≥ 24 caracteres. Protege el endpoint del worker; sin él, el endpoint responde 503 |
| `STELLAR_NETWORK`, `STELLAR_RPC_URL`, `STELLAR_NETWORK_PASSPHRASE` | Ya existentes. En mainnet la passphrase es obligatoria |
| `STELLAR_EXPLORER_URL` | Opcional, para los enlaces "Ver contrato" |

## Modos

- **`off`**: todo como antes. Solo base de datos.
- **`shadow`**: la base de datos manda. Las dinámicas nuevas despliegan contrato y cada escritura se copia al contrato con un trabajo. Los desacuerdos se **reportan**, no se corrigen. Sirve de evidencia antes de pasar a `on`.
- **`on`**: el contrato manda para los tipos habilitados con `chain_status = 'active'`. La participación espera la confirmación de Stellar y después escribe la fila. Mientras un contrato está `pending` o `failed` no se puede participar (503 / 409). Los consumos nunca bloquean el cobro: se encolan.

`chain_status` por dinámica: `legacy` (sin contrato), `pending` (desplegando), `active`, `failed`.

Editar una dinámica la **reemplaza**: el contrato anterior se cierra a la fuerza y se despliega uno nuevo, porque un contrato es inmutable.

## Puesta en marcha

1. Aplicar la migración de Prisma en la base que corresponda: `npx prisma migrate deploy` (`prisma/migrations/20261111160000_dynamic_chain`). Ni el código ni los scripts la aplican solos.
2. Construir y subir el contrato:
   ```bash
   cd contracts && stellar contract build
   stellar contract upload --wasm target/wasm32v1-none/release/tonki_dynamic.wasm \
     --source-account <cuenta> --network testnet
   ```
   El hash que imprime va en `DYNAMIC_WASM_HASH`.
3. Validar el cliente de punta a punta en testnet: `npm run chain:smoke` (despliega un contrato desechable y mide la comisión de cada llamada; no toca la base de datos).
4. Programar el worker. Ejemplo con cron del sistema, cada minuto:
   ```bash
   * * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tonki.example/api/internal/dynamics/chain
   ```
   Parámetros: `reconcile=1` compara contratos con la base de datos (úsalo cada 10–15 min), `retryFailed=1` devuelve a la cola los trabajos agotados, `limit=N` acota los trabajos por ejecución. Además, al crear una dinámica, participar o acreditar un cobro, el servidor procesa un lote pequeño justo después de responder para no esperar al cron.

## Despliegue por fases

Orden recomendado por tipo (de menor a mayor riesgo): `going` → `qr` → `time_promo` → `promo_code` → `consumption`.

1. **shadow, un tipo.** `DYNAMICS_CHAIN_MODE=shadow`, `DYNAMICS_CHAIN_KINDS=going`. Crear dinámicas de prueba y revisar `reconcile=1` hasta que no haya diferencias salvo ruido momentáneo.
2. **Migrar las existentes.** `npm run chain:migrate` (simulación) y luego `npm run chain:migrate -- --apply --kind going`. Verifica antes a qué base apunta `DATABASE_URL`.
3. **on, un tipo.** Cambiar a `on` con el mismo `DYNAMICS_CHAIN_KINDS`. Vigilar `/api/admin/dynamics/chain`: trabajos fallidos, trabajo pendiente más antiguo y saldo.
4. Repetir con el siguiente tipo.

Antes de cada paso a `on`: sin trabajos `failed`, saldo por encima del umbral con margen y reconciliación limpia.

### Migración de dinámicas existentes

`npm run chain:migrate -- --apply [--kind going] [--limit 20] [--dynamic <uuid>] [--batch-size 40]`

- Simulación por defecto; no escribe nada sin `--apply`.
- Exige modo `shadow` u `on`: con `off` nada copiaría las participaciones posteriores.
- Por dinámica: la reclama (`pending`, que pausa `on` y encola las copias de `shadow`), despliega, importa participantes y cobros en lotes, relee la base de datos hasta que el contrato coincide exactamente y solo entonces la activa. Si algo falla la devuelve a `legacy`; se puede repetir.
- Omite las que ya terminaron por tiempo o meta (se cierran con la lógica de siempre).
- Avisa cuando `progress_count` no coincide con las filas de participación.

## Costos

Medidos con `npm run chain:smoke` en testnet (SDK 14, contrato de ~10.7 KB):

| Operación | Comisión |
| --- | --- |
| Despliegue + constructor | ≈ 2.57 XLM |
| `participate` nueva | ≈ 0.0063 XLM |
| `participate` repetida / agotada | ≈ 0.0004 XLM |
| `close` | ≈ 0.0002 XLM |
| `bump` | ≈ 0.0003 XLM |

El despliegue domina y es sobre todo renta de almacenamiento. Si el costo importa, el margen está en la ventana de TTL del contrato (30 días; se extiende al llegar a 15), no en el número de participaciones. Vuelve a medir en la red real antes de presupuestar: los precios de recursos cambian.

`GET /api/admin/dynamics/chain` resume por tipo de trabajo cuántos hay (hechos, pendientes, fallidos), la comisión pagada y el promedio, además del saldo del firmante. El worker registra `saldo bajo del firmante` en los logs cuando baja de `DYNAMICS_MIN_BALANCE_XLM`, y en modo `on` se rechazan dinámicas nuevas (503) en vez de dejar contratos sin desplegar.

## Riesgos conocidos

- **Firma custodial.** La cadena demuestra lo que el servidor afirmó y que no se alteró después, no que el usuario lo haya autorizado. Quien tenga `STELLAR_DEPLOYER_SECRET_KEY` puede escribir en todos los contratos: guárdala como secreto de producción y rótala con un contrato nuevo si se filtra.
- **Un solo firmante.** Las transacciones se envían en serie (secuencia de la cuenta): del orden de una docena por minuto por proceso. Con más tráfico hay que repartir entre varias cuentas de canal o aceptar la cola.
- **Vida del contrato (TTL).** Cada escritura lo extiende; `bump` mantiene vivos los contratos activos y se encola cada 10 días. Un contrato expirado pierde su estado.
- **Datos públicos.** Los participantes se guardan como hash con dominio separado (`sha256`), no como ids, pero cualquiera puede comprobar si un id conocido participó. La config va con HMAC.
- **Reglas duplicadas.** Las reglas existen en `rules.ts` y en el contrato. Cambiar una exige cambiar la otra y volver a subir el WASM (los contratos ya desplegados conservan las reglas viejas).

## Revertir

`DYNAMICS_CHAIN_MODE=off` devuelve todo a la base de datos de inmediato. El espejo de Prisma tiene el último estado confirmado, y `reconcile=1` en `on` lo mantiene al día, así que no hace falta migrar nada de vuelta. Los trabajos pendientes quedan en cola sin procesarse y continúan si vuelves a `shadow` u `on`. Para pasar un solo tipo a `legacy`, quítalo de `DYNAMICS_CHAIN_KINDS`.
