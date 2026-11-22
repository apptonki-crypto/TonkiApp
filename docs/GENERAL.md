# Tonki — qué hay en la página

11 de noviembre de 2026. Inventario de lo que la app hace hoy. Los pasos están en [`FLUJOS.md`](./FLUJOS.md). Lo que no está listo para operarse está en [`FALTANTES.md`](./FALTANTES.md).

Tonki es la app de lealtad: el negocio publica, cobra un consumo y el cliente recibe Tonkis. Pollar es el ingreso y el riel de pago. Stellar es la red donde se comprueba el cobro y, si se enciende, donde viven las dinámicas.

## Páginas públicas

| Ruta | Qué es |
|---|---|
| `/` | Landing de Tonki. |
| `/presentacion` | Presentación para foro: problema, producto y preguntas. |
| `/login` | Entrada con Pollar: Google, código al correo o Freighter. |
| `/negocios` | Directorio de negocios en panal. Abre la ficha sin exigir sesión. |
| `/cobro/[token]` | Pantalla del QR de un consumo. |
| `/dinamica/[token]` | Página a la que lleva el QR de una dinámica. |
| `/visita/[token]` | Página a la que lleva el QR de presentación de un negocio. Pide sesión de cliente, registra la visita del día y salta al panal. |

## Cliente

Barra inferior: Feed, Recompensas, Lugares, Cuenta.

| Ruta | Qué es |
|---|---|
| `/dashboard` | Feed de publicaciones. Se puede abrir el perfil de una persona. |
| `/rewards` | Saldo disponible, tablas de líderes y de consumos, catálogo y canje de premios. |
| `/negocios` | Panal. Los lugares ya visitados (cobro acreditado o QR de presentación escaneado) quedan en el centro, unidos si son vecinos. Una visita nueva entra con animación. |
| `/account` | Foto, datos, wallet y los Tonkis recientes. |

La ficha de un lugar muestra logo, portada, categoría, abierto o cerrado según la hora del visitante, cashback, descripción, teléfono, mapa, sitio, horario y hasta 8 fotos.

## Empresa

Misma barra, más Airdrop. El área de administración tiene su propia cabecera: Contenido, CRM ventas, Cobrar, QR del local y Meseros.

| Ruta | Qué es |
|---|---|
| `/onboarding/empresa` | Alta obligatoria, una sola vez, después del primer ingreso con Pollar. |
| `/admin/dashboard` | Crear publicación, ver las propias y métricas. |
| `/admin/crm` | Resumen, productos, ventas por hora y exportación CSV. |
| `/admin/cobrar` | Registrar la venta y sacar el QR. |
| `/admin/presentacion` | QR de presentación del local: descargar, imprimir el cartel o generar uno nuevo. |
| `/admin/meseros` | Invitar meseros con un enlace de un solo uso y darlos de baja. |
| `/admin/airdrop` | Enviar un airdrop firmando con Freighter. |
| `/admin/airdrop/configure` | Activo y campaña. |
| `/admin/airdrop/stats` | Cifras del envío. |
| `/admin/airdrop/historial` | Envíos anteriores. |
| `/account` | Ficha pública del negocio, galería y atajos al panel, al CRM, al QR de consumo y al QR de presentación. |

Una empresa sin la ficha completa no entra al feed, a recompensas, a lugares ni al admin: la mandan al alta. Un cliente nunca ve esa pantalla. Las empresas que ya tenían nombre, categoría, descripción, dirección, teléfono y horario quedaron marcadas y no repiten el formulario.

## Mesero

Cuenta con `User.type = "staff"`. Solo ve su vista; no tiene feed, recompensas, pago de QR ni panel de negocio.

| Ruta | Qué es |
|---|---|
| `/mesero/unirse/[token]` | Enlace de invitación. Lo abre un cliente con sesión y, al aceptar, su cuenta pasa a mesero. |
| `/mesero` | Generar el QR (monto libre o productos del catálogo) y ver los QR del turno (últimas 12 h) con su estado. |

El QR que genera un mesero es un cobro del negocio: se paga a la wallet del negocio y aparece en el CRM con el nombre del mesero. Si el negocio lo da de baja, vuelve a ser cliente y deja de poder cobrar al instante.

## Cobro

El ticket sigue en pesos. El premio sigue siendo de Tonki. El pago es una transferencia Stellar a la wallet del administrador del negocio.

1. El servidor fija activo, monto, destino y un memo único.
2. El cliente envía desde su wallet de Pollar, o carga pesos a esa wallet y luego envía.
3. Tonki lee la transacción en Horizon y solo entonces acredita.

Pollar Pay (un solo cobro que deposite directo en el negocio) no está disponible. El detalle está en [`COBROS_POLLAR_TECNICO.md`](./COBROS_POLLAR_TECNICO.md).

## Dinámicas de una publicación

Hasta cinco por publicación.

- **Tiempo.** Aviso con fecha de inicio y fin.
- **Voy.** Cuenta personas, una vez cada una.
- **Código.** Canje con un código y un tope.
- **QR.** La persona abre un enlace y cuenta como participación.
- **Consumo.** Suma tickets o monto cuando un cobro de ese negocio queda acreditado.

El estado visible es próxima, activa, agotada o vencida.

En el código ya existe el modo de llevar cada dinámica a un contrato Soroban, firmado por una cuenta del servidor. La base queda como copia para el feed. El interruptor `DYNAMICS_CHAIN_MODE` nace en `off`: mientras no se cambie, nada de eso se ejecuta y el comportamiento es el de la base. Contrato, worker y script de migración están en el repo; encenderlos es trabajo de operación, no un botón de la página.

## Recompensas y Tonkis

Los Tonkis se acreditan al confirmar un cobro, con el porcentaje del negocio. El cliente los ve en Cuenta y en Recompensas. Ese número es lo que puede gastar: lo acreditado menos los canjes pendientes y los ya entregados. Las tablas siguen ordenando por lo acumulado, no por el saldo.

La empresa arma el catálogo de premios (título, descripción, costo en Tonkis, imagen). El cliente canjea desde la misma pantalla y recibe un código. El negocio lo marca como entregado. Cancelar un canje pendiente devuelve los Tonkis.

## Datos que ya tiene la base

Además del esquema inicial: perfil público del negocio y su galería, cashback, cobro de un solo uso, productos y ventas del CRM, dinámicas, liquidación del cobro en cadena, orden de ramp, marca de perfil de empresa completado, columnas para el contrato de cada dinámica (`20261111160000_dynamic_chain`) y canjes de premios (`20261122160000_prize_redemption`).

## Documentos de detalle

| Tema | Ingeniería | Dirección |
|---|---|---|
| Cobros y ramp | [`COBROS_POLLAR_TECNICO.md`](./COBROS_POLLAR_TECNICO.md) | [`COBROS_POLLAR.md`](./COBROS_POLLAR.md) |
| Registro que el ramp puede pedir y no está hecho | [`RAMP_REGISTRO.md`](./RAMP_REGISTRO.md) | el mismo resumen de cobros |
| Perfil, ficha y lugares | [`PERFIL_EMPRESA_Y_LUGARES_TECNICO.md`](./PERFIL_EMPRESA_Y_LUGARES_TECNICO.md) | [`PERFIL_EMPRESA_Y_LUGARES.md`](./PERFIL_EMPRESA_Y_LUGARES.md) |
