"use client";

import { motion } from "framer-motion";
import type { Gender } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Gender; label: string }[] = [
  { value: "men", label: "Men's" },
  { value: "women", label: "Women's" },
];

export function GenderToggle({
  value,
  onChange,
  layoutId = "gender-toggle",
  className,
}: {
  value: Gender;
  onChange: (g: Gender) => void;
  layoutId?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-pill border-[0.5px] border-line bg-grass-50/70 p-1",
        className
      )}
    >
      {OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative rounded-pill px-4 py-1.5 text-sm font-medium transition-colors",
              active ? "text-grass-900" : "text-stone hover:text-ink"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-pill bg-card shadow-soft"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
