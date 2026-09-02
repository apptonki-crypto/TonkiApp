"use client";

import { useId, useState } from "react";

export type FaqItem = {
  question: string;
  answer: string;
};

function FaqAccordionItem({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  const buttonId = useId();
  const panelId = useId();

  return (
    <li>
      <div className="py-1">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className="relative w-full cursor-pointer py-5 pr-8 text-left text-base font-semibold leading-snug text-tonki-text transition-colors hover:text-tonki-cta sm:text-lg"
        >
          {item.question}
          <span
            aria-hidden
            className={`absolute right-0 top-5 flex h-6 w-6 items-center justify-center text-tonki-text-muted transition-transform duration-500 ease-in-out motion-reduce:transition-none ${
              open ? "rotate-45" : "rotate-0"
            }`}
          >
            +
          </span>
        </button>
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className="grid transition-[grid-template-rows] duration-500 ease-in-out motion-reduce:transition-none"
          style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        >
          <div className="min-h-0 overflow-hidden">
            <p
              className={`pb-5 pr-8 text-base leading-relaxed text-tonki-text-secondary transition-[opacity,transform] duration-500 ease-in-out motion-reduce:transition-none md:text-lg ${
                open
                  ? "translate-y-0 opacity-100"
                  : "-translate-y-2 opacity-0"
              }`}
            >
              {item.answer}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  return (
    <ul className="divide-y divide-tonki-border border-y border-tonki-border">
      {items.map((item) => (
        <FaqAccordionItem key={item.question} item={item} />
      ))}
    </ul>
  );
}
