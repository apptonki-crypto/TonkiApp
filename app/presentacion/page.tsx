import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  IconInstagram,
  IconX,
  socialIconLinkClass,
} from "@/src/components/SocialIcons";
import { FaqGroups } from "./FaqGroups";
import { PresentacionNav } from "./PresentacionNav";
import "./presentacion.css";

export const metadata: Metadata = {
  title: "Presentación — Tonki",
  description:
    "Presentación de Tonki para foro presencial: lealtad, CRM y recompensas para comercios locales y comensales.",
};

const problems = [
  {
    figure: "78%",
    label: "de las ventas de las PyMEs mexicanas siguen en efectivo",
    detail:
      "Las comisiones de la banca tradicional llegan hasta 5% por transacción. Dato del Banco de México.",
  },
  {
    figure: "92%",
    label: "de estos negocios operan sin datos de sus clientes",
    detail:
      "Pierden retención, control operativo y visibilidad de quién vuelve y quién no.",
  },
  {
    figure: "−20.81%",
    label: "cayó la retención entre 2019 y 2020",
    detail:
      "Después del COVID, miles de negocios quedaron más expuestos a la presión fiscal y a los costos de operar.",
  },
  {
    figure: "+90%",
    label: "subió el costo de conseguir un cliente",
    detail:
      "Publicar en redes o pagar vistas no responde la pregunta que importa: ¿quién llegó al local por esa inversión?",
  },
];

const values = [
  {
    title: "CRM de consumo",
    text: "Captura visitas reales y activa campañas, notificaciones y recompensas a la medida de cada cliente.",
    span: "xl:col-span-7",
  },
  {
    title: "Cashback dinámico",
    text: "Entre 1% y 5%, calculado por frecuencia de compra, para que la retención sea constante y no un cupón de temporada.",
    span: "xl:col-span-5",
  },
  {
    title: "Marketplace de mundo abierto",
    text: "Los puntos se redimen en cualquier negocio de la red. El comercio vecino trae clientes y el costo de adquisición baja.",
    span: "xl:col-span-5",
  },
  {
    title: "Publicidad que rinde",
    text: "El presupuesto publicitario puede convertirse en bonos estables respaldados en CETES. Ese rendimiento se libera en airdrops y campañas.",
    span: "xl:col-span-7",
  },
];

const origin = [
  {
    when: "Seis años",
    title: "De Beecoin a la colmena",
    text: "La pregunta fue cómo llevar blockchain a la vida diaria, conectada con activos reales, de forma fluida y accesible. Empezó con Beecoin, la certificación de Luis Ocón en el Instituto de Tecnología, Energía y Petróleo, y una asociación de apicultores: un año de producción de miel tokenizado como garantía para inversionistas.",
  },
  {
    when: "La filosofía",
    title: "La colmena crece junta",
    text: "Aprendimos de las abejas: la colmena entera crece por la fuerza de la comunidad. Por eso Tonki se construye sobre la red Stellar.",
  },
  {
    when: "Septiembre 2025",
    title: "Impacta Bootcamp",
    text: "Luis Ocón, CEO y cofundador, y Aldo Romero, cofundador, llevaron la visión al Demo Day: un contrato inteligente de airdrop que envía valor a muchas cuentas desde una sola, según frecuencia, visitas y consumo.",
  },
  {
    when: "El equipo",
    title: "Entra el CTO",
    text: "A ese avance se integró Raúl Hernández, CTO y cofundador. Talento 100% morelense.",
  },
  {
    when: "Scale",
    title: "13 de 85",
    text: "Tonki quedó entre los 13 proyectos de la primera generación Scale de Blockchain Acceleration Foundation y la Stellar Development Foundation, de más de 85 en México y América Latina. Sumó credenciales verificables y wallets sin fricción con Google Passkeys.",
  },
];

function AbdomenStripe() {
  return (
    <div className="flex h-2.5 w-full" aria-hidden>
      <span className="flex-1 bg-tonki-chrome" />
      <span className="flex-1 bg-tonki-accent" />
      <span className="flex-1 bg-tonki-chrome" />
      <span className="flex-1 bg-tonki-accent" />
      <span className="flex-1 bg-tonki-chrome" />
    </div>
  );
}

function SectionIntro({
  index,
  kicker,
  title,
  children,
  invert = false,
}: {
  index: string;
  kicker: string;
  title: string;
  children?: ReactNode;
  invert?: boolean;
}) {
  return (
    <header className="max-w-3xl">
      <p
        className={`text-xs font-bold tracking-[0.26em] uppercase ${
          invert ? "text-tonki-accent" : "text-tonki-cta"
        }`}
      >
        {index} · {kicker}
      </p>
      <h2
        className={`mt-3 text-3xl font-bold tracking-tight md:text-5xl md:leading-[1.05] ${
          invert ? "text-tonki-chrome-text" : "text-tonki-text"
        }`}
      >
        {title}
      </h2>
      {children ? (
        <div
          className={`mt-5 max-w-2xl text-lg leading-relaxed md:text-xl ${
            invert ? "text-tonki-chrome-text-secondary" : "text-tonki-text-secondary"
          }`}
        >
          {children}
        </div>
      ) : null}
    </header>
  );
}

export default function PresentacionPage() {
  return (
    <main className="presentacion bg-tonki-canvas text-tonki-text">
      <PresentacionNav />

      <section id="apertura" className="pres-hero relative overflow-hidden text-tonki-chrome-text">
        <div className="mx-auto flex min-h-[calc(100svh-4.25rem)] w-full max-w-7xl flex-col justify-center px-5 py-16 sm:px-8">
          <p className="pres-rise text-xs font-bold tracking-[0.32em] text-tonki-accent uppercase">
            Talento 100% morelense · @Tonkiapp
          </p>
          <h1 className="pres-rise pres-rise-2 mt-6 max-w-4xl text-4xl font-bold tracking-tight text-balance sm:text-6xl sm:leading-[0.98] lg:text-7xl">
            Controla y haz crecer tus ventas con nuestro CRM.
          </h1>
          <p className="pres-rise pres-rise-3 mt-6 max-w-2xl text-xl leading-relaxed text-tonki-chrome-text-secondary sm:text-2xl">
            Cada inversión en Tonki se traduce en resultados tangibles.
          </p>
        </div>
      </section>
      <AbdomenStripe />

      <section id="mision" className="px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-2">
          <article className="rounded-[1.75rem] border border-tonki-border bg-[#fff8df] p-7 sm:p-10">
            <p className="text-xs font-bold tracking-[0.26em] text-tonki-cta uppercase">
              02 · Misión
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Conectar al comercio local con quien lo sostiene.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-tonki-text-secondary">
              Una red colaborativa de fidelización y recompensas digitales.
              Tecnología accesible y transparente para impulsar la economía de
              barrio, no solo la de las apps grandes.
            </p>
          </article>
          <article className="rounded-[1.75rem] bg-tonki-chrome p-7 text-tonki-chrome-text sm:p-10">
            <p className="text-xs font-bold tracking-[0.26em] text-tonki-accent uppercase">
              02 · Visión
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Que cada compra diaria deje más en la mesa.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-tonki-chrome-text-secondary">
              Liderar el consumo inteligente en la región: una comunidad donde
              cada comercio prospere y cada persona obtenga más por lo que ya
              compra cerca de casa.
            </p>
          </article>
        </div>
      </section>

      <section id="origen" className="border-t border-tonki-border px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto w-full max-w-7xl">
          <SectionIntro index="03" kicker="Origen" title="De la colmena a la economía descentralizada">
            <p>
              Seis años respondiendo una sola pregunta: cómo escalar blockchain
              en la vida cotidiana, unida a activos del mundo real, sin pedirle
              a un restaurante que se vuelva experto en cripto.
            </p>
          </SectionIntro>
          <ol className="mt-12 max-w-3xl border-l-2 border-tonki-accent">
            {origin.map((step) => (
              <li key={step.title} className="relative py-6 pl-8">
                <span
                  className="absolute top-8 -left-[7px] h-3 w-3 rounded-full bg-tonki-accent ring-4 ring-tonki-canvas"
                  aria-hidden
                />
                <p className="text-xs font-bold tracking-[0.2em] text-tonki-cta uppercase">
                  {step.when}
                </p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight">{step.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-tonki-text-secondary md:text-lg">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="problema" className="bg-tonki-chrome px-5 py-16 text-tonki-chrome-text sm:px-8 sm:py-24">
        <div className="mx-auto w-full max-w-7xl">
          <SectionIntro
            index="04"
            kicker="El mercado"
            title="México opera a ciegas en el mostrador."
            invert
          >
            <p>
              Tonki no es solo una aplicación de puntos. Es un protocolo de
              finanzas, métricas y marketing para las PyMEs: blockchain y
              activos reales, sin fricción, para digitalizar la economía local.
            </p>
          </SectionIntro>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {problems.map((item) => (
              <article
                key={item.figure}
                className="rounded-2xl border border-tonki-chrome-border bg-tonki-chrome-elevated/40 p-6 sm:p-8"
              >
                <p className="text-5xl font-bold tracking-tight text-tonki-accent sm:text-6xl">
                  {item.figure}
                </p>
                <h3 className="mt-4 text-xl font-bold leading-snug">{item.label}</h3>
                <p className="mt-3 text-base leading-relaxed text-tonki-chrome-text-secondary">
                  {item.detail}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <AbdomenStripe />

      <section id="valor" className="px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto w-full max-w-7xl">
          <SectionIntro index="05" kicker="Propuesta" title="Lo que el comercio se lleva, y lo que paga.">
            <p>
              Menos comisión que la terminal de siempre, datos de visita real y
              una red donde el punto de un restaurante también sirve en el café
              de al lado.
            </p>
          </SectionIntro>

          <div className="mt-12 grid gap-4 xl:grid-cols-12">
            {values.map((item) => (
              <article
                key={item.title}
                className={`rounded-[1.5rem] border border-tonki-border bg-[#fff8df] p-6 sm:p-8 ${item.span}`}
              >
                <span className="block h-1.5 w-12 rounded-full bg-tonki-accent" aria-hidden />
                <h3 className="mt-5 text-2xl font-bold tracking-tight">{item.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-tonki-text-secondary md:text-lg">
                  {item.text}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-[1.5rem] bg-tonki-cta p-6 text-tonki-cta-fg sm:p-8">
              <p className="text-xs font-bold tracking-[0.22em] uppercase opacity-80">
                Modelo
              </p>
              <p className="mt-4 text-6xl font-bold tracking-tight sm:text-7xl">1%</p>
              <p className="mt-3 max-w-md text-lg leading-relaxed">
                Comisión base por transacción en Tonki Pay, con pasarela Polar.
                Muy por debajo de la banca tradicional. El SaaS cuesta 500 MXN al mes.
              </p>
            </article>
            <article className="rounded-[1.5rem] border border-tonki-border p-6 sm:p-8">
              <p className="text-xs font-bold tracking-[0.22em] text-tonki-cta uppercase">
                Tracción
              </p>
              <ul className="mt-5 space-y-4 text-base leading-relaxed text-tonki-text-secondary md:text-lg">
                <li>
                  Caso base: Restaurante El Campestre de Acatlipa, con una
                  migración inicial de 150 usuarios activos.
                </li>
                <li>
                  Uno de 13 proyectos de la primera generación Scale, entre más
                  de 85 de México y América Latina.
                </li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section id="tecnologia" className="border-t border-tonki-border px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto w-full max-w-7xl">
          <SectionIntro index="06" kicker="Tecnología" title="Blockchain que no se nota en la caja.">
            <p>
              Una base de datos compartida e inalterable: mueve valor y datos
              con certeza, sin un intermediario en medio. En Tonki esa capa
              queda detrás del QR, del NFC y del saldo en pesos.
            </p>
          </SectionIntro>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Stellar, por la colmena",
                text: "Igual que las abejas arman una estructura entre muchas, Stellar aporta una red abierta, rápida y escalable para meter a la economía mexicana al riel digital.",
              },
              {
                title: "Airdrops en Soroban",
                text: "Contratos inteligentes que reparten valor desde una sola cuenta, calculado con la frecuencia, las visitas y el consumo reales. No con un cupón genérico.",
              },
              {
                title: "Passkeys, sin frase semilla",
                text: "La wallet inteligente se crea con la llave del propio teléfono. La persona ve puntos y saldo. No ve una semilla de 24 palabras ni una exchange.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="flex flex-col rounded-[1.5rem] border border-tonki-border p-6 sm:p-7"
              >
                <h3 className="text-xl font-bold tracking-tight">{item.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-tonki-text-secondary">
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="finanzas" className="bg-[#fff8df] px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto w-full max-w-7xl">
          <SectionIntro
            index="07"
            kicker="Finanzas"
            title="El gasto en publicidad puede dejar de evaporarse."
          >
            <p>
              Finanzas abiertas, sin la fila del banco: enviar, cobrar y
              apartar presupuesto con contratos y comisiones mínimas. En el
              local se vive como Tonki Pay.
            </p>
          </SectionIntro>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <article className="rounded-[1.5rem] border border-tonki-border bg-tonki-canvas p-6 sm:p-8">
              <p className="text-xs font-bold tracking-[0.22em] text-tonki-cta uppercase">
                01 · Tonki Pay
              </p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight">
                Cobro con Polar, en el mostrador que ya tienen.
              </h3>
              <ul className="mt-5 space-y-4 text-base leading-relaxed text-tonki-text-secondary">
                <li>
                  Rampas de entrada y salida: el peso de siempre y el activo
                  digital se convierten dentro del mismo flujo.
                </li>
                <li>Comisión base de 1%, lejos de la terminal tradicional.</li>
                <li>
                  En camino: conexión directa con SPEI y CoDi para pagos
                  instantáneos en México.
                </li>
              </ul>
            </article>
            <article className="rounded-[1.5rem] bg-tonki-chrome p-6 text-tonki-chrome-text sm:p-8">
              <p className="text-xs font-bold tracking-[0.22em] text-tonki-accent uppercase">
                02 · Etherfuse
              </p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight">
                El presupuesto de ads, respaldado en CETES.
              </h3>
              <ul className="mt-5 space-y-4 text-base leading-relaxed text-tonki-chrome-text-secondary">
                <li>
                  Hoy ese dinero se consume en vistas. Con Etherfuse entra como
                  peso y sale como bono estable: el anuncio también ahorra.
                </li>
                <li>
                  El comercio decide cuándo congelar o soltar esos fondos para
                  campañas, airdrops de lealtad o un lugar prioritario en la red.
                </li>
              </ul>
            </article>
          </div>
        </div>
      </section>
      <AbdomenStripe />

      <section id="faq" className="px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto w-full max-w-7xl">
          <SectionIntro index="08" kicker="Preguntas" title="Dos listas. Una para la mesa, otra para la caja.">
            <p>
              Diez respuestas para quien se sienta a la mesa y diez para quien
              opera el negocio.
            </p>
          </SectionIntro>
          <div className="mt-12">
            <FaqGroups />
          </div>
        </div>
      </section>

      <footer className="border-t border-tonki-border px-5 py-14 sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.26em] text-tonki-cta uppercase">
              @Tonkiapp
            </p>
            <p className="mt-3 max-w-md text-2xl font-bold tracking-tight">
              La colmena crece cuando el comercio local crece.
            </p>
            <a
              href="mailto:support@tonki.io?subject=Foro%20Tonki"
              className="mt-4 inline-block font-semibold text-tonki-cta underline-offset-4 hover:underline"
            >
              support@tonki.io
            </a>
          </div>
          <div className="flex flex-col items-start gap-4">
            <nav aria-label="Redes sociales Tonki" className="flex gap-3">
              <a
                href="https://www.instagram.com/tonkiapp/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Tonki en Instagram"
                className={socialIconLinkClass}
              >
                <IconInstagram className="h-5 w-5" />
              </a>
              <a
                href="https://x.com/Tonkiapp"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Tonki en X"
                className={socialIconLinkClass}
              >
                <IconX className="h-[1.125rem] w-[1.125rem]" />
              </a>
            </nav>
            <Link href="/" className="text-sm font-semibold text-tonki-text-muted hover:text-tonki-cta">
              Volver al inicio
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
