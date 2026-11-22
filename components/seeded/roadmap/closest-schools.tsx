"use client";

import Link from "next/link";
import type { ClosestSchoolResult } from "@/lib/school-fit";
import { FitBadge } from "@/components/seeded/ui/fit-badge";
import { StarButton } from "@/components/seeded/ui/star-button";

interface ClosestSchoolsCardProps {
  results: ClosestSchoolResult[];
  isStarred: (slug: string) => boolean;
  onToggleStar: (slug: string, label: string) => void;
}

// Point 4 of the redesign spec: the real catalog schools (not just the
// player's current targets) with the smallest real UTR gap to their
// current level — lib/school-fit.ts's closestSchoolsByUtrGap, built on the
// same classifySchoolFit/avgRosterUTR/minCompetitiveUTR real fields every
// other fit chip on this page already uses. Each row reuses the same
// star-to-target mechanism as the target list below, so a player can add
// one straight from here.
export function ClosestSchoolsCard({ results, isStarred, onToggleStar }: ClosestSchoolsCardProps) {
  if (results.length === 0) return null;

  return (
    <div className="mt-5 rounded-card border border-line bg-card p-5">
      <h2 className="text-base font-semibold text-ink">Closest schools to you</h2>
      <p className="mt-1 text-[15px] text-stone">
        The real schools in the full catalog whose roster level is nearest your current UTR —
        whether or not they're on your target list yet.
      </p>
      <ul className="mt-3.5 flex flex-col gap-2.5 text-sm">
        {results.map(({ school, gap, band }) => (
          // Wraps on a phone: at 320 the gap text and badge squeezed the
          // school's name to 14px ("M…") (C29).
          <li key={school.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 border-b border-line pb-2.5 last:border-b-0 last:pb-0">
            <div className="flex min-w-0 flex-1 basis-36 items-center gap-1">
              <StarButton
                starred={isStarred(school.slug)}
                onToggle={() => onToggleStar(school.slug, school.shortName)}
                label={school.shortName}
                className="sm:h-7 sm:w-7"
              />
              <Link href={`/schools/${school.slug}`} className="flex min-h-11 min-w-11 items-center truncate text-ink hover:text-grass sm:block sm:min-h-6 sm:min-w-0 sm:leading-6">
                {school.shortName}
              </Link>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-xs text-stone">
                {gap === 0 ? "at their average" : gap > 0 ? `${gap.toFixed(1)} below avg` : `${Math.abs(gap).toFixed(1)} above avg`}
              </span>
              <FitBadge band={band} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
