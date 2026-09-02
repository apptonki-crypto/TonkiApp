"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type PresentacionRevealProps = {
  children: ReactNode;
  delay?: number;
};

/** Fade/slide-in on enter; respects prefers-reduced-motion. */
export function PresentacionReveal({
  children,
  delay = 0,
}: PresentacionRevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
