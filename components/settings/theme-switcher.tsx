"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { THEMES, useTheme } from "@/lib/context/theme-context";
import { cn } from "@/lib/utils";

export function ThemeSwitcher() {
  const { theme, setTheme, hydrated } = useTheme();

  return (
    // grid-cols-1 isn't decorative here — without an explicit track size,
    // a bare `grid` lets its single mobile column default to CSS Grid's
    // implicit `auto` sizing (fit-content), which ignores the `min-w-0`/
    // `truncate` already on the text below and overflows the viewport
    // instead of shrinking to it. grid-cols-1 forces minmax(0, 1fr).
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {THEMES.map((t) => {
        // Same hydration gap as the sidebar toggle: `theme` defaults to
        // "grass" until the provider's effect reads the real saved value.
        // Without the `hydrated` check, this card would flash as
        // selected/checked for every user whose real theme isn't Grass
        // Court.
        const active = hydrated && theme === t.id;
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
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-grass text-on-primary"
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
