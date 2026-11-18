"use client";

import Link from "next/link";
import { useMemo } from "react";
import useSWR from "swr";
import { ArrowLeft, Building2, User } from "lucide-react";
import type { School } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { bandPositionLabel, explainSchoolFit, fitGaps, schoolUtrRange, utrToPct } from "@/lib/school-fit";
import { StaffDirectoryHint } from "@/components/seeded/ui/staff-directory-hint";
import { loadCoachOutreach } from "@/lib/db/outreach";
import { loadUtrEntries, loadUtrEntriesFor } from "@/lib/db/plan";
import { loadFamilyMembers, type FamilyMember } from "@/lib/db/family";
import {
  missingPlayerUtrPhrase,
  pickFamilyPlayer,
  resolveFamilyPlayerFacts,
  rosterStatsLocked,
} from "@/lib/family-view";
import { loadFamilyPlanStatus, type FamilyPlanStatus } from "@/lib/db/family-plan";
import { useFitReport } from "@/lib/hooks/use-fit-report";
import { projectionTargetLabel } from "@/lib/fit";
import { ProjectionNote, projectedYouLabel } from "@/components/seeded/ui/projection-note";
import { DataNote, EstimateChip } from "@/components/seeded/ui/data-note";
import { formatDate, parseLocalDate } from "@/lib/time";
import { FitBadge } from "@/components/seeded/ui/fit-badge";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { SeededButton, seededButtonVariants } from "@/components/seeded/ui/button";
import { StarButton } from "@/components/seeded/ui/star-button";
import { Toast } from "@/components/seeded/ui/toast";
import { SUPPORT_EMAIL } from "@/lib/config/contact";
import { useStarSchools, STAR_TOAST_DURATION_MS } from "@/lib/hooks/use-star-schools";
import { cn, formatPlayerUtr, formatUtrEstimate, formatUtrFor } from "@/lib/utils";
import { academicRankSentence } from "@/lib/school-academics";

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
export function SeededSchoolDetail({ school, programType, allSchools }: Props) {
  const { player, isAuthed, hydrated } = usePlayer();
  const isParent = player.role === "parent";
  const { data: outreach } = useSWR(isParent ? null : "coach-outreach", () => loadCoachOutreach());

  // WHO this page is about. For a player, themselves. For a parent, their
  // player — resolved exactly as /schools resolves it (pickFamilyPlayer +
  // resolveFamilyPlayerFacts), so the two pages cannot name different
  // people. This page used to judge a parent's own empty profile: "add your
  // UTR to compare", addressed to someone with no rating.
  const { data: familyMembersData } = useSWR<FamilyMember[]>(isParent ? "family-members" : null, () =>
    loadFamilyMembers()
  );
  const familyMembers = familyMembersData ?? [];
  const familyPlayer = isParent ? pickFamilyPlayer(familyMembers) : undefined;
  const facts = resolveFamilyPlayerFacts(familyPlayer, player);
  // 044: a free family's roster carries no player stats. Without the plan
  // status, a NULL rating would read as "no UTR logged" — untrue for
  // a child who has one.
  const { data: plan } = useSWR<FamilyPlanStatus>(isParent ? "family-plan-status" : null, () =>
    loadFamilyPlanStatus()
  );
  const statsLocked = isParent ? rosterStatsLocked(plan) : false;
  const subjectUtr = facts.currentUtr;
  const subjectFirst = isParent ? (familyPlayer?.name ?? "").trim().split(/\s+/)[0] || "Your player" : null;
  const subject = {
    currentUTR: subjectUtr ?? 0,
    graduationYear: facts.graduationYear ?? player.graduationYear,
    gender: facts.gender ?? player.gender,
  };
  const historyUserId = isParent ? (familyPlayer?.id ?? null) : null;

  // The SAME report /schools, /today and /family read, for this one school.
  // It decides which rating judges fit (the estimate for the summer before
  // senior year until then, today's rating after), so the band here is the
  // band on the /schools row. explainSchoolFit() below only explains it.
  const oneSchool = useMemo(() => [school], [school]);
  const report = useFitReport({ player: subject, schools: oneSchool, historyUserId });
  const reportBand = report?.bandBySlug.get(school.slug);
  const judging = report?.utr ?? null;

  const { data: utrEntries } = useSWR(
    historyUserId ? ["utr-entries", historyUserId] : "utr-entries",
    () => (historyUserId ? loadUtrEntriesFor(historyUserId) : loadUtrEntries())
  );
  const explanationInput = useMemo(
    () => ({
      utrHistory: (utrEntries ?? []).map((e) => ({ date: parseLocalDate(e.recordedAt), utr: e.utr })),
      graduationYear: subject.graduationYear,
      gender: subject.gender,
      catalog: allSchools,
      subjectName: subjectFirst,
      ratingHidden: statsLocked === true && subjectUtr == null,
    }),
    [utrEntries, subject.graduationYear, subject.gender, allSchools, subjectFirst, statsLocked, subjectUtr]
  );

  // The fit card waits for WHO (a parent's family roster) and for the
  // logged history that splits Reach from Out of range. Rendering before
  // either arrived judged the parent's own empty profile, then the child;
  // and banded Reach, then Out of range — visible as rows vanishing and
  // reappearing (measured CLS 0.13 at 320 for persona f).
  const fitReady =
    (!isParent || (familyMembersData !== undefined && plan !== undefined)) && utrEntries !== undefined;

  // `estimate`: the Pace row prints the report's own projection — ONE
  // number for the summer before senior year on this card (C8).
  const explanation = explainSchoolFit(subjectUtr, school, {
    ...explanationInput,
    band: reportBand,
    estimate: report?.utr ?? null,
  });
  // The gaps, the chip and the range bar's marker all use the rating that
  // judged the band — the same one the /schools row shows — so the two pages
  // print the same "Gap to team average" for the same school.
  const judgingValue = judging?.value ?? null;
  const gaps = judgingValue != null ? fitGaps(judgingValue, school) : null;
  const range = schoolUtrRange(school);
  const alreadyContacted = Boolean(outreach?.[school.slug]);

  // Same shared star-to-target mechanism as the Schools browser and Plan —
  // optimistic update, Undo toast, silent rollback on a real write
  // failure. "Save to targets" below is this page's existing text-button
  // affordance for the exact same action; the star icon next to the title
  // is the new one, both wired to the same toggleStar call.
  const { isStarred, toggleStar, toast, dismissToast, canStar } = useStarSchools();
  const saved = isStarred(school.slug);
  // Before the session resolves, `player.role` is the default ("player"),
  // so the star, "Save to targets" and "Draft an email" render — and then
  // vanish for a parent once their role arrives. At 320px that removed a
  // wrapped header row and moved the page under the reader (PR A, persona
  // f: CLS 0.089). The head script already marks html[data-role] from the
  // remembered role, so until hydration these carry a class that CSS hides
  // for a remembered parent: they are never drawn, so nothing disappears.
  const playerOnlyUntilHydrated = hydrated ? undefined : "pre-session-player-only";

  // C8: this row used to extend a regression through the logged ratings
  // and print "8.5 by Jun 1, 2028" two lines above the ProjectionNote's
  // "7.5 for summer 2028" — two projections for one date. It now prints the
  // report's estimate (the same number), and says what the logged pace
  // means for THIS school's band in words: that is what splits Reach from
  // Out of range, and it never needs a second number.
  const whose = subjectFirst ? `${subjectFirst}'s` : "your";
  const pace = explanation.pace;
  const paceDescription =
    pace.status !== "ready"
      ? subjectFirst
        ? `${missingPlayerUtrPhrase(subjectFirst, statsLocked)}.`
        : "Log a UTR to see your pace."
      : !pace.isProjected
        ? `Judged on ${whose} rating today, ${formatPlayerUtr(pace.projectedUTR)}: the summer before senior year has begun.`
        : `Estimated ${formatUtrEstimate(pace.projectedUTR)} by ${formatDate(pace.byDate)}.` +
          (pace.loggedPaceReachesFloor === true
            ? ` The pace in ${whose} logged ratings reaches this team's floor by then.`
            : pace.loggedPaceReachesFloor === false
              ? ` The pace in ${whose} logged ratings doesn't reach this team's floor by then.`
              : explanation.band === "reach"
                ? subjectFirst
                  ? ` Three logged ratings will show whether ${whose} own pace reaches the floor.`
                  : " Log 3 ratings to see whether your own pace reaches the floor."
                : "");

  const fitSkeleton = (
    <div key="fit-skeleton" className="mt-6 grid gap-5 lg:grid-cols-2" aria-busy="true">
      <div className="min-h-[420px] animate-pulse rounded-[10px] border border-line bg-card" />
      <div className="min-h-[420px] animate-pulse rounded-[10px] border border-line bg-card" />
    </div>
  );
  const fitCards = (
  <div key="fit-cards" className="mt-6 grid gap-5 lg:grid-cols-2">
    <div className="min-w-0 rounded-[10px] border border-line bg-card p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Why this band</h2>
        <FitBadge band={explanation.band} className="text-sm" />
      </div>
      <p className="mt-2 text-sm text-stone">
        {explanation.summary}
      </p>

      {gaps && judging && explanation.band !== "unverified" && (
        <FitDriverRow
          label="UTR"
          description={
            judging.isProjected
              ? `${projectedYouLabel(judging, subjectFirst)} ${formatUtrEstimate(judging.value)}: gap to floor ${signed(gaps.gapToFloor)} · gap to team average ${signed(gaps.gapToMedian)} · today ${formatPlayerUtr(subjectUtr as number)}`
              : `Gap to floor ${signed(gaps.gapToFloor)} · gap to team average ${signed(gaps.gapToMedian)}`
          }
          chip={
            bandPositionLabel(explanation.band) +
            (judging.isProjected ? ` by ${projectionTargetLabel(judging.year)} (est.)` : "")
          }
        />
      )}
      <FitDriverRow label="Pace" description={paceDescription} />
      <FitDriverRow label="Timing" description={explanation.timing} />

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

      {/* Design system v2 rule 2: one calm data note per card. It used to
          carry a projection paragraph, three driver chips ("Needs data",
          "Projected", "General") and a closing two-caveat line. */}
      {judging?.isProjected ? (
        <ProjectionNote utr={judging} who={subjectFirst} className="mt-4" />
      ) : (
        <DataNote className="mt-4">Roster openings and academics don&apos;t change the band.</DataNote>
      )}
    </div>

    <div className="min-w-0 rounded-[10px] border border-line bg-card p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">
          {subjectFirst ? `Where ${subjectFirst} sits on this roster` : "Where you sit on this roster"}
        </h2>
        <EstimateChip />
      </div>
      <div className="mt-4">
        <RangeBar
          rangeStartPct={utrToPct(range.min)}
          rangeEndPct={utrToPct(range.max)}
          medianPct={utrToPct(school.avgRosterUTR)}
          youPct={judgingValue != null ? utrToPct(judgingValue) : null}
          caption={
            judgingValue != null
              ? `${projectedYouLabel(judging, subjectFirst)} ${formatUtrFor(judgingValue, judging?.isProjected ?? false)} · team ${formatUtrEstimate(range.min)}–${formatUtrEstimate(range.max)}`
              : subjectFirst
                ? `Team ${formatUtrEstimate(range.min)}–${formatUtrEstimate(range.max)} · ${missingPlayerUtrPhrase(subjectFirst, statsLocked)}`
                : `Team ${formatUtrEstimate(range.min)}–${formatUtrEstimate(range.max)} · add your UTR to compare`
          }
          low={range.min}
          median={school.avgRosterUTR}
          high={range.max}
          you={judgingValue}
          youIsEstimate={judging?.isProjected ?? false}
          youLabel={projectedYouLabel(judging, subjectFirst)}
        />
      </div>
      <DataNote className="mt-4">The team range is our estimate, not a published roster.</DataNote>
    </div>
  </div>
  );
  // Before the session check, a browser with a saved session gets the
  // skeleton and an anonymous one gets the cards (CSS picks, via
  // html[data-session]) — so neither swaps twice.
  const fitSection = !hydrated ? (
    <>
      <div className="pre-session-block hidden">{fitSkeleton}</div>
      <div className="pre-session-hide">{fitCards}</div>
    </>
  ) : isAuthed && !fitReady ? (
    fitSkeleton
  ) : (
    fitCards
  );

  return (
    <>
      <div className="mx-auto max-w-content container-px py-10">
        <Link href="/schools" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink hover:underline sm:min-h-6">
          <ArrowLeft className="h-4 w-4" />
          Schools
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5">
              {canStar && (
                <StarButton
                  starred={saved}
                  onToggle={() => toggleStar(school.slug, school.shortName)}
                  label={school.shortName}
                  className={playerOnlyUntilHydrated}
                />
              )}
              <h1 className="font-seeded text-[34px] font-semibold tracking-tight text-ink">
                {school.name} · {programType} tennis
              </h1>
            </div>
            <p className="mt-1.5 text-stone">
              {school.division} · {school.conference} · {school.city}, {school.state}
            </p>
            <div className="mt-2.5">
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  `Wrong data on ${school.name}`
                )}`}
                className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-pill border border-line bg-card px-3 text-sm font-semibold text-stone hover:text-ink sm:min-h-8"
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
            {canStar && (
              <SeededButton
                variant={saved ? "secondary" : "primary"}
                onClick={() => toggleStar(school.slug, school.shortName)}
                className={playerOnlyUntilHydrated}
              >
                {saved ? "Saved to targets" : "Save to targets"}
              </SeededButton>
            )}
          </div>
        </div>

        {fitSection}

        <div className="mt-5 grid items-stretch gap-5 lg:grid-cols-2">
          <div className="min-w-0 rounded-[10px] border border-line bg-card p-[22px]">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-grass" />
              <h2 className="text-base font-semibold text-ink">Academics and cost</h2>
            </div>
            <p className="mt-2.5 text-sm text-stone">
              {/* C24: "#1 of the D1 men's programs in Seeded on our combined score"
                  was jargon about a Seeded-only ranking. The rank a family can
                  check is the U.S. News one. */}
              {academicRankSentence(school.usNewsRanking)}
            </p>
            <p className="mt-3 text-sm text-stone">
              Seeded has no cost or aid figures. Ask the school&apos;s financial aid office.
            </p>
          </div>

          <div className="flex min-w-0 flex-col rounded-[10px] border border-line bg-card p-[22px]">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-grass" />
              <h2 className="text-base font-semibold text-ink">Coaching staff</h2>
            </div>
            <StaffDirectoryHint school={school} className="mt-2.5" />
            {/* The one-sentence "Recruiting timeline" card that sat beside this
                one is gone (design system v2 rule 5): the "Why this band"
                card's Timing row already says the same thing. */}
            {!isParent && outreach && !alreadyContacted && (
              <p className="mb-3.5 mt-2 text-xs text-stone-light">You haven&apos;t reached out to this coach yet.</p>
            )}
            {/* Outreach is the player's: a parent opening /outreach is
                bounced to /family, and Seeded never writes to a coach on a
                player's behalf. */}
            {!isParent && (
              <Link
                href={`/outreach?school=${school.slug}`}
                className={cn(seededButtonVariants({ variant: "secondary" }), "mt-auto w-full", playerOnlyUntilHydrated)}
              >
                Draft an email to the head coach
              </Link>
            )}
          </div>

        </div>
      </div>
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
  /** Only for a fact about THIS row (the band position) — never a caveat. */
  chip?: string;
}) {
  return (
    // Below sm the chip drops under the description: a long chip ("Between
    // floor and average by summer 2030 (est.)") in an `auto` column pushed
    // the card to 609px on a 375px phone.
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 border-t border-line py-3 text-sm sm:grid-cols-[100px_minmax(0,1fr)_auto]">
      <span className="font-semibold text-ink">{label}</span>
      <span className="min-w-0 text-stone">{description}</span>
      {chip && (
        <span className="col-start-2 inline-flex items-center justify-self-start rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-stone sm:col-start-auto sm:whitespace-nowrap">
          {chip}
        </span>
      )}
    </div>
  );
}
