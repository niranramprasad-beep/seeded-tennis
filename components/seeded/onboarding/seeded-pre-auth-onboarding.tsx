"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Gender, SchoolLite } from "@/lib/types";
import { programGenderFor } from "@/lib/types";
import { schoolUtrRange, utrToPct } from "@/lib/school-fit";
import { buildDiagnosticFitReport, playerUtrText, projectionTargetLabel, type FitView } from "@/lib/fit";
import { diagnosticValues, type DiagnosticAnswers } from "@/lib/onboarding/diagnostic";
import { projectedYouLabel } from "@/components/seeded/ui/projection-note";
import { DataNote, EstimateChip } from "@/components/seeded/ui/data-note";
import { cn } from "@/lib/utils";
import { RECRUITING_TIMING_NOTE, EARLY_DECISION_NOTE } from "@/lib/config/growth";
import { type FitBand } from "@/components/seeded/ui/fit-badge";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { DiagnosticSaveForm } from "@/components/seeded/onboarding/diagnostic/diagnostic-save";

// The fit report at the end of the /onboarding diagnostic (board 20, "See my
// fit report"). Pre-auth: it renders from the answers alone, no account.
//
// ONE report, from lib/fit.ts's buildDiagnosticFitReport — the same
// projection the diagnostic's "Projected UTR" card showed, so the number a
// family read one screen earlier is the number every band here is judged
// at. Headline, toggle, tab counts, every row band and the projection panel
// all read that one report, so they cannot disagree (lib/fit-single-source
// .test.ts, block a2, reads this file).

export function DiagnosticFitReport({
  schools,
  answers,
  onEdit,
}: {
  schools: SchoolLite[];
  answers: DiagnosticAnswers;
  onEdit: () => void;
}) {
  const values = diagnosticValues(answers);
  const gender: Gender = programGenderFor(values.gender ?? "female");
  const parent = answers.role === "parent";
  const filtered = useMemo(() => schools.filter((s) => s.gender === gender), [schools, gender]);

  const [view, setView] = useState<FitView | null>(null);
  const built = useMemo(
    () =>
      values.gradYear != null && values.gender != null
        ? buildDiagnosticFitReport({
            todayUtr: values.utrToday,
            sixMonthsAgoUtr: values.utrSixMonthsAgo,
            yearAgoUtr: values.utrYearAgo,
            graduationYear: values.gradYear,
            gender: values.gender,
            schools: filtered,
            view: view ?? undefined,
          })
        : null,
    [values.utrToday, values.utrSixMonthsAgo, values.utrYearAgo, values.gradYear, values.gender, filtered, view]
  );
  const report = built?.report ?? null;
  const projection = built?.projection ?? null;
  const today = values.utrToday;

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

  const who = parent ? "your player" : "you";
  const Who = parent ? "Your player" : "You";

  // Arriving here is a new screen after a click: start at its top, and put
  // focus on its heading so a screen reader announces the result.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="min-h-[calc(100vh-57px)] bg-cream">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-start gap-6 px-4 pb-16 pt-8 sm:px-6">
        <section className="min-w-0 flex-[999_1_640px]">
          <p className="m-0 text-sm text-stone">
            {GENDER_LABEL[gender]} · {today != null ? <>UTR <span className="font-mono">{playerUtrText(today)}</span></> : "No UTR yet"}
            {values.gradYear != null ? ` · Class of ${values.gradYear}` : ""}
            {values.gpa != null ? ` · GPA ${answers.gpaText.trim()}` : ""}{" "}
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex min-h-11 items-center font-semibold text-grass hover:text-grass-700 sm:min-h-6"
            >
              Change answers
            </button>
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 font-seeded text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-balance text-ink focus:outline-none"
          >
            {!report
              ? `Add a UTR to see ${parent ? "your player's" : "your"} fit.`
              : report.utr.isProjected && report.view === "recruiting"
                ? `By ${projectionTargetLabel(report.utr.year)}, ${who} ${parent ? "is" : "are"} on track for ${counts.target} Target and ${counts.likely} Likely programs.`
                : `${Who} ${parent ? "is" : "are"} in range for ${total} programs: ${counts.target} Target and ${counts.likely} Likely.`}
          </h1>
          {report?.canToggle && (
            <p className="mt-2 text-base text-stone">
              {report.view === "recruiting"
                ? `Today: ${report.todayInRange} in range.`
                : `By ${projectionTargetLabel(report.utr.year)}: ${report.recruitingCounts.target} Target and ${report.recruitingCounts.likely} Likely.`}
            </p>
          )}
          <p className="mt-2 text-base text-stone">
            Bands compare {parent ? "the" : "your"} rating with each team&rsquo;s estimated range.
            They change when the UTR does.
          </p>

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

          <section
            aria-label="Projected rating at recruiting time"
            className="mt-5 rounded-xl border border-line bg-card p-5"
          >
            {!report || !projection ? (
              <>
                <p className="m-0 font-semibold text-ink">No rating yet</p>
                <p className="mt-1 text-sm text-stone">
                  Add a UTR and we&rsquo;ll show where {who} {parent ? "is" : "are"} headed by the
                  summer before senior year. We won&rsquo;t guess one.
                </p>
              </>
            ) : projection.isEstimate ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="text-sm text-stone">By {projectionTargetLabel(projection.targetYear)}</span>
                  <span className="font-mono text-[28px] font-semibold leading-none tabular-nums text-ink">
                    {projection.display}
                  </span>
                  <EstimateChip />
                </div>
                <p className="mt-1.5 text-sm text-stone">{projection.note}</p>
                <p className="mt-2.5 text-sm text-ink">
                  Programs in range:{" "}
                  <strong className="font-mono tabular-nums">{report.todayInRange}</strong> today
                  → <strong className="font-mono tabular-nums">{report.recruitingInRange}</strong>{" "}
                  by {projectionTargetLabel(projection.targetYear)}.
                </p>
                <p className="mt-2.5 text-xs text-stone">
                  A guess from {parent ? "your player's" : "your"} own past ratings, not a promise.
                </p>
              </>
            ) : (
              <>
                <p className="m-0 font-semibold text-ink">
                  Judged at today&rsquo;s UTR, <span className="font-mono">{projection.display}</span>.
                </p>
                <p className="mt-1 text-sm text-stone">{projection.note}</p>
              </>
            )}
            {/* "Projected to the summer before senior year" is only true
                when a projection was made. */}
            <p className="mt-3 border-t border-line pt-3 text-sm text-stone">
              {projection?.isEstimate ? `${RECRUITING_TIMING_NOTE} ` : ""}
              {projection?.basis === "no-past-rating"
                ? "Add a rating from 6 or 12 months ago (Change answers) to see the pace. "
                : ""}
              {EARLY_DECISION_NOTE}
            </p>
          </section>

          {report && report.counts.reach + total === 0 && (
            <div className="mt-6 rounded-xl border border-line bg-card p-5">
              <p className="m-0 font-semibold text-ink">
                No program in this catalogue is a realistic fit yet.
              </p>
              <p className="mt-1.5 text-sm text-stone">
                Seeded only covers {filtered.length} {GENDER_LABEL[gender].toLowerCase()} college
                programs, and the lowest team range here starts above{" "}
                {projection ? projection.display : ""}. That is a fact about our catalogue, not a
                verdict on the player.
              </p>
              <Link
                href="/tournament-fit"
                className="mt-3.5 inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-[18px] font-sans text-[15px] font-semibold text-ink hover:bg-subtle-hover"
              >
                Check a tournament instead
              </Link>
            </div>
          )}

          {report && (
            <>
              <div role="tablist" aria-label="Fit bands" className="mt-6 flex flex-wrap gap-2">
                {(["reach", "target", "likely", "out-of-range"] as const).map((band) => (
                  <button
                    key={band}
                    type="button"
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
                <div className="grid grid-cols-[2.2fr_2fr] gap-4 border-b border-line px-5 py-3 text-[13px] font-medium text-stone">
                  <span>Program</span>
                  <span>
                    {report.utr.isProjected && report.view === "recruiting"
                      ? `${parent ? "Their" : "Your"} ${projectionTargetLabel(report.utr.year)} UTR (estimate) vs team range`
                      : `${parent ? "Their" : "Your"} UTR vs team range`}
                  </span>
                </div>
                {tabRows.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-stone">
                    No {BAND_LABEL[tab].toLowerCase()} programs for this UTR and team yet.
                  </p>
                ) : (
                  tabRows.map((s) => {
                    const range = schoolUtrRange(s);
                    const row = report.rows.find((r) => r.slug === s.slug);
                    const projectedView = report.utr.isProjected && report.view === "recruiting";
                    // The dot sits where the row's band was judged: the
                    // estimate in the summer view, today's rating today.
                    const judging = projectedView || today == null ? report.utr.value : today;
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
                          {row?.differs && (
                            <div className="mt-1 text-[13px] text-stone">
                              Today: {BAND_LABEL[row.todayBand] ?? row.todayBand} &rarr; By{" "}
                              {projectionTargetLabel(report.utr.year)}:{" "}
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
                            projectedView
                              ? `Summer ${report.utr.year} ${projection?.display ?? ""} (estimate) · today ${today != null ? playerUtrText(today) : ""} · team ${range.min.toFixed(1)}–${range.max.toFixed(1)}`
                              : `${parent ? "Player" : "You"} ${playerUtrText(judging)} · team ${range.min.toFixed(1)}–${range.max.toFixed(1)}`
                          }
                          low={range.min}
                          median={(range.min + range.max) / 2}
                          high={range.max}
                          you={judging}
                          youLabel={projectedView ? projectedYouLabel(report.utr) : parent ? "Player" : "You"}
                          todayPct={projectedView && today != null ? utrToPct(today) : null}
                          today={projectedView ? today : null}
                        />
                      </div>
                    );
                  })
                )}
                <DataNote className="px-5 py-3">Team UTR ranges are our estimates, not published rosters.</DataNote>
              </div>
            </>
          )}
        </section>

        <aside className="min-w-0 flex-[1_1_340px] rounded-xl border border-line bg-card p-6">
          <h2 className="m-0 text-xl text-ink">{parent ? "Make your parent account" : "Save your report"}</h2>
          <p className="mb-5 mt-2 text-[15px] leading-[1.5] text-stone">
            {parent
              ? "Free. You'll get a family code to give your player."
              : "Free account. Every answer comes with you, and the bands update each time you log a result."}
          </p>
          <DiagnosticSaveForm answers={answers} idPrefix="report-save" />
        </aside>
      </div>
      <p className="mx-auto max-w-[1200px] px-6 pb-4 text-xs text-stone">
        Fit bands use {parent ? "the" : "your"} UTR and each program&apos;s roster range:{" "}
        {filtered.length} programs for {GENDER_LABEL[gender]} in the catalog.
      </p>
    </div>
  );
}

const BAND_LABEL: Record<FitBand, string> = {
  reach: "Reach",
  target: "Target",
  likely: "Likely",
  "out-of-range": "Out of range",
  unverified: "No UTR yet",
};
const GENDER_LABEL: Record<Gender, string> = { women: "Women's", men: "Men's" };
