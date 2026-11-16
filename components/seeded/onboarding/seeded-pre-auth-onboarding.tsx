"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { FamilyRole, Gender, Player, SchoolLite } from "@/lib/types";
import { getCurrentGrade, getCurrentSchoolYear, getDefaultCommitDate } from "@/lib/time";
import { schoolUtrRange, utrToPct, type FitCounts } from "@/lib/school-fit";
import { usePlayer } from "@/lib/context/player-context";
import { signUp } from "@/lib/auth";
import { GoogleButton, GoogleDivider, authInputClass } from "@/components/auth/auth-card";
import { validateUtrProfileLink } from "@/lib/utr-profile-link";
import { realisticPaceProjectionFor } from "@/lib/what-if-utr";
import { parentConsentRequired } from "@/lib/config/consent";
import { buildFitReport, projectionTargetLabel, type FitView } from "@/lib/fit";
import { projectedYouLabel } from "@/components/seeded/ui/projection-note";
import { cn } from "@/lib/utils";
import {
  GROWTH_ESTIMATE_CAPTION,
  GROWTH_ESTIMATE_CHIP,
  RECRUITING_TIMING_NOTE,
  EARLY_DECISION_NOTE,
  growthAssumptionLabel,
} from "@/lib/config/growth";
import { FitBadge, type FitBand } from "@/components/seeded/ui/fit-badge";
import { DataChip } from "@/components/seeded/ui/data-chip";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { SeededButton } from "@/components/seeded/ui/button";

// Pixel-exact to Onboarding.dc.html — the public, pre-auth "fit report
// before account creation" journey. Seeded-only: Legacy's /onboarding keeps
// its existing AuthGate-wrapped OnboardingFlow entirely unchanged (see
// app/onboarding/page.tsx). Under-13 handling and Google OAuth are real,
// not fabricated — see the phase report for what's genuinely wired vs. what
// needs external configuration (Google provider in Supabase) to finish.
//
// Server rendering: useSearchParams() in a statically rendered page bails
// the whole subtree out to client-only rendering, so the server HTML of
// /onboarding was the nav and an empty <main> — a crawler that does not run
// JavaScript saw no fit report on the top of the funnel. The URL-reading
// half is now its own component inside a Suspense boundary whose fallback
// is this same form with no URL params (its defaults), which the server
// CAN render. The client swaps in the URL-aware one on hydration.
export function SeededPreAuthOnboarding({ schools }: { schools: SchoolLite[] }) {
  return (
    <Suspense fallback={<PreAuthOnboarding schools={schools} params={EMPTY_PARAMS} />}>
      <PreAuthOnboardingFromUrl schools={schools} />
    </Suspense>
  );
}

const EMPTY_PARAMS = new URLSearchParams();

function PreAuthOnboardingFromUrl({ schools }: { schools: SchoolLite[] }) {
  const params = useSearchParams();
  return <PreAuthOnboarding schools={schools} params={params} />;
}

function PreAuthOnboarding({
  schools,
  params,
}: {
  schools: SchoolLite[];
  params: Pick<URLSearchParams, "get">;
}) {
  const router = useRouter();
  const { beginSession } = usePlayer();

  // A rating Postgres would actually accept: `profiles_current_utr_check`
  // (migration 006, live on production) is `between 1 and 16.5`. Anything
  // else is not a low rating, it is the absence of one.
  const isUsableUtr = (v: number) => Number.isFinite(v) && v >= 1 && v <= 16.5;

  // Empty, not "7": a rating the visitor did not type is not their rating,
  // and it would be saved to the account they create from this screen.
  const [utr, setUtr] = useState(() => params.get("utr") ?? "");
  const [gradYear, setGradYear] = useState(() => Number(params.get("gradYear")) || gradYearOptions()[1]);
  const [gender, setGender] = useState<Gender>(() => (params.get("gender") as Gender) || "women");
  // No default. `?? "3.5"` printed "GPA 3.5" for persona (e), who gives
  // no GPA — a number they never typed, rendered as their own fact.
  // "No generated or made-up data, anywhere."
  const [gpa, setGpa] = useState(() => params.get("gpa") ?? "");
  // Was `!params.get("utr")`, which only caught a MISSING param. "0" is a
  // non-empty string and therefore truthy, so `/onboarding?utr=0` — and
  // `?utr=abc`, via `parseFloat(...) || 0` below — skipped the form and
  // rendered a whole fit report against the sentinel: "UTR 0.0",
  // "realistic target for 0 programs", "Reach 0 / Target 0 / Likely 0".
  // Reachable from the homepage CTA by clearing the prefilled rating.
  // Now anything that is not a rating the database would accept starts on
  // the form, which is what the page is for.
  const [editing, setEditing] = useState(() => !isUsableUtr(parseFloat(params.get("utr") ?? "")));

  const utrNum = parseFloat(utr) || 0;
  const filtered = useMemo(() => schools.filter((s) => s.gender === gender), [schools, gender]);

  // P1-FIT-4: this was the last `classifySchoolFit(utr, school)` in the
  // product with no third argument. No projection does not mean "abstain" —
  // it means "reach" for every school below the team floor, so a visitor
  // who typed 3.0 was shown Stanford as a Reach and "Out of range 0". A
  // pre-auth visitor has no logged history to project, so the honest input
  // is the realistic-pace line: where they'd be by the summer before senior
  // year improving at REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max. See
  // realisticPaceProjectionFor() for why that bound and not the middle.
  const projection = useMemo(
    () =>
      realisticPaceProjectionFor({
        currentUTR: utrNum,
        graduationYear: gradYear,
        gender: gender === "women" ? "female" : "male",
      }),
    [utrNum, gradYear, gender]
  );

  // ONE report. Headline, toggle, tab counts, every row band and the
  // trajectory line all read it, so they cannot disagree — which they did,
  // loudly: for Men's 8.7 Class of 2031 this screen used to say "0 programs"
  // in the headline, "Reach 37 · Target 0 · Likely 0" in the tabs, and
  // "0 today → 20 by junior year" in the panel, all at once. Each number was
  // right about a different question and nothing said so.
  const [view, setView] = useState<FitView | null>(null);
  const report = useMemo(
    () =>
      buildFitReport({
        currentUtr: utrNum > 0 ? utrNum : null,
        graduationYear: gradYear,
        gender: gender === "women" ? "female" : "male",
        schools: filtered,
        view: view ?? undefined,
        projectionInput: projection,
      }),
    [utrNum, gradYear, gender, filtered, view, projection]
  );

  const counts = report?.counts ?? { reach: 0, target: 0, likely: 0, outOfRange: 0 };
  const total = report?.inRange ?? 0;

  const [tab, setTab] = useState<FitBand>("target");
  const tabRows = useMemo(
    () =>
      filtered
        .filter((s) => report?.bandBySlug.get(s.slug) === tab)
        .sort((a, b) => a.minCompetitiveUTR - b.minCompetitiveUTR),
    [filtered, report, tab]
  );

  if (editing) {
    return (
      <LevelForm
        utr={utr}
        setUtr={setUtr}
        gradYear={gradYear}
        setGradYear={setGradYear}
        gender={gender}
        setGender={setGender}
        gpa={gpa}
        setGpa={setGpa}
        // Same gate on the way out of the form: Continue cannot hand the
        // report an unusable value either.
        onContinue={() => {
          if (isUsableUtr(parseFloat(utr))) setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-57px)] bg-cream">
      {/* The logo used to live here, as this page's only header. It is now
          the shared SeededNav above (app-shell), so this is just the
          progress strip — which is what it always should have been. */}
      <div className="mx-auto flex max-w-[1200px] items-center px-6 py-[18px]">
        <ol aria-label="Progress" className="m-0 flex flex-1 flex-wrap justify-center gap-2 p-0 text-[13px] text-stone">
          <ProgressChip done>1 · Your level</ProgressChip>
          <ProgressChip active>2 · Your fit report</ProgressChip>
          <ProgressChip>3 · Save it</ProgressChip>
          <ProgressChip>4 · Your plan</ProgressChip>
        </ol>
      </div>

      <main className="mx-auto flex max-w-[1200px] flex-wrap items-start gap-6 px-6 pb-16 pt-4">
        <section className="min-w-0 flex-[999_1_640px]">
          <p className="m-0 text-sm text-stone">
            {GENDER_LABEL[gender]} · UTR {utrNum.toFixed(1)} · Class of {gradYear}
            {gpa.trim() ? ` · GPA ${gpa}` : ""}{" "}
            <button onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center font-semibold text-grass hover:text-grass-700 sm:min-h-6">
              Edit
            </button>
          </p>
          <h1 className="mt-2 font-seeded text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-balance text-ink">
            {/* Keyed off the SELECTED VIEW, not merely whether a
                projection exists. Keying it off `isProjected` meant the
                Today view still announced "By junior year…" above today's
                numbers — the same conflation of two questions this
                workstream exists to remove, reintroduced by the toggle
                that was meant to separate them. Caught by walking the
                persona rather than by a test. */}
            {report?.utr.isProjected && report.view === "recruiting"
              ? `By ${projectionTargetLabel(report.utr.year)}, you're on track for ${counts.target} Target and ${counts.likely} Likely programs.`
              : `You're in range for ${total} programs — ${counts.target} Target and ${counts.likely} Likely.`}
          </h1>
          {/* The other view's number, always — whichever view is showing.
              A 7th grader looking at "0 programs" needs the junior-year
              number beside it, and a family looking at the junior-year
              number needs to know it is not today's. */}
          {report?.canToggle && (
            <p className="mt-2 text-base text-stone">
              {report.view === "recruiting"
                ? `Today: ${report.todayInRange} in range — that's normal for the Class of ${gradYear}.`
                : `By ${projectionTargetLabel(report.utr.year)}: ${report.recruitingCounts.target} Target and ${report.recruitingCounts.likely} Likely.`}
            </p>
          )}
          {/* Was "Sorted by how well your rating, graduating seniors and
              academics line up" — neither seniors nor academics is part of
              a band (lib/school-fit.ts). */}
          <p className="mt-2 text-base text-stone">
            Bands come from your rating against each team&rsquo;s estimated range. They change
            when your UTR does.
          </p>

          {/* The toggle only appears when the two views genuinely differ.
              A control that changes nothing is worse than no control. */}
          {report?.canToggle && (
            <div
              role="group"
              aria-label="Which rating to judge fit by"
              className="mt-4 inline-flex rounded-lg border border-line bg-card p-1"
            >
              {([
                ["recruiting", `By ${projectionTargetLabel(report.utr.year)}`],
                ["today", "Today"],
              ] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={report.view === v}
                  className={cn(
                    "min-h-11 rounded-md px-4 font-sans text-[15px] font-semibold transition-colors",
                    report.view === v ? "bg-ink text-cream" : "text-ink hover:bg-subtle-hover"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* TASK 3: where you're headed, not just where you are. */}
          <section
            aria-label="Projected rating at recruiting time"
            className="mt-5 rounded-xl border border-line bg-card p-5"
          >
            {!report ? (
              <>
                <p className="font-semibold text-ink">No rating yet</p>
                <p className="mt-1 text-sm text-stone">
                  Add your UTR above and we&rsquo;ll show where you&rsquo;re headed by the summer
                  before senior year. We won&rsquo;t guess one for you.
                </p>
              </>
            ) : !report.utr.isProjected ? (
              <>
                <p className="font-semibold text-ink">
                  You&rsquo;re being recruited now, at {report.utr.value.toFixed(1)}.
                </p>
                <p className="mt-1 text-sm text-stone">
                  The bands below use your rating today — no projected growth, because
                  the summer before senior year has already begun.
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="text-sm text-stone">By {projectionTargetLabel(report.utr.year)}</span>
                  <span className="font-mono text-[28px] font-semibold leading-none tabular-nums text-ink">
                    {report.utr.value.toFixed(1)}
                  </span>
                  <span className="rounded-pill border border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--c-gold-tint-text))]">
                    {GROWTH_ESTIMATE_CHIP}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-stone">
                  Slower {report.utr.low.toFixed(1)} · faster {report.utr.high.toFixed(1)}
                </p>
                {/* The SAME numbers the tabs and rows use — these come
                    from the one report, so "in range" here and the tab
                    totals below are the same arithmetic, not two. */}
                <p className="mt-2.5 text-sm text-ink">
                  Programs in range:{" "}
                  <strong className="font-mono tabular-nums">{report.todayInRange}</strong> today
                  → <strong className="font-mono tabular-nums">{report.recruitingInRange}</strong>{" "}
                  by {projectionTargetLabel(report.utr.year)}.
                </p>
                <p className="mt-2.5 text-xs text-stone">
                  {growthAssumptionLabel("normal")} {GROWTH_ESTIMATE_CAPTION}
                </p>
              </>
            )}
            <p className="mt-3 border-t border-line pt-3 text-sm text-stone">
              {RECRUITING_TIMING_NOTE} {EARLY_DECISION_NOTE}
            </p>
          </section>

          {/* Persona (e) — a beginner at 4.0 — had every band empty in
              both views: three tabs reading 0 and a table saying "no
              programs yet", with nothing to do next. Honest, and a dead
              end. This says what the catalogue actually covers and where
              to go instead, without inventing a program that fits. */}
          {report && report.counts.reach + total === 0 && (
            <div className="mt-6 rounded-xl border border-line bg-card p-5">
              <p className="m-0 font-semibold text-ink">
                No program in this catalogue is a realistic fit yet.
              </p>
              <p className="mt-1.5 text-sm text-stone">
                Seeded only covers {filtered.length} {GENDER_LABEL[gender].toLowerCase()} college
                programs, and the lowest team range here starts well above a{" "}
                {utrNum.toFixed(1)} UTR
                {report.utr.isProjected ? ` — even at ${report.utr.value.toFixed(1)} by ${projectionTargetLabel(report.utr.year)}` : ""}.
                That is a fact about our catalogue, not a verdict on the player.
              </p>
              <p className="mt-2.5 text-sm text-stone">
                Log results as you play and this report updates every time your rating moves.
                The tournament checker works at any level.
              </p>
              <Link
                href="/tournament-fit"
                className="mt-3.5 inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-[18px] font-sans text-[15px] font-semibold text-ink hover:bg-subtle-hover"
              >
                Check a tournament instead
              </Link>
            </div>
          )}

          <div role="tablist" aria-label="Fit bands" className="mt-6 flex flex-wrap gap-2">
            {/* Out-of-range was missing, so the tabs summed to 27 of 37
                for persona (a) and 12 of 37 for a junior — 25 programs the
                same page names in its footer and cannot show. /methodology
                documents four bands and /schools shows four; this showed
                three and said nothing. Toggling to the junior-year view
                also moved programs into a band that did not exist here, so
                they vanished with no explanation. */}
            {(["reach", "target", "likely", "out-of-range"] as const).map((band) => (
              <button
                key={band}
                role="tab"
                aria-selected={tab === band}
                onClick={() => setTab(band)}
                className={
                  tab === band
                    ? "min-h-11 rounded-lg border border-ink bg-ink px-4 font-sans text-[15px] font-semibold text-cream"
                    : "min-h-11 rounded-lg border border-line bg-card px-4 font-sans text-[15px] font-semibold text-ink"
                }
              >
                {BAND_LABEL[band]}  {band === "out-of-range" ? counts.outOfRange : counts[band]}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-card">
            {/* A6: "Openings" and "Academics" were hardcoded
                `<DataChip status="missing">Not tracked</DataChip>` on every
                row. A table whose last two columns read "Not tracked" all
                the way down doesn't read as honest, it reads as broken.
                Neither field exists on `School`, so the columns are gone
                until they do — and the note under the table already says
                what we have and don't. */}
            <div className="grid grid-cols-[2.2fr_2fr] gap-4 border-b border-line px-5 py-3 text-[13px] font-medium text-stone">
              <span>Program</span>
              <span>
                {report?.utr.isProjected && report.view === "recruiting"
                  ? `Your ${projectionTargetLabel(report.utr.year)} UTR (estimate) vs team range`
                  : "Your UTR vs team range"}
              </span>
            </div>
            {tabRows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-stone">
                No {BAND_LABEL[tab].toLowerCase()} programs for this UTR and team yet.
              </p>
            ) : (
              tabRows.map((s) => {
                const range = schoolUtrRange(s);
                const row = report?.rows.find((r) => r.slug === s.slug);
                const judging = report?.utr.value ?? utrNum;
                return (
                  <div
                    key={s.id}
                    className="grid grid-cols-[2.2fr_2fr] items-center gap-4 border-b border-line px-5 py-3.5 last:border-0"
                  >
                    <div>
                      <strong className="text-[15px] text-ink">{s.shortName}</strong>
                      <div className="text-[13px] text-stone">
                        {s.division} · {s.conference} · {s.state}
                      </div>
                      {/* A4: when the two views disagree for this school,
                          say both rather than making the reader guess which
                          rating the band came from. */}
                      {row?.differs && (
                        <div className="mt-1 text-[13px] text-stone">
                          Today: {BAND_LABEL[row.todayBand] ?? row.todayBand} &rarr; By{" "}
                          {report ? projectionTargetLabel(report.utr.year) : "then"}:{" "}
                          <strong className="font-semibold text-ink">
                            {BAND_LABEL[row.recruitingBand] ?? row.recruitingBand}
                          </strong>
                        </div>
                      )}
                    </div>
                    <RangeBar
                      rangeStartPct={utrToPct(range.min)}
                      rangeEndPct={utrToPct(range.max)}
                      medianPct={utrToPct((range.min + range.max) / 2)}
                      youPct={utrToPct(judging)}
                      caption={
                        report?.utr.isProjected && report.view === "recruiting"
                          ? `${report ? projectionTargetLabel(report.utr.year).replace(/^s/, "S") : "Projected"} ${judging.toFixed(1)} (estimate) · today ${utrNum.toFixed(1)} · team ${range.min.toFixed(1)}–${range.max.toFixed(1)}`
                          : `You ${judging.toFixed(1)} · team ${range.min.toFixed(1)}–${range.max.toFixed(1)}`
                      }
                      low={range.min}
                      median={(range.min + range.max) / 2}
                      high={range.max}
                      you={judging}
                      youLabel={report?.utr.isProjected && report.view === "recruiting" ? projectedYouLabel(report.utr) : "You"}
                      todayPct={report?.utr.isProjected ? utrToPct(utrNum) : null}
                      today={report?.utr.isProjected ? utrNum : null}
                    />
                  </div>
                );
              })
            )}
            {/* P0-7: "Every range shows its source and verification date"
                read as a description of what the product does. It doesn't —
                no range has a source or a date. */}
            <p className="m-0 px-5 py-3 text-[13px] text-stone">
              These team ranges are unverified estimates, with no published source or
              date behind them.
            </p>
          </div>
        </section>

        <SaveReportAside
          utr={utrNum}
          gradYear={gradYear}
          gender={gender}
          onSaved={(player) => {
            beginSession(player);
            router.replace("/onboarding");
          }}
        />
      </main>
      <p className="mx-auto max-w-[1200px] px-6 pb-4 text-xs text-stone">
        Fit bands shown here use your UTR and each program&apos;s roster
        range — {filtered.length} programs for {GENDER_LABEL[gender]} in the catalog.
      </p>
    </div>
  );
}

const BAND_LABEL: Record<FitBand, string> = {
  reach: "Reach",
  target: "Target",
  likely: "Likely",
  "out-of-range": "Out of range",
  unverified: "Unverified",
};
const GENDER_LABEL: Record<Gender, string> = { women: "Women's", men: "Men's" };

function ProgressChip({ children, done, active }: { children: React.ReactNode; done?: boolean; active?: boolean }) {
  return (
    <li
      className={
        done
          ? "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-grass-100 bg-grass-50 px-2.5 py-1 text-xs font-semibold text-grass"
          : active
            ? "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-ink bg-ink px-2.5 py-1 text-xs font-semibold text-cream"
            : "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-stone"
      }
    >
      {children}
    </li>
  );
}

function gradYearOptions(): number[] {
  const start = getCurrentSchoolYear();
  return Array.from({ length: 6 }, (_, i) => start + i);
}

/* ------------------------------------------------------------ STEP 1 */

function LevelForm({
  utr,
  setUtr,
  gradYear,
  setGradYear,
  gender,
  setGender,
  gpa,
  setGpa,
  onContinue,
}: {
  utr: string;
  setUtr: (v: string) => void;
  gradYear: number;
  setGradYear: (v: number) => void;
  gender: Gender;
  setGender: (v: Gender) => void;
  gpa: string;
  setGpa: (v: string) => void;
  onContinue: () => void;
}) {
  // An empty or out-of-range rating used to make the button silently do
  // nothing. Say why, next to the field, once they have tried.
  const [tried, setTried] = useState(false);
  const parsed = parseFloat(utr);
  const utrOk = Number.isFinite(parsed) && parsed >= 1 && parsed <= 16.5;
  const utrError = tried && !utrOk ? "Enter your UTR — a number from 1 to 16.5." : null;
  return (
    <div className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md flex-col justify-center px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-grass">Your level</p>
      <h1 className="mt-2 font-seeded text-3xl font-bold text-ink">What&apos;s your level today?</h1>
      <p className="mt-2 text-stone">We&apos;ll compare you to real programs right away — no account needed yet.</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
          Current UTR
          <input
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            className="h-11 rounded-md border border-input px-3 font-mono text-base tabular-nums text-ink placeholder:text-stone-light"
            inputMode="decimal"
            placeholder="e.g. 8.25"
            autoComplete="off"
            aria-invalid={utrError ? true : undefined}
            aria-describedby={utrError ? "utr-error" : undefined}
          />
          {utrError && (
            <span id="utr-error" role="alert" className="text-sm font-normal text-error">
              {utrError}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
          Grad year
          <select
            value={gradYear}
            onChange={(e) => setGradYear(Number(e.target.value))}
            className="h-11 rounded-md border border-input bg-card px-2.5 text-base text-ink"
          >
            {gradYearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
          Team
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender)}
            className="h-11 rounded-md border border-input bg-card px-2.5 text-base text-ink"
          >
            <option value="women">Women&apos;s</option>
            <option value="men">Men&apos;s</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
          Unweighted GPA
          <input
            value={gpa}
            onChange={(e) => setGpa(e.target.value)}
            className="h-11 rounded-md border border-input px-3 font-mono text-base tabular-nums text-ink"
            inputMode="decimal"
          />
        </label>
      </div>
      <SeededButton
        className="mt-6"
        onClick={() => {
          setTried(true);
          onContinue();
        }}
      >
        See my fit report
      </SeededButton>
    </div>
  );
}

/* --------------------------------------------------------- SAVE STEP */

// P0-8: the under-13 rule lives in lib/config/consent.ts and is mirrored by
// migration 030's consent_required_for_birth_year(), with a test asserting
// the two agree. This file used to carry its own `age < 13`, which was a
// third copy and the only one that was lenient about the ambiguous year.

function SaveReportAside({
  utr,
  gradYear,
  gender,
  onSaved,
}: {
  utr: number;
  gradYear: number;
  gender: Gender;
  onSaved: (player: Player) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  // Same rule as /signup (components/auth/signup-flow.tsx): nudge, never
  // block. A last word of one letter plus an optional dot is an initial.
  const lastNameWord = name.trim().split(/\s+/).slice(-1)[0] ?? "";
  const looksLikeFullSurname =
    name.trim().split(/\s+/).length > 1 && !/^[A-Za-z]\.?$/.test(lastNameWord);
  const [role, setRole] = useState<FamilyRole>("player");
  const [birthYear, setBirthYear] = useState(() => new Date().getFullYear() - 16);
  const [utrProfileLink, setUtrProfileLink] = useState("");
  const [utrLinkError, setUtrLinkError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const underAge = parentConsentRequired(birthYear);

  const save = async () => {
    setError(null);
    if (!name.trim() || !/\S+@\S+\.\S+/.test(email) || password.length < 6) {
      setError("Enter your name, a valid email, and a password of 6+ characters.");
      return;
    }
    const linkCheck = validateUtrProfileLink(utrProfileLink);
    if (!linkCheck.valid) {
      setUtrLinkError(linkCheck.error);
      return;
    }
    setUtrLinkError(null);
    setSubmitting(true);
    const grade = Math.min(12, Math.max(8, getCurrentGrade(gradYear)));
    const result = await signUp(
      {
        name,
        email,
        password,
        country: "United States",
        gender: gender === "women" ? "female" : "male",
        grade,
        birthYear,
        role,
      },
      { mode: "create" }
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    if (result.confirmationRequired) {
      setError("Check your inbox to confirm your email, then sign in to continue.");
      return;
    }
    onSaved({
      name,
      currentUTR: utr,
      graduationYear: gradYear,
      commitmentDate: getDefaultCommitDate(gradYear),
      gender: gender === "women" ? "female" : "male",
      country: "United States",
      role,
      familyCode: result.familyCode,
      targetSchoolSlugs: [],
      weaknesses: [],
      tournamentsPlayed: 0,
      tournamentsGoal: 12,
      onboarded: false,
      utrProfileLink: linkCheck.normalized ?? "",
    });
  };

  return (
    <aside className="min-w-0 flex-[1_1_340px] rounded-xl border border-line bg-card p-6">
      <h2 className="m-0 text-xl text-ink">Save your report</h2>
      <p className="mt-2 text-[15px] leading-[1.5] text-stone">
        {/* Was "We&apos;ll tell you when a school changes band" — Seeded
            has no email and no push, and nothing anywhere watches for a
            band change. The same P0-7 promise the Notifications card was
            deleted for, in a verb the copy guard did not cover. */}
        Free account. Your bands update every time you log a result, and you
        can turn this into a plan.
      </p>

      {underAge ? (
        <div className="mt-4.5 rounded-lg border border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] p-4 text-sm text-[rgb(var(--c-gold-tint-text))]">
          <p className="m-0 font-semibold">A parent creates the account and invites you.</p>
          <p className="mt-1.5">
            Players under 13 can&apos;t sign up on their own. Your parent or guardian makes
            their own Seeded account first, then gives you the family code it creates — and
            has to say yes before your account does anything. Your fit report above stays on
            this page; nothing is saved yet.
          </p>
          <Link href="/parent-signup" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-grass px-[18px] text-[15px] font-semibold text-on-primary">
            Go to parent sign-up
          </Link>
        </div>
      ) : (
        <>
          {/* The shared GoogleButton, NOT a hand-rolled one. This file had
              its own copy with no feature-flag check at all, so
              "Continue with Google" rendered on this PUBLIC page with
              NEXT_PUBLIC_GOOGLE_AUTH_ENABLED unset — the exact bug the flag
              exists to prevent, in the one place nobody looked, because the
              test that was supposed to catch a reimplementation checked
              three hand-picked files in components/auth/ and this is not
              one of them. Found by an independent verifier, 2026-11-15.
              The test now greps the whole repo. */}
          <div className="mt-4.5">
            <GoogleButton />
          </div>
          <GoogleDivider />
          {/* A7: asked for a full name while /signup asks a player for a
              first name and last initial. Two front doors to the same
              `profiles.name`, disagreeing about how much of a child's name
              Seeded needs. Same ask and the same nudge as signup. */}
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
            Player&rsquo;s name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Niran R."
              className={authInputClass}
            />
            <span className="text-xs font-normal text-stone">
              {looksLikeFullSurname
                ? "A last initial is enough — you can shorten it if you'd rather we didn't store the full surname."
                : "First name and last initial is enough — e.g. Niran R."}
            </span>
          </label>
          <label className="mt-3 flex flex-col gap-1.5 text-[13px] font-medium text-stone">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="h-11 rounded-md border border-input px-3 text-base text-ink"
            />
          </label>
          <label className="mt-3 flex flex-col gap-1.5 text-[13px] font-medium text-stone">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6+ characters"
              className="h-11 rounded-md border border-input px-3 text-base text-ink"
            />
          </label>

          <fieldset className="m-0 mt-3.5 border-0 p-0">
            <legend className="mb-1.5 text-[13px] font-medium text-stone">I am the</legend>
            <div className="flex gap-2">
              {(["player", "parent"] as const).map((r) => (
                <label
                  key={r}
                  className={
                    role === r
                      ? "inline-flex min-h-9 cursor-pointer items-center rounded-pill border border-ink bg-ink px-3.5 text-sm text-cream"
                      : "inline-flex min-h-9 cursor-pointer items-center rounded-pill border border-line bg-card px-3.5 text-sm text-ink"
                  }
                >
                  <input
                    type="radio"
                    name="who"
                    checked={role === r}
                    onChange={() => setRole(r)}
                    className="sr-only"
                  />
                  {r === "player" ? "Player" : "Parent"}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mt-3.5 flex flex-col gap-1.5 text-[13px] font-medium text-stone">
            Birth year
            <select
              value={birthYear}
              onChange={(e) => setBirthYear(Number(e.target.value))}
              className="h-11 rounded-md border border-input bg-card px-2.5 text-base text-ink"
            >
              {Array.from({ length: 18 }, (_, i) => new Date().getFullYear() - 8 - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-stone">Under 13? A parent creates the account and invites you.</p>

          <label className="mt-3.5 flex flex-col gap-1.5 text-[13px] font-medium text-stone">
            UTR profile link (optional)
            <input
              value={utrProfileLink}
              onChange={(e) => {
                setUtrProfileLink(e.target.value);
                if (utrLinkError) setUtrLinkError(null);
              }}
              onBlur={() => setUtrLinkError(validateUtrProfileLink(utrProfileLink).error)}
              placeholder="app.utrsports.net/profiles/..."
              className="h-11 rounded-md border border-input px-3 text-base text-ink"
              aria-invalid={utrLinkError ? true : undefined}
            />
          </label>
          {utrLinkError && <p className="mt-1.5 text-sm text-error">{utrLinkError}</p>}

          {error && <p className="mt-3 rounded-lg bg-error-bg px-3 py-2 text-sm text-error">{error}</p>}

          <SeededButton className="mt-4.5 w-full" onClick={save} disabled={submitting} loading={submitting}>
            Save and build my plan
          </SeededButton>
          <p className="mt-3 text-center text-xs text-stone">
            No card. We never sell player data.{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-grass">
              Privacy policy
            </Link>
            .
          </p>
        </>
      )}
    </aside>
  );
}
