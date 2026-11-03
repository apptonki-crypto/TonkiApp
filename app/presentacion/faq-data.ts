export type FaqItem = {
  question: string;
  answer: string;
};

export const dinerFaqs: FaqItem[] = [
  {
    question: "¿Qué es Tonki y tiene algún costo registrarme?",
    answer:
      "Tonki es una plataforma de lealtad y beneficios para comercios locales. Registrarte y crear tu cuenta es 100% gratis. No pagas membresías ni cuotas ocultas para empezar a acumular recompensas en tus lugares favoritos.",
  },
  {
    question: "¿Necesito descargar una app de la App Store o Google Play?",
    answer:
      "No. Tonki funciona como una aplicación web optimizada (PWA). No tienes que descargar nada pesado; entras directo desde el navegador de tu celular escaneando el código QR del local o acercando tu teléfono al chip NFC, y todo corre al instante.",
  },
  {
    question:
      "¿Cómo funciona la “wallet” si no sé de criptomonedas ni manejo dinero digital?",
    answer:
      "No tienes que preocuparte por tecnicismos. La wallet en Tonki opera de forma invisible en segundo plano exclusivamente para autenticar tu cuenta de forma segura (sin contraseñas complejas) y permitirte recibir puntos, airdrops y hacer pagos o cashback digital de manera transparente. Tú solo ves tu saldo y tus puntos en pesos de forma muy amigable.",
  },
  {
    question:
      "¿Qué pasa si cambio de teléfono celular o cierro sesión, pierdo mis puntos y mi saldo?",
    answer:
      "Absolutamente no. Como tu acceso está vinculado de forma segura a tus credenciales (como tu correo o Passkey), al ingresar nuevamente desde cualquier otro dispositivo con tus datos, tu panel, tus Puntos Tonki y tu saldo estarán intactos.",
  },
  {
    question: "¿Los Puntos Tonki caducan si no los uso rápido?",
    answer:
      "A diferencia de los programas tradicionales de grandes corporativos que te quitan tus beneficios cada año, en Tonki creemos que tu lealtad es tuya. Tus puntos no tienen fechas de caducidad agresivas para presionarte.",
  },
  {
    question:
      "¿Puedo usar los puntos que gano en un restaurante en cualquier otro negocio de la red?",
    answer:
      "¡Sí! Esa es la magia de pertenecer a la colmena. Los puntos y beneficios que acumulas apoyando el consumo local pueden dinamizarse y utilizarse dentro de la red abierta de comercios aliados a Tonki.",
  },
  {
    question:
      "¿Tengo que registrar mi tarjeta bancaria real obligatoriamente para usar la app?",
    answer:
      "No. Puedes empezar a utilizar Tonki de forma completamente gratuita acumulando tus puntos y canjeando recompensas en los establecimientos sin necesidad de ingresar datos bancarios.",
  },
  {
    question:
      "¿Cómo se aplica el cashback o los pagos digitales dentro de la plataforma?",
    answer:
      "Cuando realizas un pago o consumo elegible a través de Tonki Pay, el sistema procesa de forma instantánea el equivalente en MXNe (pesos digitales estables) o te otorga tu porcentaje de cashback directamente a tu panel digital de forma automática.",
  },
  {
    question:
      "¿Qué tan seguros están mis datos personales y de consumo en la app web?",
    answer:
      "Utilizamos estándares avanzados de encriptación y autenticación moderna. Tu información está protegida bajo estrictas normas de privacidad y jamás vendemos tus datos a terceros.",
  },
  {
    question:
      "¿Qué hago si tengo un problema con mis puntos o un establecimiento no reconoce mi saldo?",
    answer:
      "Puedes reportarlo directamente desde el centro de soporte en la app web. Nuestro equipo revisará el registro digital de la transacción para solucionarlo de inmediato y asegurar que tu recompensa sea respetada.",
  },
];

export const merchantFaqs: FaqItem[] = [
  {
    question:
      "¿Qué necesita mi negocio para empezar a aceptar Tonki en el mostrador?",
    answer:
      "Cero hardware costoso o terminales estorbosas. Te entregamos un display físico con código QR dinámico y chip NFC optimizado para tu caja o barra. Tus clientes solo escanean o acercan el celular y el sistema valida todo al instante.",
  },
  {
    question:
      "¿Es necesario instalar software o programas complejos en las computadoras del local?",
    answer:
      "No. Todo opera desde cualquier navegador web en una tablet, computadora o celular que ya tengas en la caja, sin instalaciones pesadas ni requerir sistemas operativos específicos.",
  },
  {
    question:
      "¿Cómo maneja Tonki los cobros, las ventas y el dinero que generan las transacciones?",
    answer:
      "Tonki Pay simplifica la operación registrando las ventas de forma digital. La plataforma se apoya en infraestructura de alta velocidad (como la red Stellar) para garantizar que los registros y las liquidaciones sean instantáneos y transparentes, conectando de forma limpia con los flujos de cobro en MXNe o moneda nacional.",
  },
  {
    question:
      "¿Esto me ayuda a atraer clientes nuevos o solo premia a los que ya frecuentan mi negocio?",
    answer:
      "Funciona para ambas cosas. No estás operando en solitario: formas parte de una red inteligente (“la colmena”) donde tu negocio aparece en el radar de usuarios activos que buscan opciones cerca de su ubicación (drive-to-store orgánico).",
  },
  {
    question: "¿Qué comisión cobra Tonki por cada transacción o venta procesada?",
    answer:
      "Mantenemos un esquema altamente competitivo y transparente por transacción, diseñado específicamente para cuidar y proteger los márgenes de ganancia de los restaurantes y pequeños comercios frente a las altas comisiones de la banca tradicional o apps de entrega.",
  },
  {
    question:
      "¿Puedo configurar libremente qué recompensas, puntos o porcentajes de cashback ofrezco?",
    answer:
      "¡Totalmente! Desde tu panel de administración empresarial tienes el control absoluto: tú decides qué regalar (un postre, un café, un descuento) y cuántos puntos o reglas aplican según la temporada o rentabilidad de tu negocio.",
  },
  {
    question:
      "¿Qué pasa si un cliente tiene un problema técnico con sus puntos frente a la caja en plena hora pico?",
    answer:
      "El sistema está diseñado para ser ultrarrápido y evitar filas. Si hay una incidencia excepcional, el cobro regular puede proceder de inmediato y el soporte técnico de Tonki se encarga de atender al usuario a través de la app para no saturar al personal del restaurante.",
  },
  {
    question:
      "¿Cómo evitamos fraudes o que un cliente intente duplicar recompensas o puntos?",
    answer:
      "Cada interacción de lealtad y cada movimiento en Tonki queda registrado de manera segura e inalterable en el sistema. Los códigos QR y los accesos cambian dinámicamente, haciendo imposible la falsificación de puntos o cupones.",
  },
  {
    question:
      "¿El sistema me entrega métricas claras sobre el comportamiento de mis clientes?",
    answer:
      "Sí. Tu panel de control te muestra analíticas de rendimiento: cuántos clientes nuevos llegaron, quiénes son tus compradores más frecuentes, qué recompensas tienen más éxito y cuál es tu retorno de inversión real.",
  },
  {
    question:
      "¿Cómo es el proceso para darme de alta y empezar a operar en mi restaurante?",
    answer:
      "Es muy sencillo. Te registramos, configuramos el perfil de tu menú y recompensas, te entregamos tu material físico (displays con QR/NFC) y tu personal recibe una capacitación exprés de 10 minutos para empezar a operar el mismo día sin fricciones.",
  },
];
