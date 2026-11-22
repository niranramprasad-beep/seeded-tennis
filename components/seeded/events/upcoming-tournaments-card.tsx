"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { checkTournamentFit, verdictBlockerSentence, verdictBlockers, type FitResult, type Verdict } from "@/lib/tournament-fit";
import { TOURNAMENT_STATUSES, type TournamentEntry, type TournamentEntryStatus } from "@/lib/db/events";
import { SeededButton } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { cn, formatPlayerUtr, formatUtrEstimate, hasRealUtr } from "@/lib/utils";
import { formatShortDate } from "@/lib/time";

// Same "border + bg + text" chip language as FitBadge and the checker's
// verdict card: green = Worth it, gold = Worth a look, clay = Skip it. The
// three words are the checker's own headlines, so a tournament reads the
// same on both screens. ("Worth a look" used to show as "Skip it" here.)
const VERDICT_CHIP: Record<Verdict, { label: string; className: string }> = {
  good: { label: "Worth it", className: "border-grass-100 bg-grass-50 text-grass" },
  decent: {
    label: "Worth a look",
    className:
      "border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]",
  },
  bad: {
    label: "Skip it",
    className:
      "border-[rgb(var(--c-clay-tint-border))] bg-[rgb(var(--c-clay-tint-bg))] text-[rgb(var(--c-clay-tint-text))]",
  },
};
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
  onSetStatus,
  onEdit,
  onRemove,
}: {
  entries: TournamentEntry[];
  /** NULL/0 when the player has not entered a rating. Every fit verdict
   *  below is computed FROM it, so without one there is nothing honest to
   *  say about a tournament's fit — the caption and the per-entry chips are
   *  dropped rather than computed from the sentinel. */
  playerUtr: number;
  onSetStatus: (id: string, status: TournamentEntryStatus) => void;
  onEdit: (entry: TournamentEntry) => void;
  onRemove: (entry: TournamentEntry) => void;
}) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.id.localeCompare(b.id)),
    [entries]
  );

  const utrKnown = hasRealUtr(playerUtr);

  const fits = useMemo(() => {
    const map = new Map<string, FitResult>();
    if (!utrKnown) return map;
    sorted.forEach((t) => {
      // Same rule as the tournament checker: no verdict without a level, a
      // UTR, an entry fee and the draw's average UTR (C15, D5).
      const fit = checkTournamentFit({
        name: t.name,
        level: t.level,
        playerUtr,
        goalUtr: t.goalUtr,
        drawUtr: t.drawUtr,
        travelHours: t.travelHours,
        distanceMiles: t.distanceMiles,
        entryCost: t.entryCost,
        travelCost: t.travelCost,
      });
      if (fit) map.set(t.id, fit);
    });
    return map;
  }, [sorted, playerUtr, utrKnown]);

  const [openWhyId, setOpenWhyId] = useState<string | null>(null);

  return (
    <div className="rounded-card border border-line bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Upcoming tournaments</h2>
        <span className="text-[13px] text-stone">
          {utrKnown
            ? `Fit checked against UTR ${formatPlayerUtr(playerUtr)}`
            : "Add your UTR to check fit"}
        </span>
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
            const fit = fits.get(t.id);
            const isWhyOpen = openWhyId === t.id;
            // The header already says "Add your UTR to check fit"; per row,
            // say what else is missing ("Not enough info…" for the draw).
            const noVerdictReason =
              fit || !utrKnown
                ? null
                : verdictBlockerSentence(
                    verdictBlockers({ level: t.level, playerUtr, entryCost: t.entryCost, drawUtr: t.drawUtr })
                  );

            return (
              <li key={t.id} className="border-t border-line py-3.5 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-3.5">
                  <div className="w-14 shrink-0 font-mono text-sm text-stone">{formatShortDate(t.eventDate)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{t.name}</p>
                    {locationLine(t) && <p className="truncate text-sm text-stone">{locationLine(t)}</p>}
                  </div>
                  {fit ? (
                    <>
                      <Chip className={VERDICT_CHIP[fit.verdict].className}>{VERDICT_CHIP[fit.verdict].label}</Chip>
                      <SeededButton
                        variant="secondary"
                        className="min-h-11 px-4 sm:min-h-[38px]"
                        onClick={() => setOpenWhyId(isWhyOpen ? null : t.id)}
                        aria-expanded={isWhyOpen}
                      >
                        Why
                      </SeededButton>
                    </>
                  ) : (
                    <Chip className={NEUTRAL_CLASS}>No verdict</Chip>
                  )}
                </div>
                {noVerdictReason && <p className="mt-1.5 text-sm text-stone sm:ml-[72px]">{noVerdictReason}</p>}
                {fit && isWhyOpen && (
                  <ul className="mt-2.5 flex flex-col gap-1.5 border-l-2 border-line pl-3.5 sm:ml-[72px]">
                    {fit.reasons.map((reason, i) => (
                      <li key={i} className="text-sm leading-relaxed text-stone">
                        {reason.text}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:ml-[72px]">
                  <StatusControl entry={t} onChange={(status) => onSetStatus(t.id, status)} />
                  <div className="ml-auto flex gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(t)}
                      aria-label={`Edit ${t.name}`}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-stone transition-colors hover:bg-subtle-hover hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(t)}
                      aria-label={`Remove ${t.name}`}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-stone transition-colors hover:bg-error-bg hover:text-error"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Planning → Entered → Played. A segmented control whose three buttons
 * never change size or position, so changing the status changes only which
 * one is pressed: nothing reflows, nothing loses focus, and the page does
 * not scroll (the old "Enter" button replaced itself with a chip, which
 * dropped focus to <body> and could jump the page).
 */
function StatusControl({
  entry,
  onChange,
}: {
  entry: TournamentEntry;
  onChange: (status: TournamentEntryStatus) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label={`Status of ${entry.name}`}>
      {TOURNAMENT_STATUSES.map((s) => {
        const active = entry.status === s.value;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={active}
            onClick={(e) => {
              e.preventDefault();
              if (!active) onChange(s.value);
            }}
            className={cn(
              "min-h-11 rounded-md px-3 text-sm font-semibold transition-colors sm:min-h-9",
              active ? "bg-grass-50 text-grass" : "text-stone hover:text-ink"
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
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
  if (t.drawUtr != null) parts.push(`draw avg ${formatUtrEstimate(t.drawUtr)}`);
  return parts.join(" · ");
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} hr${rounded >= 2 ? "s" : ""}`;
}
