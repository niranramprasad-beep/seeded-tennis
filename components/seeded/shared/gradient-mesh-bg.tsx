"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GradientMeshBgProps {
  className?: string;
}

// Seeded's ambient backdrop: three blurred, drifting color blobs instead of
// Legacy's single static GlowOrb — the "this page is alive" signal Seeded
// pages lean on behind hero/section content. Colors come from --s-bg-mesh-*
// (set per dark/light mode in app/globals.css), not hardcoded hex, so this
// never needs a Seeded-dark vs Seeded-light variant of its own. Disabled
// under OS reduce-motion — the blobs still render, just static.
export function GradientMeshBg({ className }: GradientMeshBgProps) {
  const prefersReducedMotion = useReducedMotion();

  const drift = (dx: number, dy: number, duration: number) =>
    prefersReducedMotion
      ? undefined
      : {
          x: [0, dx, 0],
          y: [0, dy, 0],
          transition: { duration, repeat: Infinity, repeatType: "mirror" as const, ease: "easeInOut" },
        };

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <motion.div
        animate={drift(60, 40, 22)}
        className="absolute -left-1/4 -top-1/4 h-[60%] w-[60%] rounded-full blur-[100px]"
        style={{ background: "radial-gradient(circle, rgb(var(--s-bg-mesh-1) / 0.35), transparent 70%)" }}
      />
      <motion.div
        animate={drift(-50, 60, 26)}
        className="absolute -right-1/4 top-0 h-[55%] w-[55%] rounded-full blur-[100px]"
        style={{ background: "radial-gradient(circle, rgb(var(--s-bg-mesh-2) / 0.3), transparent 70%)" }}
      />
      <motion.div
        animate={drift(40, -50, 30)}
        className="absolute bottom-[-10%] left-1/3 h-[50%] w-[50%] rounded-full blur-[100px]"
        style={{ background: "radial-gradient(circle, rgb(var(--s-bg-mesh-3) / 0.22), transparent 70%)" }}
      />
    </div>
  );
}
