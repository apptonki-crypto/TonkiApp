"use client";

import { useId, useState } from "react";
import { dinerFaqs, merchantFaqs, type FaqItem } from "./faq-data";

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FaqList({
  items,
  tone,
  labelledBy,
}: {
  items: FaqItem[];
  tone: "diner" | "merchant";
  labelledBy: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const baseId = useId();

  return (
    <ol
      className={`pres-faq-list ${tone === "diner" ? "pres-faq-diner" : "pres-faq-merchant"}`}
      aria-labelledby={labelledBy}
    >
      {items.map((item, index) => {
        const open = openIndex === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;
        return (
          <li key={item.question} className="pres-faq-item" data-open={open}>
            <h4>
              <button
                id={buttonId}
                type="button"
                className="pres-faq-trigger"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? null : index)}
              >
                <span className="pres-faq-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="pres-faq-question">{item.question}</span>
                <span className="pres-faq-chevron">
                  <Chevron />
                </span>
              </button>
            </h4>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              aria-hidden={!open}
              className="pres-faq-collapse"
            >
              <div className="pres-faq-collapse-inner">
                <p className="pres-faq-answer">{item.answer}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function FaqGroups() {
  return (
    <div className="grid items-start gap-8 xl:grid-cols-2 xl:gap-6">
      <section
        aria-labelledby="faq-usuarios"
        className="rounded-[1.75rem] border border-tonki-border bg-[#fff8df] p-4 sm:p-6"
      >
        <div className="mb-5 px-1">
          <p className="text-xs font-bold tracking-[0.22em] text-tonki-cta uppercase">
            Para quien come
          </p>
          <h3
            id="faq-usuarios"
            className="mt-2 text-2xl font-bold tracking-tight text-tonki-text md:text-3xl"
          >
            Usuarios y comensales
          </h3>
          <p className="mt-2 text-base leading-relaxed text-tonki-text-secondary">
            Registro gratis, puntos, cashback y cómo entra alguien al local
            sin descargar una app.
          </p>
        </div>
        <FaqList items={dinerFaqs} tone="diner" labelledBy="faq-usuarios" />
      </section>

      <section
        aria-labelledby="faq-empresas"
        className="rounded-[1.15rem] bg-tonki-chrome p-4 text-tonki-chrome-text sm:p-6"
      >
        <div className="mb-5 px-1">
          <p className="text-xs font-bold tracking-[0.22em] text-tonki-accent uppercase">
            Para quien vende
          </p>
          <h3
            id="faq-empresas"
            className="mt-2 text-2xl font-bold tracking-tight md:text-3xl"
          >
            Empresas y comercios
          </h3>
          <p className="mt-2 text-base leading-relaxed text-tonki-chrome-text-secondary">
            Alta del negocio, cobro, comisiones, recompensas y qué pasa en
            hora pico frente a la caja.
          </p>
        </div>
        <FaqList
          items={merchantFaqs}
          tone="merchant"
          labelledBy="faq-empresas"
        />
      </section>
    </div>
  );
}
