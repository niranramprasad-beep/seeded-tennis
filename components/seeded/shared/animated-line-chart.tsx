"use client";

import { useId } from "react";
import { motion } from "framer-motion";

interface LinePoint {
  label: string;
  utr: number;
}

interface AnimatedLineChartProps {
  data: LinePoint[];
  height?: number;
  className?: string;
}

// A real self-drawing SVG line (not recharts) — the path strokes itself in
// on scroll via framer-motion's pathLength, milestone dots pop in after,
// per the brief's "an animated line that draws itself on scroll from
// current UTR to target UTR, with milestone dots popping in." Hand-rolled
// rather than reused from UTRLineChart (recharts) because recharts has no
// clean hook for a stroke-draw-in animation — this is intentionally a
// separate, lightweight primitive.
export function AnimatedLineChart({ data, height = 220, className }: AnimatedLineChartProps) {
  const gradientId = useId();
  const width = 640;
  const padding = 28;

  if (data.length < 2) return null;

  const values = data.map((d) => d.utr);
  const min = Math.min(...values) - 0.4;
  const max = Math.max(...values) + 0.4;
  const xStep = (width - padding * 2) / (data.length - 1);
  const yFor = (utr: number) =>
    height - padding - ((utr - min) / (max - min || 1)) * (height - padding * 2);

  const points = data.map((d, i) => ({ ...d, x: padding + i * xStep, y: yFor(d.utr) }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} style={{ width: "100%", height: "auto" }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(var(--c-primary))" />
          <stop offset="100%" stopColor="rgb(var(--c-tennis))" />
        </linearGradient>
      </defs>
      <motion.path
        d={path}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
      />
      {points.map((p, i) => (
        <motion.g
          key={`${p.label}-${i}`}
          initial={{ opacity: 0, scale: 0 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: 0.5 + i * 0.1, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: `${p.x}px ${p.y}px` }}
        >
          <circle cx={p.x} cy={p.y} r={5} fill="rgb(var(--c-card))" stroke="rgb(var(--c-primary))" strokeWidth={2.5} />
          <text
            x={p.x}
            y={Math.max(14, p.y - 14)}
            textAnchor="middle"
            fontSize={11}
            fontFamily="var(--font-plex-mono)"
            fill="rgb(var(--c-ink))"
          >
            {p.utr.toFixed(1)}
          </text>
          <text
            x={p.x}
            y={height - 6}
            textAnchor="middle"
            fontSize={10}
            fontFamily="var(--font-geist-sans)"
            fill="rgb(var(--c-stone-light))"
          >
            {p.label}
          </text>
        </motion.g>
      ))}
    </svg>
  );
}
