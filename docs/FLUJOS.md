# Flujos — cómo se hace cada cosa

11 de noviembre de 2026. Solo los pasos. El mapa de pantallas está en [`GENERAL.md`](./GENERAL.md) y lo que todavía no se puede operar, en [`FALTANTES.md`](./FALTANTES.md).

## Entrar

1. Abrir `/login`.
2. Elegir Google, correo o Freighter. El correo pide un código.
3. Pollar confirma la sesión en el navegador. Tonki la cambia por su propia sesión en `POST /api/auth/pollar/session`.
4. Si la cuenta es de empresa y nunca completó su ficha, el siguiente paso es el alta. Si no, entra al feed (`/dashboard`) o al panel (`/admin/dashboard`).

Salir: en Cuenta, “Cerrar sesión”. Cierra Tonki y la sesión de Pollar.

## Completar la empresa (una sola vez)

1. Tras el primer ingreso, Tonki abre `/onboarding/empresa`.
2. Llenar nombre, categoría, descripción, dirección, teléfono y al menos un día abierto. El cashback puede quedarse en 5 %. Logo, sitio y mapa son opcionales.
3. Pulsar “Completar perfil y entrar”.
4. A partir de ahí el panel ya está disponible. Los mismos datos se cambian en Cuenta, no en esta pantalla.

## Editar la ficha y las fotos

1. Entrar a Cuenta.
2. En “Tu negocio”, cambiar los datos y guardar.
3. Debajo, subir hasta 8 fotos o quitar las que sobren.
4. “Ver perfil público” abre la ficha en Lugares.

## Ver un lugar

1. Abrir Lugares (`/negocios`).
2. Buscar por nombre o categoría, o tocar una celda del panal.
3. En la ficha: llamar, cómo llegar, sitio, horario y fotos.
4. Cerrar vuelve al panal. El enlace `?lugar=` abre esa ficha directo.

Si el visitante es cliente, los lugares donde ya le acreditaron Tonkis o escaneó el QR de presentación quedan en el centro y, si están juntos, unidos por un puente.

## Poner el QR de presentación (empresa)

1. Admin → QR del local (`/admin/presentacion`), o Cuenta → QR de presentación.
2. Descargar la imagen o imprimir el cartel y pegarlo en el mostrador o la mesa.
3. Si el código circula fuera del local: Generar QR nuevo. El anterior deja de funcionar al instante, también el impreso.

Este QR no cobra ni da Tonkis. Solo registra que el cliente estuvo ahí.

## Escanear el QR de presentación (cliente)

1. Escanear con la cámara. Si no hay sesión, pide entrar y vuelve solo.
2. La pantalla saluda con el nombre del lugar y lleva a Lugares.
3. Si es la primera visita, la celda del negocio vuela hasta su hueco en el centro del panal, se enciende y se une con sus vecinos visitados. Si ya había ido, la celda rebota con “+1 visita”.
4. Escanear otra vez el mismo día no suma: la pantalla avisa que la visita de hoy ya contaba.

Un consumo pagado también suma al panal. La pantalla de éxito tiene “Ver tu colmena”, y si el cliente entra a Lugares desde la barra (donde aparece un punto), la animación sale igual.

## Publicar

1. Entrar a Contenido (`/admin/dashboard`).
2. Escribir la publicación y, si hace falta, adjuntar archivos.
3. Opcional: añadir hasta 5 dinámicas (abajo).
4. Publicar. Aparece en el feed y en “Mis publicaciones”.

Desde el feed se puede abrir el perfil de quien publicó: nombre, foto, desde cuándo está y, si tiene negocio, un enlace a su lugar.

## Armar una dinámica

En el compositor, elegir el tipo y guardar la publicación.

| Tipo | Qué configura la empresa | Qué hace la persona |
|---|---|---|
| Tiempo | Texto y ventana de inicio y fin | Nada. Es un aviso con cuenta atrás. |
| Voy | Texto, meta de personas y ventana | Pulsa “Voy”. Cuenta una vez por persona. |
| Código | Código, tope de canjes, beneficio y ventana | Escribe el código y pulsa “Canjear”. |
| QR | Texto, meta y ventana | Escanea el QR que imprime la empresa. Abre `/dinamica/…` y, con sesión, suma su visita. |
| Consumo | Meta por número de tickets o por monto, ticket mínimo y ventana | No pulsa nada. Cuenta cuando un cobro de ese negocio ya le acreditó Tonkis. |

La dinámica pasa por “próxima”, “activa”, “agotada” o “vencida”. Al cumplirse la meta o al pasar la fecha, se cierra.

Hoy, con la cadena apagada, todo esto se guarda en la base. Si más adelante se enciende Stellar, el paso extra es el de “Activar las dinámicas en Stellar”, más abajo. Mientras dice “Activando…”, el botón de participar no sirve.

## Cobrar un consumo

1. Entrar a Cobrar (`/admin/cobrar`).
2. Registrar la venta en pesos, con el porcentaje de cashback. Se puede armar con productos del CRM.
3. Se genera un QR de un solo uso.
4. El cliente lo abre en `/cobro/…`.

El negocio necesita una wallet Stellar válida. Si no la tiene, el cliente ve que ese código no se puede pagar.

## Cobrar como mesero

1. El negocio entra a Meseros (`/admin/meseros`) y crea una invitación. Sale un enlace y un QR; solo se ven en ese momento y vencen en 48 h.
2. El mesero abre el enlace, entra con su propia cuenta Pollar (no la del negocio) y acepta. Su cuenta pasa a ser de mesero.
3. Desde `/mesero` registra el consumo (monto libre o productos) y muestra el QR. El cliente lo paga igual que cualquier cobro.
4. Abajo ve sus QR del turno: esperando pago, pagado o vencido. Un QR vigente se puede volver a mostrar.
5. Para quitarle el acceso, el negocio usa “Dar de baja” en Meseros. Las invitaciones sin usar se pueden cancelar.

Una cuenta de negocio no puede ser mesero. Un mesero solo pertenece a un negocio a la vez.

## Pagar un cobro

1. Abrir el QR e iniciar sesión si hace falta. Un código lo usa una sola persona.
2. Con saldo en la wallet de Pollar: confirmar el envío al negocio.
3. Sin saldo: cargar pesos (SPEI u otro riel que Pollar ofrezca). El dinero entra primero a la wallet del cliente. Después hay que confirmar el envío al negocio. Ese segundo paso no es automático.
4. Tonki revisa la transferencia en la red. Si todavía no aparece, la pantalla reintenta.
5. Cuando la red confirma, el cobro pasa a confirmado y se acreditan los Tonkis. En el CRM la venta deja de estar pendiente.

Si el código ya venció pero el pago sí se confirmó, esa misma persona todavía puede recibir sus Tonkis.

## Ver las ventas

1. Entrar a CRM ventas (`/admin/crm`).
2. Resumen: ingresos, pendientes y horas pico del periodo.
3. Productos: alta y edición del catálogo que se usa al cobrar.
4. Ventas: listado por estado. Se puede filtrar por fechas y exportar CSV. Si un mesero generó el QR, la venta lo muestra (columna “generó” en el CSV; “Negocio” si no).

## Recompensas

1. Abrir Recompensas (`/rewards`).
2. Se ve el saldo de Tonkis, la tabla de líderes, la de consumos y el catálogo.
3. La empresa crea, edita o borra premios de su catálogo desde esa misma pantalla.
4. El cliente ve el premio, el costo en Tonkis y cuántos le faltan. Todavía no hay canje.

## Airdrop

1. En la barra inferior, Airdrop (solo empresa).
2. Configurar el activo y la campaña en Configurar.
3. Con Freighter, preparar y firmar el envío.
4. Stats e Historial muestran lo ya enviado.

Este camino usa Freighter, no la wallet de Pollar del cobro.

## Cuenta

1. Abrir Cuenta.
2. Cambiar foto, nombre y correo, y copiar la wallet si hay una.
3. El cliente ve aquí su saldo y los últimos Tonkis.
4. La empresa ve la ficha del negocio y los atajos a panel, CRM y QR.

## Activar las dinámicas en Stellar

Este flujo no corre solo. Hoy el modo es `off` y las dinámicas siguen solo en la base. Para encenderlas:

1. Subir el WASM `tonki-dynamic` una vez y anotar su hash.
2. En el servidor: `DYNAMIC_WASM_HASH`, `STELLAR_DEPLOYER_SECRET_KEY`, `DYNAMICS_HASH_SECRET` (32 caracteres o más) y `CRON_SECRET` (24 o más). La red sale de la config de Stellar que ya usa la app.
3. Aplicar la migración `20261111160000_dynamic_chain`.
4. Poner `DYNAMICS_CHAIN_MODE=shadow` (la base sigue mandando y el contrato se compara) o `on` (el contrato manda). Se puede limitar tipos con `DYNAMICS_CHAIN_KINDS`, por ejemplo `going,qr`.
5. Llamar con cron a `POST /api/internal/dynamics/chain` y `Authorization: Bearer <CRON_SECRET>`. Sin ese cron no se despliegan ni se cierran solas.
6. Las dinámicas viejas que sigan activas: `npm run chain:migrate` para simular y `npm run chain:migrate -- --apply` para pasarlas. Las ya cerradas se quedan como estaban.
7. Fondos: la cuenta que firma paga cada despliegue, cada participación y cada cierre. En modo `on`, si baja de 50 XLM (o el piso que se configure), no se pueden crear dinámicas nuevas.

En la publicación, “Activando la dinámica en Stellar…” significa que el cron todavía no confirmó el contrato. “No pudo activarse” significa que el despliegue falló y hay que reintentar el cron con `retryFailed=1`.
