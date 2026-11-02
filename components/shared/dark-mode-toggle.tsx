"use client";

import { Moon, Sun } from "lucide-react";
import { THEMES, useTheme } from "@/lib/context/theme-context";
import { useDesign } from "@/lib/context/design-context";
import { cn } from "@/lib/utils";

const LIGHT_THEME = "grass";
const DARK_THEME = "night";

/** The simple, prominent light/dark switch — separate from the full theme
 * picker in Settings. Under Legacy it flips between exactly grass <-> night
 * (treating "dark" as whichever theme is flagged dark:true, so it reads
 * correctly even if a future theme other than "night" is dark); under
 * Premium it instead flips that design's own dark/light sub-mode, since
 * Premium doesn't use `data-theme` at all. */
export function DarkModeToggle({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { theme, setTheme, hydrated: themeHydrated } = useTheme();
  const { design, premiumMode, setPremiumMode, hydrated: designHydrated } = useDesign();
  const isPremium = design === "premium";
  const isDark = isPremium
    ? premiumMode === "dark"
    : THEMES.find((t) => t.id === theme)?.dark ?? false;
  // Don't claim a specific light/dark state until both the real saved theme
  // and design are known client-side — see theme-context.tsx's `hydrated`
  // doc comment for why defaulting early would flash the wrong icon/label.
  const known = themeHydrated && designHydrated;

  const toggle = () => {
    if (isPremium) {
      setPremiumMode(isDark ? "light" : "dark");
    } else {
      setTheme(isDark ? LIGHT_THEME : DARK_THEME);
    }
  };

  if (showLabel) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={known ? isDark : undefined}
        className={cn(
          "flex w-full items-center justify-between rounded-2xl px-3 py-3 text-sm text-stone transition-colors hover:bg-grass-50 hover:text-ink",
          className
        )}
      >
        <span className="flex items-center gap-2.5">
          {known ? (
            isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />
          ) : (
            <span className="h-4 w-4" aria-hidden />
          )}
          {known ? (isDark ? "Dark mode" : "Light mode") : "Appearance"}
        </span>
        <span
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-pill transition-colors",
            known && isDark ? "bg-grass" : "bg-line"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-soft transition-transform",
              known && isDark ? "translate-x-[22px]" : "translate-x-0.5"
            )}
          />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        known ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Toggle color theme"
      }
      aria-pressed={known ? isDark : undefined}
      className={cn(
        "relative flex h-11 w-11 items-center justify-center rounded-full text-stone transition-colors hover:bg-grass-50 hover:text-ink",
        className
      )}
    >
      {known ? (
        isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
      ) : (
        <span className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
