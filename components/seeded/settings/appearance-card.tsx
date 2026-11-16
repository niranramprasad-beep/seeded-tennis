"use client";

import { useDesign } from "@/lib/context/design-context";
import { cn } from "@/lib/utils";

// Pixel-exact to the mockup's "Appearance" card: Light / Dark / Match
// system / Legacy theme, 4 pills, single-select. Reuses the SAME
// design-context state the pre-existing DesignSwitcher/dark-mode toggle
// already drive (see lib/context/design-context.tsx) — this just restyles
// that real logic as 4 pills instead of duplicating it. Picking "Legacy
// theme" flips `design` to "legacy", which hands the whole /settings page
// over to the Legacy branch (with its own existing theme picker) exactly
// like it would on any other route.
export function AppearanceCard() {
  const { design, seededMode, systemSync, setDesign, setSeededMode, setSystemSync, hydrated } =
    useDesign();
  const isSeeded = design === "seeded";

  const pills: { key: string; label: string; active: boolean; onClick: () => void }[] = [
    {
      key: "light",
      label: "Light",
      active: hydrated && isSeeded && !systemSync && seededMode === "light",
      onClick: () => {
        setDesign("seeded");
        setSystemSync(false);
        setSeededMode("light");
      },
    },
    {
      key: "dark",
      label: "Dark",
      active: hydrated && isSeeded && !systemSync && seededMode === "dark",
      onClick: () => {
        setDesign("seeded");
        setSystemSync(false);
        setSeededMode("dark");
      },
    },
    {
      key: "system",
      label: "Match system",
      active: hydrated && isSeeded && systemSync,
      onClick: () => {
        setDesign("seeded");
        setSystemSync(true);
      },
    },
    {
      key: "legacy",
      label: "Legacy theme",
      active: hydrated && !isSeeded,
      onClick: () => setDesign("legacy"),
    },
  ];

  return (
    <div className="rounded-xl border border-line bg-card p-6">
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
