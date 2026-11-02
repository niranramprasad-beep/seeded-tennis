"use client";

import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import {
  useMotionValue,
  useSpring,
  useMotionValueEvent,
  useReducedMotion,
} from "framer-motion";
import { cn } from "@/lib/utils";

interface CursorGlowFieldProps {
  children: ReactNode;
  className?: string;
}

// A section-level ambient glow that trails the cursor — the same
// spring-lag mechanism Magnetic (components/shared/magnetic.tsx) uses for a
// draggable CTA, applied instead to a large background glow behind an
// entire section. Distinct from SpotlightCard's per-card glow (which is
// instant, not spring-lagged, and scoped to one card) — this is a slower,
// ambient, page-section-scale effect. The spring values are mirrored into
// CSS custom properties via useMotionValueEvent (the same mechanism
// nav.tsx's scroll-shrink uses), so the glow position updates without a
// React re-render per frame. Disabled under reduce-motion.
export function CursorGlowField({ children, className }: CursorGlowFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 60, damping: 20, mass: 0.6 });
  const springY = useSpring(y, { stiffness: 60, damping: 20, mass: 0.6 });

  useMotionValueEvent(springX, "change", (latest) => {
    ref.current?.style.setProperty("--glow-x", `${latest}px`);
  });
  useMotionValueEvent(springY, "change", (latest) => {
    ref.current?.style.setProperty("--glow-y", `${latest}px`);
  });

  const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);
  };

  return (
    <div ref={ref} onPointerMove={handleMove} className={cn("relative", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        style={{
          background:
            "radial-gradient(600px circle at var(--glow-x, 50%) var(--glow-y, 50%), rgb(var(--s-bg-mesh-1) / 0.14), transparent 70%)",
        }}
      />
      {children}
    </div>
  );
}
