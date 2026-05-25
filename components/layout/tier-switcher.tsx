"use client";

import { motion } from "framer-motion";
import type { SubscriptionTier } from "@/lib/types";
import { useTier } from "@/lib/context/tier-context";
import { cn } from "@/lib/utils";

const TIERS: { value: SubscriptionTier; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "player", label: "Player" },
  { value: "family", label: "Family" },
];

export function TierSwitcher({
  className,
  showLabel = true,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { tier, setTier } = useTier();

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {showLabel && (
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-light">
          Demo tier
        </span>
      )}
      <div className="flex items-center gap-0.5 rounded-pill border-[0.5px] border-line bg-grass-50/70 p-1">
        {TIERS.map((t) => {
          const active = tier === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTier(t.value)}
              className={cn(
                "relative rounded-pill px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "text-grass-900" : "text-stone hover:text-ink"
              )}
            >
              {active && (
                <motion.span
                  layoutId="tier-pill"
                  className="absolute inset-0 rounded-pill bg-card shadow-soft"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
