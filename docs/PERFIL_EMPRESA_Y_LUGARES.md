# Perfil de empresa y lugares — resumen para dirección

11 de noviembre de 2026.

## En una frase

Una empresa nueva no entra a Tonki hasta llenar, una sola vez, la ficha que van a ver sus clientes. Esa ficha vive en Lugares, que ahora se recorre como un panal.

Los cobros siguen como están documentados aparte: el cliente paga, Tonki comprueba el pago y entonces acredita Tonkis.

## Qué ve la empresa

La primera vez que entra con Pollar, si es cuenta de empresa y todavía no tiene perfil, Tonki la lleva a un formulario y no la deja pasar.

Pide lo que sale en la página pública: nombre, categoría, descripción, dirección, teléfono y al menos un día de horario. El porcentaje de Tonkis se puede dejar en 5. Logo, sitio web y mapa son opcionales.

Al guardar, entra al panel. No se le vuelve a pedir. Si quiere cambiar algo, lo hace desde Cuenta, donde además puede subir hasta ocho fotos y ver cómo quedó la página pública.

Las empresas que ya tenían esos datos completos no ven el formulario. La base las marcó como listas.

Un cliente nunca ve esta pantalla.

## Qué ve el cliente

**Lugares** (`/negocios`) muestra todos los negocios en un panal.

- Si no ha iniciado sesión, o si es la propia empresa, es un directorio: toca una celda y se abre la ficha.
- Si es cliente, sus lugares visitados se encienden en el centro y, cuando quedan juntos, se unen con un puente. Una visita cuenta cuando el consumo ya le acreditó Tonkis o cuando escaneó el QR de presentación del negocio. Es una por día: escanear y pagar el mismo día cuenta una vez.
- Cada visita nueva se ve: la celda vuela a su hueco y se enciende (primera vez) o rebota con “+1 visita”. Pasa al escanear el QR y también después de pagar un consumo, aunque no se haya escaneado nada.
- Puede buscar por nombre o categoría. La ficha se puede compartir con un enlace (`?lugar=`).

La ficha muestra logo, fotos, categoría, si está abierto ahora, el porcentaje de Tonkis, descripción, teléfono, cómo llegar, sitio web y el horario de la semana.

Desde el feed, al abrir a una persona solo se ve su nombre, su foto, desde cuándo está en Tonki y, si tiene negocio, un enlace a ese lugar. No se muestra su correo ni su wallet.

En Cuenta, el cliente ve su saldo de Tonkis y los últimos movimientos. La empresa ve su ficha y atajos al panel, al CRM, al QR de cobro y al QR de presentación.

## QR de presentación

Cada negocio tiene un QR fijo para su mostrador (Admin → QR del local). Se descarga o se imprime como cartel. El cliente lo escanea y el lugar se suma a su colmena. No mueve dinero ni da Tonkis. Si el código se copia fuera del local, el negocio genera uno nuevo y el anterior deja de servir.

## Qué ya está hecho

- El alta obligatoria, una sola vez, después del primer ingreso con Pollar.
- La misma información publicada en la ficha del negocio.
- Lugares como panal, con visitas del cliente en el centro.
- QR de presentación por negocio y animación de cada visita nueva en el panal. Requiere aplicar la migración `20261117190000_establishment_presentation_qr` en producción.
- Perfil de cuenta y ventana de persona del feed con la misma presentación.
- La base de producción ya tiene la marca de “perfil completo”. Sin esa columna, el login con Pollar fallaba; ya quedó aplicada.

## Qué no cambia

- El cobro, la wallet y el cashback siguen igual. Esta ficha no sustituye la wallet: un negocio sin dirección Stellar válida sigue sin poder cobrar.
- No se obliga a subir fotos ni mapa para empezar a operar.
- Un negocio que ya existía y le faltaban datos sigue apareciendo en Lugares. La obligación de completar aplica a las empresas que entran a partir de ahora, y a las que la migración no pudo marcar porque les faltaba algún dato.

## Qué falta para operarlo

| Tema | Situación | Quién lo desbloquea |
|---|---|---|
| Publicar este build | El código y la base ya están. El sitio publicado tiene que ser este build | Deploy |
| Wallet de cada negocio | La ficha puede estar completa y el cobro seguir bloqueado | Cada admin, en su cuenta |
| Fotos y mapa | Opcionales. La ficha se ve mejor con ellos | Cada admin, desde Cuenta |
| Probar el alta con una empresa nueva | Hace falta una cuenta `admin` que nunca haya completado el perfil | Operación, con un alta de prueba |

## Lectura técnica

Para ingeniería: [`PERFIL_EMPRESA_Y_LUGARES_TECNICO.md`](./PERFIL_EMPRESA_Y_LUGARES_TECNICO.md). Cobros: [`COBROS_POLLAR.md`](./COBROS_POLLAR.md).
