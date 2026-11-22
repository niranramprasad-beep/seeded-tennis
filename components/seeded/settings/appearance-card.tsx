"use client";

import { useDesign } from "@/lib/context/design-context";
import { cn } from "@/lib/utils";

// The mockup's "Appearance" card: Light / Dark / Match system, 3 pills,
// single-select, driving the design-context state (see
// lib/context/design-context.tsx). The mockup's fourth pill, "Legacy
// theme", is gone with the Legacy design itself (2026-11-20, PR-LEGACY).
export function AppearanceCard() {
  const { seededMode, systemSync, setSeededMode, setSystemSync, hydrated } = useDesign();

  const pills: { key: string; label: string; active: boolean; onClick: () => void }[] = [
    {
      key: "light",
      label: "Light",
      active: hydrated && !systemSync && seededMode === "light",
      onClick: () => {
        setSystemSync(false);
        setSeededMode("light");
      },
    },
    {
      key: "dark",
      label: "Dark",
      active: hydrated && !systemSync && seededMode === "dark",
      onClick: () => {
        setSystemSync(false);
        setSeededMode("dark");
      },
    },
    {
      key: "system",
      label: "Match system",
      active: hydrated && systemSync,
      onClick: () => {
        setSystemSync(true);
      },
    },
  ];

  return (
    <div className="rounded-card border border-line bg-card p-6">
      <h2 className="text-lg font-semibold text-ink">Appearance</h2>
      <div className="mt-4 flex flex-wrap gap-2.5">
        {pills.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={p.onClick}
            aria-pressed={p.active}
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-[15px] font-semibold transition-colors",
              p.active
                ? "border-ink bg-ink text-cream"
                : "border-input bg-card text-ink hover:bg-subtle-hover"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
