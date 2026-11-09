"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { evaluateTournamentFit } from "@/lib/tournament-fit";
import type { TournamentEntry } from "@/lib/db/events";
import { SeededButton } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { cn } from "@/lib/utils";

// Same "border + bg + text" chip language as FitBadge (components/seeded/
// ui/fit-badge.tsx)'s target/reach bands — reused directly rather than
// invented fresh, since "Good fit"/"Skip it" here is the same semantic
// green/orange pairing as that component's "target"/"reach".
const GOOD_FIT_CLASS = "border-grass-100 bg-grass-50 text-grass";
const SKIP_IT_CLASS = "border-[rgb(var(--c-clay-tint-border))] bg-[rgb(var(--c-clay-tint-bg))] text-[rgb(var(--c-clay-tint-text))]";
const NEUTRAL_CLASS = "border-line bg-card text-stone";

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
        className
      )}
    >
      {children}
    </span>
  );
}

export function UpcomingTournamentsCard({
  entries,
  playerUtr,
  onMarkEntered,
}: {
  entries: TournamentEntry[];
  playerUtr: number;
  onMarkEntered: (id: string) => void;
}) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    [entries]
  );

  const fits = useMemo(() => {
    const map = new Map<string, ReturnType<typeof evaluateTournamentFit>>();
    sorted.forEach((t) => {
      map.set(
        t.id,
        evaluateTournamentFit({
          name: t.name,
          level: t.level,
          playerUtr,
          goalUtr: t.goalUtr,
          drawUtr: t.drawUtr,
          travelHours: t.travelHours,
          distanceMiles: t.distanceMiles,
          entryCost: t.entryCost,
          travelCost: t.travelCost,
        })
      );
    });
    return map;
  }, [sorted, playerUtr]);

  // The single nearest-upcoming good-fit entry that isn't entered yet gets
  // the primary "Enter" CTA — the one tournament a family most likely needs
  // to act on right now. Every other good-fit entry gets a neutral "Save";
  // both call the exact same onMarkEntered action, just with different
  // urgency styling.
  const firstGoodFitId = sorted.find(
    (t) => fits.get(t.id)?.verdict === "good" && t.status !== "entered"
  )?.id;

  const [openWhyId, setOpenWhyId] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Upcoming tournaments</h2>
        <span className="text-[13px] text-stone">Fit checked against UTR {playerUtr.toFixed(2)}</span>
      </div>

      {sorted.length === 0 ? (
        <div className="mt-3.5">
          <EmptyState
            title="No tournaments saved yet."
            description="Check a tournament's fit and add it to your events to see it here."
            action={{ label: "Check a tournament", href: "/tournament-fit" }}
          />
        </div>
      ) : (
        <ul className="mt-3.5 flex flex-col">
          {sorted.map((t) => {
            const fit = fits.get(t.id)!;
            const isGoodFit = fit.verdict === "good";
            const isWhyOpen = openWhyId === t.id;

            return (
              <li key={t.id} className="border-t border-line py-3.5 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-3.5">
                  <div className="w-14 shrink-0 font-mono text-sm text-stone">{formatShortDate(t.eventDate)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{t.name}</p>
                    <p className="truncate text-sm text-stone">{locationLine(t)}</p>
                  </div>
                  <Chip className={isGoodFit ? GOOD_FIT_CLASS : SKIP_IT_CLASS}>
                    {isGoodFit ? "Good fit" : "Skip it"}
                  </Chip>
                  {isGoodFit ? (
                    t.status === "entered" ? (
                      <Chip className={NEUTRAL_CLASS}>Entered</Chip>
                    ) : (
                      <SeededButton
                        variant={t.id === firstGoodFitId ? "primary" : "secondary"}
                        className="min-h-[38px] px-4"
                        onClick={() => onMarkEntered(t.id)}
                      >
                        {t.id === firstGoodFitId ? "Enter" : "Save"}
                      </SeededButton>
                    )
                  ) : (
                    <SeededButton
                      variant="secondary"
                      className="min-h-[38px] px-4"
                      onClick={() => setOpenWhyId(isWhyOpen ? null : t.id)}
                      aria-expanded={isWhyOpen}
                    >
                      Why
                    </SeededButton>
                  )}
                </div>
                {isWhyOpen && (
                  <ul className="ml-[72px] mt-2.5 flex flex-col gap-1.5 border-l-2 border-line pl-3.5">
                    {fit.reasons.map((reason, i) => (
                      <li key={i} className="text-sm leading-relaxed text-stone">
                        {reason.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function locationLine(t: TournamentEntry): string {
  const parts: string[] = [];
  const place = [t.city, t.state].filter(Boolean).join(", ");
  if (place) parts.push(place);
  if (t.travelHours != null) {
    parts.push(t.travelHours <= 0.75 ? "local" : formatHours(t.travelHours));
  } else if (t.distanceMiles != null) {
    parts.push(`${t.distanceMiles} mi`);
  }
  if (t.drawUtr != null) parts.push(`field est. ${t.drawUtr.toFixed(1)}`);
  return parts.join(" · ");
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} hr${rounded >= 2 ? "s" : ""}`;
}
