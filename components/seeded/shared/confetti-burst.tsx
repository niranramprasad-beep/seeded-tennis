"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

const PARTICLE_COLORS = [
  "rgb(var(--c-primary))",
  "rgb(var(--c-gold))",
  "rgb(var(--c-lime))",
  "rgb(var(--c-leaf))",
  "rgb(var(--c-tennis))",
];

interface Particle {
  x: number;
  y: number;
  rotate: number;
  color: string;
  delay: number;
  width: number;
  height: number;
}

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.7;
    const distance = 55 + Math.random() * 55;
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance * 0.6 - 10,
      rotate: Math.random() * 360 - 180,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      delay: Math.random() * 0.1,
      width: 4 + Math.random() * 4,
      height: 7 + Math.random() * 5,
    };
  });
}

// One-shot particle burst for a fresh unlock moment (badges). Pure CSS
// transforms via framer-motion, no canvas/new dependency — mount it only
// while the unlock is "fresh" and let it play out; it never replays itself.
export function ConfettiBurst({ count = 20 }: { count?: number }) {
  const particles = useMemo(() => makeParticles(count), [count]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 rounded-[1px]"
          style={{ width: p.width, height: p.height, backgroundColor: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{
            x: p.x,
            y: p.y + 85,
            opacity: 0,
            rotate: p.rotate,
            scale: 0.6,
          }}
          transition={{ duration: 0.9, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  );
}
