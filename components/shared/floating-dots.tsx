"use client";

import { cn } from "@/lib/utils";

// Tennis-ball-yellow dots scattered as ambient decoration.
const DOTS = [
  { top: "12%", left: "8%", size: 14, delay: "0s", opacity: 0.9 },
  { top: "24%", left: "82%", size: 22, delay: "1.2s", opacity: 0.8 },
  { top: "62%", left: "5%", size: 18, delay: "0.6s", opacity: 0.7 },
  { top: "78%", left: "88%", size: 12, delay: "2s", opacity: 0.85 },
  { top: "44%", left: "92%", size: 9, delay: "1.6s", opacity: 0.6 },
  { top: "8%", left: "54%", size: 10, delay: "0.9s", opacity: 0.7 },
  { top: "70%", left: "40%", size: 8, delay: "2.4s", opacity: 0.5 },
  { top: "34%", left: "20%", size: 11, delay: "1.8s", opacity: 0.55 },
];

export function FloatingDots({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      {DOTS.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-tennis animate-float"
          style={{
            top: d.top,
            left: d.left,
            width: d.size,
            height: d.size,
            opacity: d.opacity,
            animationDelay: d.delay,
            boxShadow: "0 0 0 1px rgba(45,74,43,0.06)",
          }}
        />
      ))}
    </div>
  );
}
