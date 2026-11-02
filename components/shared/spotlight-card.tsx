"use client";

import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
}

// The hover language real SaaS product pages reach for (Linear, Vercel,
// Stripe docs) instead of a flat color-swap: a soft glow that tracks the
// cursor across the card, plus a lift and a brightened ring. Position is
// written straight to the node's own CSS variables on pointermove — no
// React state, so it costs a style mutation, never a re-render.
export function SpotlightCard({ children, className }: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  };

  const setGlow = (opacity: number) => {
    if (glowRef.current) glowRef.current.style.opacity = String(opacity);
  };

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerEnter={() => setGlow(1)}
      onPointerLeave={() => setGlow(0)}
      className={cn(
        "group relative isolate overflow-hidden transition-transform duration-300 ease-out hover:-translate-y-1",
        className
      )}
    >
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(320px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgb(var(--c-primary) / 0.16), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 ring-1 ring-inset ring-[rgb(var(--c-primary)/0.3)] transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
