"use client";

import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MagneticProps {
  children: ReactNode;
  strength?: number;
  className?: string;
}

// A subtle magnetic pull toward the cursor — the primary-CTA hover feel on
// premium product sites. Capped to a small strength so it reads as
// "responsive," not gimmicky. Disabled outright under OS reduce-motion.
export function Magnetic({ children, strength = 0.3, className }: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20, mass: 0.5 });
  const springY = useSpring(y, { stiffness: 300, damping: 20, mass: 0.5 });

  const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * strength);
    y.set((e.clientY - rect.top - rect.height / 2) * strength);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      style={{ x: springX, y: springY }}
      className={cn("inline-block", className)}
    >
      {children}
    </motion.div>
  );
}
