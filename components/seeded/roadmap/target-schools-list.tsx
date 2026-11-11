"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GripVertical, Search } from "lucide-react";
import type { SchoolLite } from "@/lib/types";
import { explainSchoolFit, schoolUtrRange, utrToPct, type SchoolFitExplanationInput } from "@/lib/school-fit";
import { UTR_RANGE_SOURCE_LABEL } from "@/lib/db/schools";
import { FitBadge } from "@/components/seeded/ui/fit-badge";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { StarButton } from "@/components/seeded/ui/star-button";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

interface TargetSchoolsListProps {
  /** Real order from player.targetSchoolSlugs, resolved to school objects
   * by the caller (see seeded-roadmap-layout.tsx) — NOT catalog order. */
  targetSchools: SchoolLite[];
  /** Full same-gender catalog minus whatever's already targeted, for the
   * "add a target school" search. */
  addableSchools: SchoolLite[];
  effectiveUtr: number;
  explanationInput: SchoolFitExplanationInput;
  isStarred: (slug: string) => boolean;
  toggleStar: (slug: string, label: string) => void;
  /** Writes the real new slug order via updatePlayer(). */
  onReorder: (newSlugOrder: string[]) => void;
  /** Drag-to-reorder is disabled while a temporary filter (the pace
   * warning's "Show realistic targets") is narrowing what's visible —
   * reordering a partial view would silently scramble the real full
   * order, so it only runs against the complete list. */
  reorderable: boolean;
}

function insertBefore(order: string[], draggedSlug: string, dropSlug: string): string[] {
  if (draggedSlug === dropSlug) return order;
  const without = order.filter((s) => s !== draggedSlug);
  const dropIndex = without.indexOf(dropSlug);
  if (dropIndex === -1) return order;
  return [...without.slice(0, dropIndex), draggedSlug, ...without.slice(dropIndex)];
}

// Point 3 of the redesign spec: the target-schools list, made directly
// editable on /plan. "Add" and "remove" both reuse the exact same
// star-to-target mechanism (lib/hooks/use-star-schools.ts) every other
// school row in the app already uses — no second concept of "target."
// Drag-to-reorder writes a real new `targetSchoolSlugs` order via the
// caller's updatePlayer() path; nothing here invents its own ordering
// field. Each row's band/gap/what-would-change-it text is unchanged from
// the prior task (explainSchoolFit) — this component only adds list
// management around it.
export function TargetSchoolsList({
  targetSchools,
  addableSchools,
  effectiveUtr,
  explanationInput,
  isStarred,
  toggleStar,
  onReorder,
  reorderable,
}: TargetSchoolsListProps) {
  const [draggingSlug, setDraggingSlug] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return addableSchools
      .filter((s) => s.name.toLowerCase().includes(q) || s.shortName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [addableSchools, query]);

  const currentOrder = targetSchools.map((s) => s.slug);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-light" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a target school…"
          aria-label="Search schools to add to your target list"
          className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
        />
        {matches.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-line bg-card py-1 shadow-card">
            {matches.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    toggleStar(s.slug, s.shortName);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-grass-50"
                >
                  <StarButton
                    starred={false}
                    onToggle={() => {
                      toggleStar(s.slug, s.shortName);
                      setQuery("");
                    }}
                    label={s.shortName}
                    className="h-6 w-6"
                  />
                  {s.shortName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {targetSchools.length > 0 && (
        // The team UTR band in every row below is an unverified estimate with
        // no source or date (P0-3). Stated once here rather than on each row.
        <p className="mt-3.5 text-xs text-stone-light">
          Team UTR ranges are an {UTR_RANGE_SOURCE_LABEL.toLowerCase()} — no published source or
          date yet.
        </p>
      )}

      <ul className="mt-3.5 flex flex-col gap-3 text-sm">
        {targetSchools.map((s) => {
          const explanation = explainSchoolFit(effectiveUtr, s, explanationInput);
          const range = schoolUtrRange(s);
          const gapLabel =
            explanation.band === "unverified"
              ? "Log a UTR to see your gap."
              : explanation.band === "likely"
                ? "Already above their roster average."
                : explanation.band === "target"
                  ? `+${explanation.gapToMedian!.toFixed(1)} to their roster average`
                  : `+${explanation.gapToFloor!.toFixed(1)} to their competitive floor`;

          return (
            <li
              key={s.id}
              draggable={reorderable}
              onDragStart={reorderable ? () => setDraggingSlug(s.slug) : undefined}
              onDragEnd={reorderable ? () => setDraggingSlug(null) : undefined}
              onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
              onDrop={
                reorderable
                  ? () => {
                      if (draggingSlug) onReorder(insertBefore(currentOrder, draggingSlug, s.slug));
                      setDraggingSlug(null);
                    }
                  : undefined
              }
              className={cn(
                "flex flex-col gap-1.5 border-b border-line pb-3 last:border-b-0 last:pb-0",
                reorderable && "cursor-grab active:cursor-grabbing",
                draggingSlug === s.slug && "opacity-50"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  {reorderable && (
                    <GripVertical className="h-4 w-4 shrink-0 text-stone-light" aria-hidden />
                  )}
                  <StarButton
                    starred={isStarred(s.slug)}
                    onToggle={() => toggleStar(s.slug, s.shortName)}
                    label={s.shortName}
                    className="h-7 w-7"
                  />
                  <Link href={`/schools/${s.slug}`} className="truncate text-ink hover:text-grass">
                    {s.shortName}
                  </Link>
                </div>
                <FitBadge band={explanation.band} />
              </div>
              <RangeBar
                rangeStartPct={utrToPct(range.min)}
                rangeEndPct={utrToPct(range.max)}
                medianPct={utrToPct(s.avgRosterUTR)}
                youPct={utrToPct(effectiveUtr)}
                low={range.min}
                median={s.avgRosterUTR}
                high={range.max}
                you={effectiveUtr}
              />
              <p className="text-xs text-stone">
                {gapLabel}
                {explanation.nextBand &&
                  ` · ${explanation.unreachable ? "won't realistically close" : "could realistically close"} by ${formatDate(explanation.nextBand.byDate)}`}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
