"use client";

import Link from "next/link";
import { useMemo } from "react";
import useSWR from "swr";
import { ArrowLeft, Building2, Star, User } from "lucide-react";
import type { School } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { explainSchoolFit, fitGaps, schoolUtrRange, utrToPct } from "@/lib/school-fit";
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
import { formatPacePerYear, paceUpsideSentence } from "@/lib/fit";
import { judgingRatingFor, rangeCaption, ratingBasisLabel, schoolPageUtrRow, todayRatingFor } from "@/lib/fit-copy";
import { ProjectionNote } from "@/components/seeded/ui/projection-note";
import { DataNote, EstimateChip } from "@/components/seeded/ui/data-note";
import { formatDate, parseLocalDate } from "@/lib/time";
import { FitBadge } from "@/components/seeded/ui/fit-badge";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { SeededButton, seededButtonVariants } from "@/components/seeded/ui/button";
import { Toast } from "@/components/seeded/ui/toast";
import { SUPPORT_EMAIL } from "@/lib/config/contact";
import { SchoolMonogram } from "@/components/seeded/ui/school-monogram";
import { seniorSummerPhase, seniorSummerVerb } from "@/lib/senior-summer";
import { useStarSchools, STAR_TOAST_DURATION_MS } from "@/lib/hooks/use-star-schools";
import { cn, formatPlayerUtr, formatUtrEstimate, hasRealUtr } from "@/lib/utils";
import { formatIsoDate } from "@/lib/catalog/programs";
import { schoolRangeNote } from "@/lib/db/schools";
import type { SchoolDetails } from "@/lib/types";
import type { ProgramRosterPage } from "@/lib/db/roster";
import { SchoolRosterCard, SchoolStaffList } from "@/components/seeded/schools/school-roster";
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
  /** The official roster by name and the coaching staff (migration 054);
   *  empty for a school with no imported roster. */
  roster?: ProgramRosterPage;
}

// Client Component (promoted from Server Component — needs usePlayer() for
// real personalization: fit band, UTR comparison, save-to-targets). Rebuilt
// pixel-exact to SchoolProfile.dc.html, which has NO brand-colored hero
// banner, avatar circle, rank badge, or stat-tiles grid — those were this
// file's own earlier invention, before the real mockup existed. Removed to
// match; the real ranking data they showed (US News, conference rank) now
// lives inside the "Academics" card below instead of a dedicated tile row.
export function SeededSchoolDetail({ school, programType, allSchools, roster }: Props) {
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
  // Which rating that is, said beside every number from it (final-check A2):
  // "by summer 2027, estimate" or "today", in lib/fit-copy.ts's words.
  // One pure helper for every fit screen (lib/fit-copy.ts, verifier M1).
  // The school page has no what-if slider.
  const judgingRating = judgingRatingFor({ report, whatIf: null, graduationYear: subject.graduationYear });
  const judgingBasis = judgingRating?.basis ?? null;
  const subjectWho = subjectFirst ?? "You";
  const utrRow = judgingRating ? schoolPageUtrRow(judgingRating, todayRatingFor(subjectUtr), school, subjectWho) : null;
  const gaps = judgingValue != null ? fitGaps(judgingValue, school) : null;
  const range = schoolUtrRange(school);

  // One text-and-star control uses the shared target mechanism, including
  // the Free cap, optimistic update, Undo toast and rollback on failure.
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
  const Whose = subjectFirst ? `${subjectFirst}'s` : "Your";
  const pace = explanation.pace;
  // THE pace number (the report's logged pace, lib/fit.ts) through the one
  // pace formatter, and — when it is faster than the planning cap — the
  // upside sentence. Both from the report; nothing is computed here.
  const ownPace = judging?.source === "logged-pace" && judging.pace ? judging.pace.perYear : null;
  const upside = paceUpsideSentence(judging, subjectFirst);
  const paceSentence = (ownPace != null ? ` ${Whose} pace: ${formatPacePerYear(ownPace)}.` : "") + (upside ? ` ${upside}` : "");
  const paceDescription =
    pace.status !== "ready"
      ? subjectFirst
        ? `${missingPlayerUtrPhrase(subjectFirst, statsLocked)}.`
        : "Log a UTR to see your pace."
      : !pace.isProjected
        ? `Judged on ${whose} rating today, ${formatPlayerUtr(pace.projectedUTR)}: the summer before senior year ${seniorSummerVerb(seniorSummerPhase(parseLocalDate(pace.byDate).getFullYear()))}.`
        : `Estimated ${formatUtrEstimate(pace.projectedUTR)} by ${formatDate(pace.byDate)}` +
          (pace.loggedPaceReachesFloor === true
            ? `; at the pace we plan with, ${whose} logged ratings reach this team's floor.`
            : pace.loggedPaceReachesFloor === false
              ? `; at the pace we plan with, ${whose} logged ratings don't reach this team's floor.`
              : explanation.band === "reach"
                ? subjectFirst
                  ? `; three logged ratings will show whether ${whose} pace reaches the floor.`
                  : "; log 3 ratings to see whether your pace reaches the floor."
                : ".") +
          paceSentence;

  const fitSkeleton = (
    <div key="fit-skeleton" className="mt-6 grid gap-5 lg:grid-cols-2" aria-busy="true">
      <div className="min-h-[420px] animate-pulse rounded-card border border-line bg-card" />
      <div className="min-h-[420px] animate-pulse rounded-card border border-line bg-card" />
    </div>
  );
  const fitCards = (
  // Equal-height columns (D7, owner's call 2026-11-19, reversing C22's
  // content-height cards, which left the two side by side at different
  // heights). The roster card is a column whose academics block sits at its
  // foot, so the extra height is space between sections, not under them.
  <div key="fit-cards" className="mt-6 grid gap-5 lg:grid-cols-2">
    <div className="min-w-0 rounded-card border border-line bg-card p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Why this band</h2>
        <FitBadge
          band={explanationInput.ratingHidden && explanation.band === "unverified" ? "locked" : explanation.band}
          className="text-sm"
        />
      </div>
      <p className="mt-2 text-sm text-stone">
        {explanation.summary}
      </p>

      {gaps && judging && explanation.band !== "unverified" && (
        <FitDriverRow
          label="UTR"
          description={utrRow?.description ?? ""}
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
          {explanation.alternatives.map((a) => a.shortName).join(", ")}
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

    <div className="flex min-w-0 flex-col rounded-card border border-line bg-card p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">
          {subjectFirst ? `${subjectFirst} vs team range` : "You vs team range"}
        </h2>
        {school.utrRange ? (
          <span className="text-xs text-stone">Roster checked {formatIsoDate(school.utrRange.sourceDate)}</span>
        ) : (
          <EstimateChip />
        )}
      </div>
      <div className="mt-4">
        <RangeBar
 checked={Boolean(school.utrRange)}
          rangeStartPct={utrToPct(range.min)}
          rangeEndPct={utrToPct(range.max)}
          medianPct={utrToPct(school.avgRosterUTR)}
          youPct={judgingValue != null ? utrToPct(judgingValue) : null}
          caption={
            judgingValue != null
              ? judgingRating
                ? rangeCaption(judgingRating, subjectWho, range)
                : `Team ${formatUtrEstimate(range.min)}–${formatUtrEstimate(range.max)}`
              : subjectFirst
                ? `Team ${formatUtrEstimate(range.min)}–${formatUtrEstimate(range.max)} · ${missingPlayerUtrPhrase(subjectFirst, statsLocked)}`
                : `Team ${formatUtrEstimate(range.min)}–${formatUtrEstimate(range.max)} · add your UTR to compare`
          }
          low={range.min}
          median={school.avgRosterUTR}
          high={range.max}
          you={judgingValue}
          youIsEstimate={judging?.isProjected ?? false}
          youLabel={subjectWho}
          youBasis={judgingBasis ? ratingBasisLabel(judgingBasis) : null}
        />
      </div>
      <DataNote className="mt-4">
        {schoolRangeNote(school)}
        {school.utrRange?.sourceUrl && school.utrRange.sourceUrl !== school.rosterUrl ? (
          <>
            {" "}
            <a href={school.utrRange.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {/utrsports\.net/i.test(school.utrRange.sourceUrl) ? "Team UTR page" : "Source"}
            </a>
          </>
        ) : null}
        {school.rosterUrl ? (
          <>
            {" · "}
            <a href={school.rosterUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Official roster
            </a>
          </>
        ) : null}
      </DataNote>

      {/* "Academics and cost" was its own card in the row below, two
          sentences in a box sized to its taller neighbour, while this card
          held a single range bar beside the much taller "Why this band"
          (C22, board 23 rule 5). One card now carries both. */}
      {/* Takes up the extra height of the equal-height column, so the
          academics block sits at the foot of the card. */}
      <div className="hidden flex-1 lg:block" aria-hidden />
      <div className="mt-6 border-t border-line pt-5">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-grass" aria-hidden />
          <h3 className="text-base font-semibold text-ink">Academics and cost</h3>
        </div>
        <p className="mt-2.5 text-sm text-stone">
          {/* C24: "#1 of the D1 men's programs in Seeded on our combined score"
              was jargon about a Seeded-only ranking. The rank a family can
              check is the U.S. News one. */}
          {academicRankSentence(school.usNewsRanking)}
          {school.details ? null : " Cost and aid: Not tracked; ask the aid office."}
        </p>
        {school.details ? <ProgramFacts details={school.details} /> : null}
      </div>
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
              {/* Keep the tile off narrow phones, like the /schools rows. */}
              <SchoolMonogram name={school.shortName} division={school.division} size="lg" className="mr-1.5 hidden sm:inline-flex" />
              <h1 className="font-seeded text-[34px] font-semibold tracking-tight text-ink">
                {school.name} · {programType} tennis
              </h1>
            </div>
            <p className="mt-1.5 text-stone">
              {school.division} · {school.conference} ·{" "}
              {school.city && school.state ? `${school.city}, ${school.state}` : (school.state ?? "Location not tracked")}
            </p>
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
                aria-pressed={saved}
                className={playerOnlyUntilHydrated}
              >
                <Star className={cn("h-[18px] w-[18px]", saved && "fill-current")} aria-hidden />
                {saved ? "Saved to targets" : "Save to targets"}
              </SeededButton>
            )}
          </div>
        </div>

        {fitSection}

        {/* Coaching staff is the only card left in this row, so it spans the
            width: the finder on the left, the next step on the right. The
            one-sentence "Recruiting timeline" card that once sat beside it
            is gone (design system v2 rule 5): the "Why this band" card's
            Timing row already says the same thing. */}
        <div className="mt-5 grid min-w-0 gap-5 rounded-card border border-line bg-card p-[22px] lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-grass" aria-hidden />
              <h2 className="text-base font-semibold text-ink">Coaching staff</h2>
            </div>
            {roster && roster.staff.length > 0 ? (
              <SchoolStaffList staff={roster.staff} />
            ) : (
              <StaffDirectoryHint school={school} className="mt-2.5" />
            )}
          </div>
          {/* Outreach is the player's: a parent opening /outreach is
              bounced to /family, and Seeded never writes to a coach on a
              player's behalf. */}
          {!isParent && (
            <div className={cn("min-w-0", playerOnlyUntilHydrated)}>
              <Link
                href={`/outreach?school=${school.slug}`}
                className={cn(seededButtonVariants({ variant: "secondary" }), "w-full")}
              >
                Draft a coach email
              </Link>
            </div>
          )}
        </div>

        {roster ? <SchoolRosterCard page={roster} rosterUrl={school.rosterUrl} /> : null}
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
            `Wrong data on ${school.name}`
          )}`}
          className="mt-5 inline-flex min-h-11 items-center text-xs text-stone underline-offset-4 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Report an error
        </a>
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
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 border-t border-line py-3 text-sm sm:grid-cols-[100px_minmax(0,1fr)]">
      <span className="font-semibold text-ink">{label}</span>
      <span className="min-w-0 text-stone">{description}</span>
    </div>
  );
}

/** The sheet's Program Info (migration 053). Each number shows its source
 * link; a missing one reads "Not tracked", never a guess. */
function ProgramFacts({ details }: { details: SchoolDetails }) {
  // As precise as the source: 0.06 -> "6%", 0.7665 -> "76.7%".
  const pctNum = details.acceptanceRate !== null ? Math.round(details.acceptanceRate * 1000) / 10 : null;
  const pct = pctNum === null ? null : `${Number.isInteger(pctNum) ? pctNum.toFixed(0) : pctNum.toFixed(1)}%`;
  const link = (href: string | null, text: string) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
        {text}
      </a>
    ) : null;
  return (
    <div className="mt-3 text-sm text-stone">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt>Cost of attendance</dt>
        <dd className="text-ink">
          {details.costOfAttendanceUsd !== null ? (
            <>
              ${details.costOfAttendanceUsd.toLocaleString("en-US")} a year ({details.coaYear}) ·{" "}
              {link(details.coaSourceUrl, "source")}
            </>
          ) : (
            "Not tracked"
          )}
        </dd>
        <dt>Acceptance rate</dt>
        <dd className="text-ink">{pct ?? "Not tracked"}</dd>
        <dt>Undergraduates</dt>
        <dd className="text-ink">
          {details.undergradEnrollment !== null ? details.undergradEnrollment.toLocaleString("en-US") : "Not tracked"}
        </dd>
      </dl>
      <p className="mt-2 text-xs">
        {details.scorecardSourceUrl ? <>Acceptance rate and enrollment: {link(details.scorecardSourceUrl, "College Scorecard")}. </> : null}
        Read {formatIsoDate(details.readDate)}. Cost of attendance is the figure on the linked source page, before
        any aid; for a public school it may be the in-state figure.
      </p>
      {details.coachesPageUrl || details.questionnaireUrl ? (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {link(details.coachesPageUrl, "Coaches page")}
          {link(details.questionnaireUrl, "Recruiting questionnaire")}
        </p>
      ) : null}
    </div>
  );
}
