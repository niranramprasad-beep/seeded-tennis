"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ParallaxProps {
  children: ReactNode;
  /** Max pixels of vertical travel as the element crosses the viewport. */
  offset?: number;
  className?: string;
}

// Scroll-linked drift — the element travels a little slower than the page,
// the depth cue that makes a static hero feel like it has layers. Travel is
// clamped and disabled under OS reduce-motion, since it's a continuous,
// scroll-synced transform rather than a one-time reveal.
export function Parallax({ children, offset = 40, className }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    prefersReducedMotion ? [0, 0] : [-offset, offset]
  );

  return (
    <motion.div ref={ref} style={{ y }} className={cn(className)}>
      {children}
    </motion.div>
  );
}
