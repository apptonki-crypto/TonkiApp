import type { Metadata } from "next";
import { FallbackNextImage } from "src/components/FallbackNextImage";
import {
  IconInstagram,
  IconX,
  socialIconLinkClass,
} from "@/src/components/SocialIcons";
import { PresentacionReveal } from "./PresentacionReveal";

export const metadata: Metadata = {
  title: "Tonki — Presentación para socios",
  description:
    "Presentación de producto y visión de Tonki para negocios locales en México.",
  robots: {
    index: false,
    follow: false,
  },
};

const pillars = [
  {
    title: "Lealtad medible",
    body: "Convierte cada visita en datos claros: frecuencia, ticket y clientes que vale la pena reactivar.",
  },
  {
    title: "Recompensas que importan",
    body: "Puntos Tonki en la plataforma y campañas con USDC o XLM cuando quieras premiar de verdad.",
  },
  {
    title: "Red de colmena",
    body: "Tu negocio no compite solo: aparece ante usuarios que ya buscan consumo local cerca de ellos.",
  },
] as const;

const steps = [
  {
    n: "01",
    title: "Activas tu local",
    body: "QR dinámico en tu caja. Sin hardware caro ni software pesado: corre en el navegador que ya usas.",
  },
  {
    n: "02",
    title: "Tus clientes acumulan",
    body: "Puntos por consumo real. Ellos ven recompensas; tú ves quién es top, nuevo o inactivo.",
  },
  {
    n: "03",
    title: "Diseñas la campaña",
    body: "Cashback, airdrops o beneficios propios. Tú defines reglas, montos y temporadas.",
  },
] as const;

const plans = [
  {
    name: "Tonki Starter",
    subtitle: "Lealtad simple para empezar a medir tu colmena.",
    price: 350,
    featured: false,
    cta: "Elegir Starter",
    features: [
      "QR dinámico en caja",
      "Puntos Tonki por consumo real",
      "Panel básico de clientes",
      "Ideal para un local que arranca",
    ],
  },
  {
    name: "Tonki Colmena",
    subtitle: "Campañas, cashback y red local trabajando por ti.",
    price: 500,
    featured: true,
    badge: "MÁS ELEGIDO",
    cta: "Elegir Colmena",
    features: [
      "Todo lo de Starter",
      "Airdrops y cashback en USDC o XLM",
      "Analítica de frecuencia y ticket",
      "Campañas de reactivación",
      "Presencia en la red de colmena",
    ],
  },
  {
    name: "Tonki Pro",
    subtitle: "El kit completo: marketing con agentes de IA.",
    price: 1000,
    featured: false,
    cta: "Elegir Pro",
    features: [
      "Todo lo de Colmena",
      "Agentes de IA enfocados en marketing",
      "Campañas avanzadas y beneficios extra",
      "Soporte prioritario",
      "Pensado para operar varios puntos",
    ],
  },
] as const;

function PlanCheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      className="mt-0.5 h-4 w-4 shrink-0 text-tonki-cta"
    >
      <path
        d="M16.25 5.75 8.5 14.25 3.75 9.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PresentacionPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-tonki-canvas text-tonki-text">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(244,197,66,0.28),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='70' viewBox='0 0 60 70' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l30 17.5v35L30 70 0 52.5v-35z' fill='none' stroke='%232d210d' stroke-width='1'/%3E%3C/svg%3E\")",
          backgroundSize: "48px 56px",
        }}
      />

      <div className="relative mx-auto w-full max-w-5xl px-6 py-14 sm:px-8 sm:py-20">
        <PresentacionReveal>
          <header className="text-center">
            <FallbackNextImage
              src="/Logos-Tonki-SVG/Logo%20superior%20caf-amarillo.svg"
              alt="Tonki"
              width={220}
              height={72}
              className="mx-auto h-14 w-auto sm:h-16"
              priority
            />
            <h1 className="mt-8 text-4xl font-bold tracking-tight text-tonki-accent md:text-5xl lg:text-6xl">
              Distribuimos valor 
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-tonki-text-secondary md:text-xl">
              La colmena de lealtad para negocios locales en México. Recompensas
              simples, ventas que crecen y valor que se queda en tu comunidad.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a
                href="mailto:support@tonki.io?subject=Presentaci%C3%B3n%20Tonki%20%E2%80%94%20Quiero%20conocer%20m%C3%A1s"
                className="rounded-xl bg-tonki-accent px-8 py-3 text-base font-semibold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover"
              >
                Agendar conversación
              </a>
              <a
                href="#producto"
                className="rounded-xl border border-tonki-border-strong px-8 py-3 text-base font-semibold text-tonki-text transition-colors hover:border-tonki-accent hover:text-tonki-accent"
              >
                Ver la propuesta
              </a>
            </div>
          </header>
        </PresentacionReveal>

        <PresentacionReveal delay={0.08}>
          <section
            className="mx-auto mt-20 max-w-3xl sm:mt-24"
            aria-labelledby="vision-heading"
          >
            <h2
              id="vision-heading"
              className="text-2xl font-semibold tracking-tight text-tonki-accent md:text-3xl"
            >
              Nuestra visión
            </h2>
            <p className="mt-4 text-base leading-relaxed text-tonki-text-secondary md:text-lg">
              Conectamos colmenas, distribuimos valor. Creemos que la lealtad no
              debería depender de apps de entrega ni de comisiones que erosionan
              márgenes. Tonki acerca a comercios y clientes con una red abierta
              donde cada peso gastado en el barrio fortalece el ecosistema local.
            </p>
          </section>
        </PresentacionReveal>

        <PresentacionReveal delay={0.1}>
          <section
            className="mx-auto mt-16 max-w-3xl sm:mt-20"
            aria-labelledby="problema-heading"
          >
            <h2
              id="problema-heading"
              className="text-2xl font-semibold tracking-tight text-tonki-accent md:text-3xl"
            >
              El problema
            </h2>
            <p className="mt-4 text-base leading-relaxed text-tonki-text-secondary md:text-lg">
              Más del 90&nbsp;% de la inversión en publicidad no genera el ROI
              esperado. Retener un cliente cuesta hasta 5&nbsp;veces menos que
              adquirir uno nuevo, y el costo de adquisición sigue subiendo. Los
              negocios locales pagan por impresiones que no regresan a la caja.
            </p>
          </section>
        </PresentacionReveal>

        <PresentacionReveal delay={0.12}>
          <section
            id="producto"
            className="mx-auto mt-16 max-w-3xl scroll-mt-8 sm:mt-20"
            aria-labelledby="producto-heading"
          >
            <h2
              id="producto-heading"
              className="text-2xl font-semibold tracking-tight text-tonki-accent md:text-3xl"
            >
              El producto
            </h2>
            <p className="mt-4 text-base leading-relaxed text-tonki-text-secondary md:text-lg">
              Llevamos tráfico a tu negocio: cada acción es medible y cada peso
              invertido es redituable. En lugar de pagar por impresiones, envías
              recompensas a quienes realmente consumen — Puntos Tonki en la
              plataforma y, cuando aplique, USDC o XLM a wallets no custodiales
              sobre Stellar.
            </p>

            <ul className="mt-10 space-y-8">
              {pillars.map((pillar) => (
                <li key={pillar.title}>
                  <h3 className="text-lg font-semibold tracking-tight text-tonki-text md:text-xl">
                    {pillar.title}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-tonki-text-secondary md:text-lg">
                    {pillar.body}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </PresentacionReveal>

        <PresentacionReveal delay={0.13}>
          <section
            className="mx-auto mt-16 max-w-3xl sm:mt-20"
            aria-labelledby="tonki-pay-heading"
          >
            <h2
              id="tonki-pay-heading"
              className="text-2xl font-semibold tracking-tight text-tonki-accent md:text-3xl"
            >
              Tonki Pay
            </h2>
            <p className="mt-4 text-base leading-relaxed text-tonki-text-secondary md:text-lg">
              Conexión vía SPEI: pagos rápidos e inmediatos, con la comisión más
              competitiva del mercado y sin terminal bancaria.
            </p>
          </section>
        </PresentacionReveal>

        <PresentacionReveal delay={0.14}>
          <section
            className="mx-auto mt-16 max-w-3xl sm:mt-20"
            aria-labelledby="como-heading"
          >
            <h2
              id="como-heading"
              className="text-2xl font-semibold tracking-tight text-tonki-accent md:text-3xl"
            >
              Cómo funciona
            </h2>
            <ol className="mt-8 space-y-8">
              {steps.map((step) => (
                <li key={step.n} className="flex gap-5">
                  <span
                    className="mt-0.5 shrink-0 font-semibold tabular-nums text-tonki-accent"
                    aria-hidden
                  >
                    {step.n}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-tonki-text md:text-xl">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-base leading-relaxed text-tonki-text-secondary md:text-lg">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </PresentacionReveal>

        <PresentacionReveal delay={0.16}>
          <section className="mt-16 sm:mt-20" aria-labelledby="modelo-heading">
            <div className="text-center">
              <h2
                id="modelo-heading"
                className="text-2xl font-semibold tracking-tight text-tonki-text md:text-3xl"
              >
                Suscripción mensual —{" "}
                <span className="text-tonki-cta">tu colmena trabajando</span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-tonki-text-secondary md:text-lg">
                SaaS desde 17 hasta 100 USD. Airdrops, cashback y agentes de IA
                para marketing, con comisiones pensadas para proteger tus
                márgenes.
              </p>
            </div>

            <div className="mt-12 grid items-stretch gap-6 md:grid-cols-3 md:gap-5 lg:gap-6">
              {plans.map((plan) => (
                <article
                  key={plan.name}
                  className={`relative flex flex-col rounded-2xl border bg-tonki-surface p-6 shadow-[0_18px_40px_-18px_rgba(45,33,13,0.28)] sm:p-7 ${
                    plan.featured
                      ? "border-tonki-cta/35 ring-1 ring-tonki-cta/20 md:-mt-3 md:mb-[-0.75rem] md:pb-8"
                      : "border-tonki-border"
                  }`}
                >
                  {"badge" in plan && plan.badge ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-tonki-cta px-3 py-1 text-[11px] font-semibold tracking-wide text-tonki-cta-fg uppercase">
                      {plan.badge}
                    </span>
                  ) : null}

                  <h3 className="text-lg font-semibold tracking-tight text-tonki-text md:text-xl">
                    {plan.name}
                  </h3>
                  <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-tonki-text-muted">
                    {plan.subtitle}
                  </p>

                  <p className="mt-5 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight text-tonki-cta tabular-nums md:text-5xl">
                      ${plan.price}
                    </span>
                    <span className="text-sm font-medium text-tonki-text-muted">
                      /mes
                    </span>
                  </p>

                  <ul className="mt-6 flex flex-1 flex-col gap-3">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex gap-2.5 text-sm leading-snug text-tonki-text-secondary"
                      >
                        <PlanCheckIcon />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href={`mailto:support@tonki.io?subject=${encodeURIComponent(
                      `Presentación Tonki — Quiero ${plan.name}`,
                    )}`}
                    className={`mt-8 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-center text-sm font-semibold transition-colors ${
                      plan.featured
                        ? "bg-tonki-cta text-tonki-cta-fg hover:bg-tonki-cta-hover"
                        : "border border-tonki-cta/50 text-tonki-cta hover:border-tonki-cta hover:bg-tonki-cta/10"
                    }`}
                  >
                    {plan.cta}
                  </a>
                </article>
              ))}
            </div>
          </section>
        </PresentacionReveal>

        <PresentacionReveal delay={0.18}>
          <section
            className="mx-auto mt-16 max-w-3xl rounded-2xl border border-tonki-border bg-tonki-surface p-8 text-center shadow-sm sm:mt-20 sm:p-10"
            aria-labelledby="contacto-heading"
          >
            <h2
              id="contacto-heading"
              className="text-2xl font-semibold tracking-tight text-tonki-accent md:text-3xl"
            >
              Unete
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-tonki-text-secondary md:text-lg">
              Charlemos y conoce los tonki beneficios a detalle.
            </p>
            <a
              href="mailto:support@tonki.io?subject=Presentaci%C3%B3n%20Tonki%20%E2%80%94%20Quiero%20conocer%20m%C3%A1s"
              className="mt-8 inline-flex rounded-xl bg-tonki-cta px-8 py-3 text-base font-semibold text-tonki-cta-fg transition-colors hover:bg-tonki-cta-hover"
            >
              support@tonki.io
            </a>
            <nav
              aria-label="Redes sociales Tonki"
              className="mt-8 flex flex-wrap items-center justify-center gap-4"
            >
              <a
                href="https://www.instagram.com/tonkiapp/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Tonki en Instagram"
                title="Instagram"
                className={socialIconLinkClass}
              >
                <IconInstagram className="h-5 w-5" />
              </a>
              <a
                href="https://x.com/Tonkiapp"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Tonki en X"
                title="X"
                className={socialIconLinkClass}
              >
                <IconX className="h-[1.125rem] w-[1.125rem]" />
              </a>
            </nav>
          </section>
        </PresentacionReveal>

        <p className="mt-12 text-center text-sm text-tonki-text-muted sm:mt-16">
          © {new Date().getFullYear()} Tonki · Presentación privada
        </p>
      </div>
    </main>
  );
}
