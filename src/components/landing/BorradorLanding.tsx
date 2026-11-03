import { Inter, Sora } from "next/font/google";
import Link from "next/link";
import { IconInstagram, IconX } from "@/src/components/SocialIcons";
import "./landing.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-sora",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-inter",
});

const steps = [
  {
    icon: "/landing/icon-store.png",
    title: "Registra tu negocio",
    text: "Crea tu cuenta y configura tu negocio en minutos.",
  },
  {
    icon: "/landing/icon-gift.png",
    title: "Crea recompensas",
    text: "Diseña recompensas atractivas y define tus reglas.",
  },
  {
    icon: "/landing/icon-people.png",
    title: "Tus clientes acumulan puntos",
    text: "Ellos compran, escanean y acumulan Tonki Points.",
  },
  {
    icon: "/landing/icon-star.png",
    title: "Regresan y canjean",
    text: "Canjean recompensas y vuelven por más.",
  },
];

const businessPoints = [
  {
    icon: "/landing/icon-gifts.png",
    title: "Activa recompensas en minutos",
    text: "Crea tu catálogo de recompensas y establece reglas simples.",
  },
  {
    icon: "/landing/icon-person.png",
    title: "Más clientes frecuentes",
    text: "Tus clientes canjean premios y regresan una y otra vez.",
  },
  {
    icon: "/landing/icon-heart.png",
    title: "Clientes que regresan",
    text: "Conoce el comportamiento de tus clientes y toma mejores decisiones.",
  },
];

const clientPoints = [
  {
    icon: "/landing/icon-comb.png",
    title: "Acumula en todos lados",
    text: "Gana puntos cada vez que compres en negocios afiliados.",
  },
  {
    icon: "/landing/icon-gifts.png",
    title: "Canjea recompensas increíbles",
    text: "Disfruta bebidas, descuentos y más beneficios exclusivos.",
  },
  {
    icon: "/landing/icon-phone.png",
    title: "Todo en un solo lugar",
    text: "Revisa tu saldo, historial y recompensas desde la app.",
  },
];

function HexOutline({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div className={`b-hex ${className}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon
          points="50,3 94,27 94,73 50,97 6,73 6,27"
          fill="none"
          stroke="#e3a51a"
          strokeWidth="2.4"
        />
      </svg>
      <img src={src} alt={alt} />
    </div>
  );
}

function Arrow() {
  return (
    <span className="b-arrow" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12h14M13 6l6 6-6 6"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function BorradorLanding() {
  return (
    <div className={`borrador ${sora.variable} ${inter.variable}`}>
      <header className="b-header">
        <Link href="/" className="b-brand" aria-label="Tonki inicio">
          <img src="/Logos-Tonki-SVG/Isotipo caf-amarillo.svg" alt="" />
          <span>TONKI</span>
        </Link>
        <nav className="b-nav" aria-label="Secciones">
          <a href="#contacto">Contacto</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#caracteristicas">Características</a>
          <a href="/presentacion#faq">FAQ</a>
        </nav>
        <Link href="/login" className="b-login">
          Iniciar sesión
        </Link>
      </header>

      <section className="b-hero" aria-labelledby="hero-title">
        <div className="b-hero-shade" aria-hidden="true" />
        <div className="b-hero-grid">
          <div>
            <h1 id="hero-title">
              Recompensas que conectan negocios y personas
            </h1>
            <p className="b-hero-lead">
              Tonki ayuda a los negocios a fidelizar clientes y a las personas
              a ganar recompensas en sus lugares favoritos.
            </p>
            <div className="b-choices">
              <Link href="/login" className="b-choice b-choice-light">
                <img src="/Logos-Tonki-SVG/Isotipo amarillo-caf.svg" alt="" />
                <span>
                  <strong>Soy cliente</strong>
                  <span>Quiero obtener recompensas</span>
                </span>
                <Arrow />
              </Link>
              <Link href="/login" className="b-choice b-choice-dark">
                <img src="/Logos-Tonki-SVG/Isotipo amarillo-caf.svg" alt="" />
                <span>
                  <strong>Soy negocio</strong>
                  <span>Quiero activar Tonki</span>
                </span>
                <Arrow />
              </Link>
            </div>
          </div>
          <img
            className="b-phone"
            src="/landing/phone.png"
            alt="App de Tonki con saldo de puntos y actividad reciente"
          />
        </div>
      </section>

      <section className="b-section" id="como-funciona">
        <div className="b-wrap">
          <h2 className="b-how-title">¿Cómo funciona Tonki?</h2>
          <svg className="b-branches" viewBox="0 0 720 54" aria-hidden="true">
            <path
              d="M40 50 C 140 50, 180 8, 360 8"
              fill="none"
              stroke="#e3a51a"
              strokeWidth="2.5"
            />
            <path
              d="M680 50 C 580 50, 540 8, 360 8"
              fill="none"
              stroke="#e3a51a"
              strokeWidth="2.5"
            />
          </svg>
          <div className="b-steps">
            {steps.map((step) => (
              <article key={step.title} className="b-step">
                <HexOutline src={step.icon} alt="" />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="b-section b-benefits" id="caracteristicas">
        <div className="b-wrap b-benefits-grid">
          <article>
            <p className="b-kicker">Para negocios</p>
            <h3>Convierte cada consumo en una razón para regresar</h3>
            <p className="b-intro">
              Fideliza clientes, aumenta tu frecuencia de visitas y haz crecer
              tu negocio con el poder del cashback.
            </p>
            {businessPoints.map((point) => (
              <div key={point.title} className="b-point">
                <HexOutline src={point.icon} alt="" className="b-point-hex" />
                <p>
                  <strong>{point.title}</strong>
                  <span>{point.text}</span>
                </p>
              </div>
            ))}
          </article>

          <img
            className="b-center-mark"
            src="/Logos-Tonki-SVG/Isotipo caf-amarillo.svg"
            alt=""
          />

          <article className="b-client">
            <p className="b-kicker">Para clientes</p>
            <h3>Una sola cuenta para todos tus lugares favoritos</h3>
            <p className="b-intro">
              Acumula Tonki en cualquier negocio afiliado y disfruta beneficios
              pensados en ti.
            </p>
            {clientPoints.map((point) => (
              <div key={point.title} className="b-point">
                <HexOutline src={point.icon} alt="" className="b-point-hex" />
                <p>
                  <strong>{point.title}</strong>
                  <span>{point.text}</span>
                </p>
              </div>
            ))}
            <img
              className="b-cup"
              src="/landing/coffee.png"
              alt="Vaso de café con el hexágono de Tonki"
            />
          </article>
        </div>
      </section>

      <section className="b-hive" aria-labelledby="hive-title">
        <div className="b-wrap">
          <h2 id="hive-title">
            Activa recompensas, fideliza clientes y crece dentro de la colmena
            TONKI
          </h2>
          <p className="b-sub">
            Una red colaborativa donde negocios y personas se benefician
            mutuamente. Entre más participas, más crece la colmena.
          </p>
          <div className="b-hive-map">
            <svg className="b-arcs" viewBox="0 0 1000 360" aria-hidden="true">
              <ellipse
                cx="220"
                cy="190"
                rx="170"
                ry="120"
                fill="none"
                stroke="#e3a51a"
                strokeWidth="2"
                strokeDasharray="1.5 7"
              />
              <ellipse
                cx="780"
                cy="190"
                rx="170"
                ry="120"
                fill="none"
                stroke="#e3a51a"
                strokeWidth="2"
                strokeDasharray="1.5 7"
              />
              <path
                d="M390 190 H610"
                stroke="#e3a51a"
                strokeWidth="2"
                strokeDasharray="1.5 7"
              />
            </svg>
            <div className="b-cluster" aria-hidden="true">
              <span className="b-node b-node-user" style={{ left: "8%", top: "18%" }}>
                <img src="/landing/icon-user.png" alt="" />
              </span>
              <span className="b-node b-node-user" style={{ left: "62%", top: "8%" }}>
                <img src="/landing/icon-user.png" alt="" />
              </span>
              <span className="b-node b-node-store" style={{ left: "28%", top: "34%" }}>
                <img src="/landing/icon-store.png" alt="" />
              </span>
              <span className="b-node b-node-user" style={{ left: "58%", top: "68%" }}>
                <img src="/landing/icon-user.png" alt="" />
              </span>
              <span className="b-node b-node-user" style={{ left: "6%", top: "72%" }}>
                <img src="/landing/icon-user.png" alt="" />
              </span>
            </div>
            <img
              className="b-logo-stack"
              src="/landing/logo-vertical.png"
              alt="Tonki"
            />
            <div className="b-cluster" aria-hidden="true">
              <span className="b-node b-node-user" style={{ right: "62%", top: "10%" }}>
                <img src="/landing/icon-user.png" alt="" />
              </span>
              <span className="b-node b-node-user" style={{ right: "8%", top: "16%" }}>
                <img src="/landing/icon-user.png" alt="" />
              </span>
              <span className="b-node b-node-store" style={{ right: "28%", top: "34%" }}>
                <img src="/landing/icon-store.png" alt="" />
              </span>
              <span className="b-node b-node-user" style={{ right: "8%", top: "70%" }}>
                <img src="/landing/icon-user.png" alt="" />
              </span>
              <span className="b-node b-node-user" style={{ right: "58%", top: "72%" }}>
                <img src="/landing/icon-user.png" alt="" />
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="b-cta">
        <div className="b-cta-blob b-cta-blob-l" aria-hidden="true" />
        <div className="b-cta-blob b-cta-blob-r" aria-hidden="true" />
        <div className="b-cta-inner">
          <div>
            <h2>
              Empieza a construir
              <br />
              tu colmena
            </h2>
            <p>
              Únete a miles de negocios y clientes que ya están disfrutando los
              beneficios de TONKI.
            </p>
          </div>
          <Link href="/login" className="b-cta-btn">
            Comenzar ahora
          </Link>
        </div>
      </section>

      <footer className="b-footer" id="contacto">
        <div className="b-footer-brand">
          <img src="/Logos-Tonki-SVG/Isotipo caf-amarillo.svg" alt="" />
          <div>
            <strong>TONKI</strong>
            <span>Recompensas que conectan.</span>
          </div>
        </div>
        <a className="b-footer-contact" href="mailto:hola@tonki.io">
          <small>Contacto</small>
          support@tonki.io
        </a>
        <nav className="b-socials" aria-label="Redes sociales Tonki">
          <a
            href="https://www.instagram.com/tonkiapp/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Tonki en Instagram"
          >
            <IconInstagram className="h-5 w-5" />
          </a>
          <a
            href="https://x.com/Tonkiapp"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Tonki en X"
          >
            <IconX className="h-5 w-5" />
          </a>
        </nav>
        <p className="b-legal">
          Aviso de privacidad · Términos y condiciones
          <br />© {new Date().getFullYear()} Tonki. Todos los derechos
          reservados.
        </p>
      </footer>
    </div>
  );
}
