"use client";

import { cn } from "@/lib/utils";

// Same pill-with-sliding-knob visual as the "showLabel" variant of
// components/shared/dark-mode-toggle.tsx, extracted into a generic
// controlled on/off switch for real-data toggles elsewhere (notifications,
// public recruiting page, ...) rather than re-implementing that look again.
export function SeededToggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-pill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grass/40 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-grass" : "bg-line"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-soft transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
