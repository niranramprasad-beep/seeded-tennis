"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import {
  useDesign,
  type DesignSystemId,
  type PremiumMode,
} from "@/lib/context/design-context";
import { cn } from "@/lib/utils";

const DESIGNS: { id: DesignSystemId; name: string; description: string }[] = [
  {
    id: "legacy",
    name: "Legacy",
    description: "The current Seeded look — themeable below.",
  },
  {
    id: "premium",
    name: "Premium",
    description: "A from-scratch SaaS redesign with its own dark and light modes.",
  },
];

const PREMIUM_MODES: { id: PremiumMode; name: string }[] = [
  { id: "dark", name: "Dark" },
  { id: "light", name: "Light" },
];

export function DesignSwitcher() {
  const { design, setDesign, premiumMode, setPremiumMode, hydrated } = useDesign();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DESIGNS.map((d) => {
          const active = hydrated && design === d.id;
          return (
            <button
              key={d.id}
              onClick={() => setDesign(d.id)}
              className={cn(
                "relative flex items-start gap-3 rounded-card border-[0.5px] p-4 text-left transition-all",
                active
                  ? "border-grass shadow-soft ring-1 ring-grass/30"
                  : "border-line hover:-translate-y-0.5 hover:shadow-soft"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{d.name}</p>
                <p className="mt-0.5 text-xs text-stone-light">{d.description}</p>
              </div>
              {active && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-grass text-on-primary"
                >
                  <Check className="h-3.5 w-3.5" />
                </motion.span>
              )}
            </button>
          );
        })}
      </div>

      {hydrated && design === "premium" && (
        <div>
          <p className="mb-2 text-xs text-stone-light">Premium mode</p>
          <div className="inline-flex rounded-pill border-[0.5px] border-line bg-card p-1">
            {PREMIUM_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setPremiumMode(m.id)}
                className={cn(
                  "rounded-pill px-4 py-1.5 text-sm transition-colors",
                  premiumMode === m.id
                    ? "bg-grass text-on-primary"
                    : "text-stone hover:text-ink"
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
