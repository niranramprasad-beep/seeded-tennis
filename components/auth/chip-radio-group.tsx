"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

// A row of pill "chips" that is a real radio group: native <input
// type="radio"> elements, visually hidden, inside <label>s that are styled as
// the chips. That gives the browser's own semantics for free — one tab stop
// for the group, arrow keys move the selection, Space selects, and a screen
// reader announces "radio, 1 of 2, checked" — instead of buttons that only
// look like radios (which is what /signup and /auth/complete had: buttons
// with role="radio", no arrow keys, and on /signup a <Link> pretending to be
// the second radio).

export function ChipRadioGroup<T extends string | number>({
  label,
  name,
  options,
  value,
  onChange,
  columns,
  className,
  describedById,
}: {
  /** Visible group label, 13px/500 like every other field label. */
  label: string;
  name: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
  /** Lay the chips out as an equal grid (grade picker) instead of a row. */
  columns?: number;
  className?: string;
  describedById?: string;
}) {
  const labelId = useId();
  return (
    <div className={className}>
      <span id={labelId} className="mb-1.5 block text-[13px] font-medium text-stone">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={describedById}
        className={cn(columns ? "grid gap-2" : "flex gap-2")}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      >
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label key={String(o.value)} className="relative flex-1 cursor-pointer">
              <input
                type="radio"
                name={name}
                value={String(o.value)}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-pill border px-3 text-[15px] font-semibold transition-colors",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                  checked
                    ? "border-ink bg-ink text-cream"
                    : "border-input bg-card text-ink hover:bg-subtle-hover"
                )}
              >
                {o.label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
