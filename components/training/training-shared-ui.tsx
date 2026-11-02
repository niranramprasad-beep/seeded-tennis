"use client";

// Small presentational pieces and shared constants used by more than one
// training-planner file (the drawers, the action rail, the calendar views).

import type { ReactNode } from "react";

export type PlannerView = "day" | "week" | "month";
export type PlannerDrawer = "session" | "plan" | "templates" | "progress" | "settings" | null;

export const inputClass =
  "h-11 w-full rounded-xl border-[0.5px] border-line bg-card px-3.5 text-sm text-ink placeholder:text-stone-light transition-colors focus:outline-none focus:ring-2 focus:ring-grass/30";
export const textAreaClass =
  "min-h-[92px] w-full rounded-xl border-[0.5px] border-line bg-card px-3.5 py-3 text-sm text-ink placeholder:text-stone-light transition-colors focus:outline-none focus:ring-2 focus:ring-grass/30";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-stone-light">{label}</span>
      {children}
    </label>
  );
}

export function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-cream/12 px-5 py-4">
      <p className="text-3xl font-light leading-none text-leaf-accent">{value}</p>
      <p className="mt-2 text-[11px] uppercase tracking-wide text-cream/68">{label}</p>
    </div>
  );
}
