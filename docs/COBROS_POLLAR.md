# Cobros con Pollar — resumen para dirección

11 de noviembre de 2026.

## En una frase

El cliente ya no recibe Tonkis por pulsar un botón. Primero paga el consumo, Tonki comprueba ese pago en la red Stellar y solo entonces acredita el cashback.

El ticket sigue siendo en pesos. El premio sigue siendo de Tonki. Pollar es el riel de pago, no el programa de lealtad.

## Cómo paga el cliente

Hay dos caminos y los dos terminan en el mismo sitio: la wallet del negocio.

1. **Con saldo.** Si ya tiene el activo en su wallet de Pollar, confirma el envío. El dinero llega a la wallet del negocio.
2. **Con pesos.** Si no tiene saldo, hace una transferencia (SPEI u otro riel que Pollar ofrezca). Esos pesos se convierten y caen en **su** wallet. Después confirma el envío al negocio. Ese segundo paso no es automático: el cliente lo autoriza.

Un código lo usa un solo cliente. Otro no puede entrar a pagar el mismo cobro. Si el pago ya se confirmó y el código venció, ese cliente todavía puede recibir sus Tonkis.

## Qué ve el negocio

- Sigue registrando la venta en pesos, con su porcentaje de cashback y su QR.
- El pago entra a la wallet Stellar del administrador del negocio, no a una cuenta de Tonki.
- En el CRM la venta sigue pendiente hasta que el pago está verificado. Entonces pasa a confirmada y se entregan los Tonkis.
- Si ese negocio no tiene wallet configurada, el cliente no puede pagar ese código.

## Qué ya está hecho

- Pantalla de cobro con pago desde la wallet y carga en pesos en la misma tarjeta.
- El servidor fija el monto y un identificador único del pago, para que no se pueda reutilizar una transferencia ajena ni pagar de menos.
- La verificación se hace contra la red, no contra lo que diga el celular del cliente.
- La base de datos de producción ya tiene las columnas nuevas.
- Pruebas automáticas del cálculo, del bloqueo del pagador y de la verificación. No sustituyen una prueba con un usuario real de Pollar.

## Qué no se pudo hacer, y por qué

La idea original era un solo cobro de Pollar Pay: el cliente pagaba con wallet o con SPEI y ambos caminos depositaban en una wallet del negocio, y Pollar avisaba “pagado”.

Ese producto no está disponible. Pollar responde que la sucursal no existe y lo marca como próximamente. La versión actual de la rampa tampoco permite depositar directo en la wallet del negocio: el dinero de la transferencia en pesos siempre entra primero a la wallet del cliente.

Por eso el diseño actual es en dos pasos cuando se paga con pesos. Volver al diseño de un solo paso depende de que Pollar abra Pollar Pay, no de un cambio interno de Tonki.

## Qué falta para operarlo

| Tema | Situación | Quién lo desbloquea |
|---|---|---|
| Prueba real de punta a punta | El código está; nadie ha pagado un cobro de verdad con sesión de Pollar | Operación, en testnet o con un cobro chico |
| Corredor de pesos activo | Sin él, el botón de pesos explica que solo se puede pagar con saldo | Alta del onramp MXN en el dashboard de Pollar |
| Registro del cliente en ese corredor | Pollar puede pedir identidad, un formulario, una consulta de padrón y un alta con el proveedor antes de mostrar la cuenta. Hoy solo está la verificación de identidad y la aceptación del activo en la wallet. Lo demás no tiene pantalla | Desarrollo, cuando el corredor real lo exija. Detalle en la doc técnica |
| Wallet de cada negocio | Sin una dirección Stellar válida, ese negocio no cobra | Cada admin, en su cuenta |
| Tipo de cambio | Si no se fija, Tonki lo consulta en CoinGecko al bloquear el pago | Definir si producción usa un precio fijo |
| Aviso al crear la venta | El cobro ya se bloquea, pero el formulario no avisa antes de imprimir el QR | Un cambio chico de producto |
| Publicar el código | La base ya está migrada; el sitio publicado tiene que ser este build | Deploy |

## Decisiones que hacen falta

1. **¿Con qué se cobra?** XLM u otro activo (por ejemplo USDC). Tiene que ser el mismo que el corredor de pesos sepa entregar.
2. **¿Precio fijo o precio de mercado?** Un precio fijo evita que el monto cambie entre que el cajero arma el ticket y el cliente paga. El de mercado se mueve.
3. **¿Testnet o dinero real?** La carga en pesos suele no existir en testnet. Probar SPEI implica claves y dashboard de mainnet, con montos reales.
4. **¿Esperamos a Pollar Pay?** Mientras no exista, el pago con pesos son dos confirmaciones del cliente. No hay fecha de Pollar para el producto original.

## Riesgos a tener presentes

- **El cliente paga pesos y no confirma el envío al negocio.** El saldo queda en su wallet. Tonki no acredita Tonkis y el negocio no ha recibido ese dinero. La pantalla lo dice; no hay cobro automático.
- **Sin corredor o sin registro completo, “pagar con pesos” no aparece.** El pago con saldo sigue funcionando.
- **Un negocio sin wallet no puede cobrar**, aunque el QR ya se haya generado.
- **Pollar custodia la sesión y el KYC.** Tonki no guarda cuentas bancarias ni documentos de identidad. Si Pollar cambia el corredor, hay que volver a probar la pantalla.

## Lectura técnica

Para ingeniería: [`COBROS_POLLAR_TECNICO.md`](./COBROS_POLLAR_TECNICO.md) y, del registro que falta, [`RAMP_REGISTRO.md`](./RAMP_REGISTRO.md).
