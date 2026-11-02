"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ScrollHeroSequenceProps {
  children: ReactNode;
  className?: string;
}

// Seeded's hero entrance: as the hero scrolls past, headline content
// scales/fades slightly and the ambient mesh (rendered separately, behind
// this) reads as pulling away — a scroll-orchestrated moment instead of a
// static hero. Built on the exact useScroll/useTransform pattern Parallax
// (components/shared/parallax.tsx) already proved in this codebase, just
// mapping progress to scale+opacity instead of a y-offset. Disabled under
// reduce-motion — content stays fully visible and unscaled.
export function ScrollHeroSequence({ children, className }: ScrollHeroSequenceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [1, 1] : [1, 0.92]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], prefersReducedMotion ? [1, 1] : [1, 0.3]);

  return (
    <motion.div ref={ref} style={{ scale, opacity }} className={cn(className)}>
      {children}
    </motion.div>
  );
}
