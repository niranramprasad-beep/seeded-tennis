"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface RevealProps extends HTMLMotionProps<"div"> {
  /** Position in a staggered group — delay = index * step. */
  index?: number;
  step?: number;
}

// A short fade-and-rise on first view, for the sections/cards a page wants
// to feel orchestrated rather than all popping in at once. Triggers via
// `whileInView` (not on mount), so above-the-fold content animates as soon
// as it paints and nothing below the fold delays the page — and
// MotionConfig's `reducedMotion="user"` (app/providers.tsx) already
// collapses this to an instant appearance for anyone with OS reduce-motion
// set, so there is nothing extra to gate here.
export function Reveal({
  children,
  index = 0,
  step = 0.07,
  className,
  transition,
  ...props
}: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        duration: 0.45,
        delay: index * step,
        ease: [0.22, 1, 0.36, 1],
        ...transition,
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
