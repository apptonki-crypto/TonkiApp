# Lo que falta

11 de noviembre de 2026. Lo que el código no hace, o lo que está escrito pero no se puede usar hasta una decisión o un paso de operación. Los flujos de lo que sí funciona están en [`FLUJOS.md`](./FLUJOS.md).

## Para poder cobrar de verdad

| Falta | Por qué importa |
|---|---|
| Probar un cobro de punta a punta con una sesión real de Pollar | El código y las pruebas automáticas están. Nadie ha pagado un cobro real desde la app. |
| Corredor de pesos MXN activo en el dashboard de Pollar | Sin él, “pagar con pesos” explica que solo se puede pagar con saldo. |
| Registro del corredor: formulario, padrón y alta con el proveedor | Si Pollar los pide antes de cotizar, la tarjeta se queda en un texto y no hay pantalla para completarlos. KYC y trustline sí están. Detalle en [`RAMP_REGISTRO.md`](./RAMP_REGISTRO.md). |
| Wallet Stellar de cada negocio | Sin dirección válida, ese QR no se puede pagar. El alta de empresa no avisa de esto antes de generar el código. |
| Decidir el activo y el tipo de cambio | Por defecto es XLM y, si no hay precio fijo, CoinGecko al bloquear el pago. Tiene que ser el mismo activo que sepa entregar el corredor. |
| Publicar este build | La base de cobros ya está migrada. El sitio en línea tiene que ser este código. |
| Elegir testnet o dinero real | La carga en pesos normalmente no existe en testnet. Probar SPEI implica mainnet y montos reales. |

Pollar Pay, el cobro de un solo paso que deposita directo en el negocio, no se puede construir aquí: el producto responde que la sucursal no existe. Tampoco hay aviso de Pollar cuando el pago cae; Tonki lo comprueba en Horizon. No hay ramp para depositar o retirar desde Cuenta, ni pasos de crear wallet, migrar custodia o recuperar cuenta dentro del cobro.

## Para encender las dinámicas en Stellar

El contrato, el worker y el script ya están en el repo. No están encendidos: `DYNAMICS_CHAIN_MODE` vale `off` si no se cambia, y sin las claves el cron ni siquiera arranca.

| Falta | Qué desbloquea |
|---|---|
| Subir el WASM y guardar `DYNAMIC_WASM_HASH` | Poder desplegar un contrato por dinámica. |
| `STELLAR_DEPLOYER_SECRET_KEY`, `DYNAMICS_HASH_SECRET` y `CRON_SECRET` | Firmar, no publicar los códigos en claro y proteger el cron. |
| Aplicar `20261111160000_dynamic_chain` en Hostinger | Las columnas y la cola de trabajos. Esta migración acaba de entrar al repo; hay que confirmar que la base de producción la tiene. |
| Un cron contra `POST /api/internal/dynamics/chain` | Desplegar, participar, cerrar y reconciliar. Sin cron, una dinámica nueva se queda en “Activando…”. |
| XLM en la cuenta que firma, por encima del piso (50 por defecto) | Cada dinámica cuesta un despliegue, una transacción por participación y el cierre. En modo `on`, sin saldo no se crean dinámicas nuevas. |
| `npm run chain:migrate -- --apply` para las dinámicas activas viejas | Pasarlas al contrato. Las cerradas se quedan como están. |
| Medir el costo en testnet y firmar el presupuesto de mainnet | El plan de rollout es `shadow`, luego `on` por tipo (`going`, `qr`, tiempo, código, consumo). |
| Aceptar el límite del diseño | El contrato demuestra que el servidor afirmó la participación. No demuestra, por sí solo, qué persona lo hizo. |

Mientras el modo siga en `off`, las dinámicas actuales siguen funcionando solo con la base.

## Producto que se ve y no termina

- **Aviso de wallet al cobrar.** Se puede imprimir un QR de un negocio que todavía no puede recibir el pago.
- **Migración del QR de presentación.** `20261117190000_establishment_presentation_qr` no está aplicada en Hostinger. Hasta aplicarla con `npx prisma migrate deploy`, en producción fallan Lugares para un cliente con sesión (lee `EstablishmentCheckIn`), el QR del local y `/visita`.
- **QR de presentación sin prueba de presencia.** Cualquiera con la foto del código registra una visita al día. Mitigación actual: rotar el código.
- **Negocios viejos incompletos.** Siguen saliendo en Lugares. La obligación de completar la ficha aplica a quien entra ahora y a quien la migración no pudo marcar.
- **Fotos y mapa.** Opcionales. La ficha pública se publica sin ellos.
