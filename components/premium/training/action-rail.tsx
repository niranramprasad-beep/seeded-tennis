"use client";

import { LayoutList, Settings, Sparkles, Trophy } from "lucide-react";
import type { TrainingActionRailProps } from "@/components/training/training-view";
import { cn } from "@/lib/utils";

// Same prop contract as Legacy's TrainingActionRail — a drop-in visual
// replacement, no new wiring.
export function PremiumActionRail({
  view,
  setView,
  onNewPlan,
  onTemplates,
  onProgress,
  onSettings,
}: TrainingActionRailProps) {
  const actions = [
    { label: "New plan", icon: LayoutList, onClick: onNewPlan },
    { label: "Templates", icon: Sparkles, onClick: onTemplates },
    { label: "Progress", icon: Trophy, onClick: onProgress },
    { label: "Settings", icon: Settings, onClick: onSettings },
  ];

  return (
    <aside className="xl:sticky xl:top-32 xl:self-start">
      <div className="premium-glass rounded-[28px] p-5 shadow-premium-2">
        <p className="px-1 font-premium text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-light">
          Calendar view
        </p>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-2xl px-3 py-2.5 font-premium text-xs font-medium capitalize transition-all",
                view === v ? "text-on-primary shadow-premium-1" : "text-stone hover:text-ink"
              )}
              style={view === v ? { background: "var(--p-accent-gradient)" } : undefined}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-1 border-t border-[rgb(var(--c-line))] pt-4">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-left font-premium text-sm text-stone transition-colors hover:text-ink"
            >
              <a.icon className="h-4 w-4 text-grass transition-transform group-hover:scale-110" />
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
