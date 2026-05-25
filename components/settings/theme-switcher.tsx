"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { THEMES, useTheme } from "@/lib/context/theme-context";
import { cn } from "@/lib/utils";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {THEMES.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              "relative flex items-center gap-4 rounded-card border-[0.5px] p-4 text-left transition-all",
              active
                ? "border-grass shadow-soft ring-1 ring-grass/30"
                : "border-line hover:-translate-y-0.5 hover:shadow-soft"
            )}
          >
            {/* swatch */}
            <div
              className="flex h-12 w-12 shrink-0 overflow-hidden rounded-xl border-[0.5px] border-line"
              aria-hidden
            >
              {t.swatch.map((s, i) => (
                <span
                  key={i}
                  className="h-full flex-1"
                  style={{ backgroundColor: s }}
                />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{t.name}</p>
              <p className="truncate text-xs text-stone-light">
                {t.description}
              </p>
            </div>
            {active && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-grass text-cream"
              >
                <Check className="h-3.5 w-3.5" />
              </motion.span>
            )}
          </button>
        );
      })}
    </div>
  );
}
