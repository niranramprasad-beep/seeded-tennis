// The fit engine — THE ONBOARDING DIAGNOSTIC. Its answers go through the
// same projection rule and the same report as the signed-in app.
//
// Moved verbatim from lib/fit.ts on 2026-11-21 (the fit.ts split; every
// declaration below is byte-identical to the original, which
// lib/fit-split-purity.test.ts checks). Import from "@/lib/fit", never from
// this file: lib/fit.ts is the engine's public entry point, and
// lib/fit/engine-files.ts lists the files the guard tests treat as
// "lib/fit.ts". "This module" and "here" in the comments below mean the fit
// engine as a whole.

import type { PlayerGender, SchoolLite } from "@/lib/types";
import { parseLocalDate, shiftLocalMonths, toLocalDateString } from "@/lib/time";
import { realisticPaceProjectionFor } from "@/lib/what-if-utr";
import type { UtrDataPoint } from "@/lib/utr-projection";
import { formatPlayerUtr, formatUtrEstimate } from "@/lib/utils";
import type { SchoolFitProjectionInput } from "@/lib/school-fit";
import { isUsableUtr } from "@/lib/fit/pace";
import { seniorSummerTodayNote } from "@/lib/senior-summer";
import {
  paceUpsideSentence,
  recruitingTimeUtr,
  yearsUntilRecruiting,
  type RecruitingTimeUtr,
} from "@/lib/fit/projection";
import { buildFitReport, type FitReport, type FitView } from "@/lib/fit/bands";

/* ==========================================================================
 * THE ONBOARDING DIAGNOSTIC'S PROJECTION
 * ==========================================================================
 * /onboarding asks for today's UTR and, optionally, what it was about 6 and
 * about 12 months ago. Those answers become dated ratings — at the same
 * local dates sign-up saves them to utr_entries (pastRatingDate in
 * lib/onboarding/diagnostic.ts) — and go through recruitingTimeUtr(), the
 * one rule the app uses:
 *
 *   year-ago rating given   their pace, (today − year ago) / 12 per month
 *   else 6-month rating     their pace, (today − 6 months ago) / 6
 *   neither                 the typical-growth estimate, labelled as such
 *   summer already begun    today's rating
 *
 * carried to June 1 of (grad year − 1). A rating that went down is held at
 * today's. Because it is the same function with the same dated inputs, the
 * summer number on the diagnostic's card is the number the signed-in app
 * shows after sign-up (lib/fit-onboarding-consistency.test.ts).
 *
 * Until 2026-11-18 the diagnostic had its own rule and showed TODAY's rating
 * when no past rating was given; the app then showed the typical-growth
 * estimate. See docs/DECISIONS.md, "One projection rule for onboarding and
 * the app".
 */

export type DiagnosticProjectionBasis = "logged-pace" | "typical-growth" | "summer-started";

export interface DiagnosticProjection {
  /** The rating at the summer before senior year — `recruiting.value`. */
  value: number;
  /** How to print `value`: one decimal for a projection (it does not have
   * two decimals of precision), the player's own figure when it IS today's
   * rating. */
  display: string;
  todayUtr: number;
  basis: DiagnosticProjectionBasis;
  /** True whenever the number is a projection rather than today's rating. */
  isEstimate: boolean;
  /** The player's own pace from a past answer, UTR a year (playerPacePerYear;
   * print it with formatPacePerYear). 0 when none was. The projection uses
   * min(this, PLANNING_PACE_CAP_PER_YEAR). */
  pacePerYear: number;
  /** The upside sentence when the answers' pace is above the cap — also the
   * `note`, so the card says it once. Null otherwise. */
  upside: string | null;
  /** Months (fractional) from now to the target; 0 once it has begun. */
  monthsToTarget: number;
  /** "summer {targetYear}". Always grad year − 1. */
  targetYear: number;
  /** The one-line sentence that must sit beside the number. */
  note: string;
  cappedByCeiling: boolean;
  /** The recruitingTimeUtr() result this was read from — what the fit
   * report bands at. */
  recruiting: RecruitingTimeUtr;
}

/** The note when the summer before senior year has already begun. */
export const SUMMER_STARTED_NOTE = "The summer before senior year has started, so this is today's UTR.";

/**
 * The diagnostic's past answers as dated ratings: local midnight of the day
 * 12 and 6 months before `now` — the dates sign-up writes them at. Oldest
 * first; an answer that is not a usable rating is left out.
 */
function diagnosticPastRatings(input: {
  sixMonthsAgoUtr?: number | null;
  yearAgoUtr?: number | null;
  now: Date;
}): UtrDataPoint[] {
  const at = (monthsAgo: number) => parseLocalDate(toLocalDateString(shiftLocalMonths(input.now, -monthsAgo)));
  const out: UtrDataPoint[] = [];
  if (isUsableUtr(input.yearAgoUtr)) out.push({ date: at(12), utr: input.yearAgoUtr });
  if (isUsableUtr(input.sixMonthsAgoUtr)) out.push({ date: at(6), utr: input.sixMonthsAgoUtr });
  return out;
}

/** The diagnostic's projection: recruitingTimeUtr() over its answers, in the
 * shape its card prints. Null without a usable rating today. */
export function diagnosticProjection(input: {
  todayUtr: number | null | undefined;
  sixMonthsAgoUtr?: number | null;
  yearAgoUtr?: number | null;
  graduationYear: number;
  gender: PlayerGender;
  now?: Date;
}): DiagnosticProjection | null {
  const today = input.todayUtr;
  if (!isUsableUtr(today)) return null;
  const now = input.now ?? new Date();
  const recruiting = recruitingTimeUtr({
    currentUtr: today,
    graduationYear: input.graduationYear,
    gender: input.gender,
    now,
    history: diagnosticPastRatings({ ...input, now }),
  });
  if (!recruiting) return null;

  const basis: DiagnosticProjectionBasis =
    recruiting.source === "current" ? "summer-started" : recruiting.source;
  return {
    value: recruiting.value,
    display: recruiting.value === today ? formatPlayerUtr(today) : formatUtrEstimate(recruiting.value),
    todayUtr: today,
    basis,
    isEstimate: recruiting.isProjected,
    pacePerYear: recruiting.pace?.perYear ?? 0,
    upside: paceUpsideSentence(recruiting),
    monthsToTarget: yearsUntilRecruiting(input.graduationYear, now) * 12,
    targetYear: recruiting.year,
    note: recruiting.assumption ?? seniorSummerTodayNote(recruiting.year, now),
    cappedByCeiling: recruiting.cappedByCeiling,
    recruiting,
  };
}

/**
 * The onboarding diagnostic's whole fit report: its projection, and the
 * bands judged at exactly that number.
 *
 * Reach vs Out of range uses the three real answered ratings when all three
 * exist (today, ~6 and ~12 months ago — the "three logged ratings"
 * /methodology asks for). With fewer it falls back to the realistic-pace
 * line every pre-auth surface already uses (P1-FIT-4), rather than calling
 * every below-floor school a Reach.
 */
export function buildDiagnosticFitReport(input: {
  todayUtr: number | null | undefined;
  sixMonthsAgoUtr?: number | null;
  yearAgoUtr?: number | null;
  graduationYear: number;
  gender: PlayerGender;
  schools: Pick<SchoolLite, "slug" | "minCompetitiveUTR" | "avgRosterUTR">[];
  view?: FitView;
  now?: Date;
}): { projection: DiagnosticProjection; report: FitReport } | null {
  const now = input.now ?? new Date();
  const projection = diagnosticProjection({ ...input, now });
  if (!projection) return null;
  const today = projection.todayUtr;
  const past = diagnosticPastRatings({ ...input, now });

  const projectionInput: SchoolFitProjectionInput =
    past.length === 2
      ? {
          utrHistory: [...past, { date: now, utr: today }],
          graduationYear: input.graduationYear,
          gender: input.gender,
          now,
        }
      : realisticPaceProjectionFor({
          currentUTR: today,
          graduationYear: input.graduationYear,
          gender: input.gender,
          now,
        });

  const report = buildFitReport({
    currentUtr: today,
    graduationYear: input.graduationYear,
    gender: input.gender,
    schools: input.schools,
    view: input.view,
    projectionInput,
    recruitingUtr: projection.recruiting,
    now,
  });
  return report ? { projection, report } : null;
}
