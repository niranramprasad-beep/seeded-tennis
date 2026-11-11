"use client";

import Link from "next/link";
import { useMemo } from "react";
import useSWR from "swr";
import { ArrowLeft, Building2, ExternalLink, GraduationCap, User } from "lucide-react";
import type { School } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { explainSchoolFit, schoolUtrRange, utrToPct } from "@/lib/school-fit";
import { staffDirectorySearchUrl, UTR_RANGE_SOURCE_LABEL } from "@/lib/db/schools";
import { loadCoachOutreach } from "@/lib/db/outreach";
import { loadUtrEntries } from "@/lib/db/plan";
import { formatDate } from "@/lib/time";
import { FitBadge } from "@/components/seeded/ui/fit-badge";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { SeededButton, seededButtonVariants } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { StarButton } from "@/components/seeded/ui/star-button";
import { Toast } from "@/components/seeded/ui/toast";
import { Footer } from "@/components/layout/footer";
import { useStarSchools, STAR_TOAST_DURATION_MS } from "@/lib/hooks/use-star-schools";
import { cn } from "@/lib/utils";

interface Props {
  school: School;
  nationalRank: number;
  stats: { label: string; value: string }[];
  programType: string;
  inState: boolean;
  /** Full catalog (both genders) — the real candidate pool for "Why this
   * band"'s alternative-school suggestion (lib/school-fit.ts's
   * explainSchoolFit), only used when the gap here turns out unreachable. */
  allSchools: School[];
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

// Client Component (promoted from Server Component — needs usePlayer() for
// real personalization: fit band, UTR comparison, save-to-targets). Rebuilt
// pixel-exact to SchoolProfile.dc.html, which has NO brand-colored hero
// banner, avatar circle, rank badge, or stat-tiles grid — those were this
// file's own earlier invention, before the real mockup existed. Removed to
// match; the real ranking data they showed (US News, conference rank) now
// lives inside the "Academics" card below instead of a dedicated tile row.
export function SeededSchoolDetail({ school, nationalRank, programType, allSchools }: Props) {
  const { player } = usePlayer();
  const { data: outreach } = useSWR("coach-outreach", () => loadCoachOutreach());
  // Same "utr-entries" SWR key /today, /plan and the Schools browser already
  // fetch under — shares their cache instead of a fresh round-trip.
  const { data: utrEntries } = useSWR("utr-entries", () => loadUtrEntries());
  const explanationInput = useMemo(
    () => ({
      utrHistory: (utrEntries ?? []).map((e) => ({ date: new Date(e.recordedAt), utr: e.utr })),
      graduationYear: player.graduationYear,
      gender: player.gender,
      catalog: allSchools,
    }),
    [utrEntries, player.graduationYear, player.gender, allSchools]
  );

  const explanation = explainSchoolFit(player.currentUTR, school, explanationInput);
  const range = schoolUtrRange(school);
  const alreadyContacted = Boolean(outreach?.[school.slug]);

  // Same shared star-to-target mechanism as the Schools browser and Plan —
  // optimistic update, Undo toast, silent rollback on a real write
  // failure. "Save to targets" below is this page's existing text-button
  // affordance for the exact same action; the star icon next to the title
  // is the new one, both wired to the same toggleStar call.
  const { isStarred, toggleStar, toast, dismissToast } = useStarSchools();
  const saved = isStarred(school.slug);

  const paceDescription =
    explanation.pace.status === "ready"
      ? `Projected ${explanation.pace.projectedUTR.toFixed(1)} by ${formatDate(explanation.pace.byDate)}`
      : explanation.pace.status === "insufficient-history"
        ? explanation.pace.message
        : "Log a UTR to see your pace.";

  return (
    <>
      <div className="mx-auto max-w-content container-px py-10">
        <Link href="/schools" className="inline-flex items-center gap-1.5 text-sm text-ink hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Schools
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5">
              <StarButton
                starred={saved}
                onToggle={() => toggleStar(school.slug, school.shortName)}
                label={school.shortName}
              />
              <h1 className="font-seeded text-[34px] font-semibold tracking-tight text-ink">
                {school.name} · {programType} tennis
              </h1>
            </div>
            <p className="mt-1.5 text-stone">
              {school.division} · {school.conference} · {school.city}, {school.state}
            </p>
            <div className="mt-2.5">
              <a
                href={`mailto:NiranRamprasad@gmail.com?subject=${encodeURIComponent(
                  `Wrong data on ${school.name}`
                )}`}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-stone hover:text-ink"
              >
                Report an error
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/schools?compare=${school.slug}&gender=${school.gender}`}
              className={seededButtonVariants({ variant: "secondary" })}
            >
              Compare
            </Link>
            <SeededButton
              variant={saved ? "secondary" : "primary"}
              onClick={() => toggleStar(school.slug, school.shortName)}
            >
              {saved ? "Saved to targets" : "Save to targets"}
            </SeededButton>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[10px] border border-line bg-card p-[22px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-ink">Why this band</h2>
              <FitBadge band={explanation.band} className="text-sm" />
            </div>
            <p className="mt-2 text-sm text-stone">{explanation.summary}</p>

            {explanation.gapToFloor != null && explanation.gapToMedian != null && (
              <FitDriverRow
                label="UTR"
                description={`Gap to floor ${signed(explanation.gapToFloor)} · gap to median ${signed(explanation.gapToMedian)}`}
                chip={
                  explanation.band === "likely"
                    ? "Above range"
                    : explanation.band === "target"
                      ? "In range"
                      : explanation.band === "unverified"
                        ? "No UTR logged"
                        : "Below range" // reach and out-of-range are both below the team floor
                }
              />
            )}
            <FitDriverRow label="Pace" description={paceDescription} chip={explanation.pace.status === "ready" ? "Projected" : "Needs data"} />
            <FitDriverRow label="Timing" description={explanation.timing} chip="General" />

            {explanation.nextBand && (
              <div className="mt-3 rounded-[8px] bg-cream p-3.5 text-sm text-ink">
                <strong>What would move it: </strong>
                {explanation.nextBand.message}
              </div>
            )}

            {explanation.unreachable && explanation.alternatives.length > 0 && (
              <div className="mt-3 rounded-[8px] bg-cream p-3.5 text-sm text-ink">
                <strong>Consider instead: </strong>
                {explanation.alternatives.map((a) => a.shortName).join(", ")} — similar academics or region, and
                realistically in reach today.
              </div>
            )}

            <p className="mt-3 text-xs text-stone-light">
              {explanation.playersLeaving} {explanation.academics}
            </p>
          </div>

          <div className="rounded-[10px] border border-line bg-card p-[22px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-ink">Where you sit on this roster</h2>
              <span className="inline-flex items-center whitespace-nowrap rounded-pill border border-line bg-cream px-2.5 py-1 text-xs font-semibold text-stone">
                {UTR_RANGE_SOURCE_LABEL}
              </span>
            </div>
            <div className="mt-4">
              <RangeBar
                rangeStartPct={utrToPct(range.min)}
                rangeEndPct={utrToPct(range.max)}
                medianPct={utrToPct(school.avgRosterUTR)}
                youPct={utrToPct(player.currentUTR)}
                caption={`You ${player.currentUTR.toFixed(1)} · team ${range.min.toFixed(1)}–${range.max.toFixed(1)}`}
                low={range.min}
                median={school.avgRosterUTR}
                high={range.max}
                you={player.currentUTR}
              />
            </div>
            <p className="mt-3 text-sm text-stone">
              Individual roster data isn&apos;t tracked yet. This band is an unverified estimate of
              the team&apos;s overall UTR range with no published source or date behind it — not
              per-player positions, and not a number to make a decision on yet.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[10px] border border-line bg-card p-[22px]">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-grass" />
              <h2 className="text-base font-semibold text-ink">Academics and cost</h2>
            </div>
            <p className="mt-2.5 text-sm text-stone">
              #{school.usNewsRanking} national academic ranking · #{nationalRank} among{" "}
              {school.division} {programType.toLowerCase()} programs by fit.
            </p>
            <EmptyState className="mt-3" title="Cost, aid, and enrollment data coming soon." />
          </div>

          <div className="rounded-[10px] border border-line bg-card p-[22px]">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-grass" />
              <h2 className="text-base font-semibold text-ink">Coaching staff</h2>
            </div>
            <p className="mt-2.5 text-sm text-stone">
              Not tracked. Seeded doesn&apos;t store coaching-staff contacts — look the staff up
              on the athletics site and you&apos;ll have the current, correct address.
            </p>
            <a
              href={staffDirectorySearchUrl(school)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-grass hover:text-grass-600"
            >
              Find the coaching staff
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            {outreach && !alreadyContacted && (
              <p className="mt-2 text-xs text-stone-light">You haven&apos;t reached out to this coach yet.</p>
            )}
            <Link
              href={`/outreach?school=${school.slug}`}
              className={cn(seededButtonVariants({ variant: "primary" }), "mt-3.5 w-full")}
            >
              Draft an email to the head coach
            </Link>
          </div>

          <div className="rounded-[10px] border border-line bg-card p-[22px]">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-grass" />
              <h2 className="text-base font-semibold text-ink">Recruiting timeline</h2>
            </div>
            <p className="mt-2.5 text-sm text-stone">
              {school.division === "D1"
                ? "D1 programs often have informal boards years out — reaching out early, even as an underclassman, is normal."
                : "D3 coaches can respond any time. Typical first contact: junior fall to junior spring."}
            </p>
          </div>
        </div>
      </div>
      <Footer />
      <Toast open={!!toast} onDismiss={dismissToast} action={toast?.action} duration={STAR_TOAST_DURATION_MS}>
        {toast?.message ?? " "}
      </Toast>
    </>
  );
}

function FitDriverRow({
  label,
  description,
  chip,
}: {
  label: string;
  description: string;
  chip: string;
}) {
  return (
    <div className="grid grid-cols-[100px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line py-3 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <span className="text-stone">{description}</span>
      <span className="inline-flex items-center whitespace-nowrap rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-stone">
        {chip}
      </span>
    </div>
  );
}
