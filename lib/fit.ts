// THE FIT ENGINE — public entry point. Every importer uses "@/lib/fit".
//
// Where a player is headed by the time recruiting actually happens, and what
// that means for each school's band. DETERMINISTIC: no model produces any
// number here (the full statement is at the top of lib/fit/projection.ts).
//
// Until 2026-11-21 this was one 1,345-line file. It is now split by concern,
// every declaration moved verbatim with its comments (lib/fit-split-purity.
// test.ts proves the move against lib/fit/__split-manifest.json), and this
// file only re-exports — the same names it always exported, so no importer
// changed:
//
//   lib/fit/pace.ts        the planning pace cap, the player's logged pace
//   lib/fit/projection.ts  where the rating is headed: recruitingTimeUtr,
//                          the one rule that decides which UTR judges fit,
//                          and the chart paths drawn from it
//   lib/fit/goal.ts        the plan goal and its pace banner
//   lib/fit/bands.ts       buildFitReport, the only place a rating becomes
//                          bands, and what is read off the report
//   lib/fit/diagnostic.ts  the onboarding diagnostic, through the same rule
//
// Imports run one way — pace ← projection ← goal, bands ← diagnostic — and
// never through this file. Guard tests treat the whole set
// (lib/fit/engine-files.ts) as "lib/fit.ts".

export {
  formatPacePerYear,
  PLANNING_PACE_CAP_PER_YEAR,
  planningPacePerYear,
  PLANNING_RULE_SENTENCE,
  LOGGED_PACE_MIN_MONTHS,
  LOGGED_PACE_MAX_MONTHS,
  LOGGED_PACE_YEAR_AGO_FROM_MONTHS,
  loggedPaceFor,
  playerPacePerYear,
  loggedPaceAssumption,
  utrHistoryFromEntries,
  isUsableUtr,
} from "@/lib/fit/pace";
export type { LoggedPace } from "@/lib/fit/pace";

export {
  projectionTargetDate,
  projectionTargetLabel,
  yearsUntilRecruiting,
  projectUtrAtRecruiting,
  projectedUtrOn,
  projectionReachDate,
  projectionPath,
  upsideProjectionPath,
  chartEndLabels,
  estimateOnDate,
  projectionAssumptionLabel,
  paceUpsideSentence,
  recruitingTimeUtr,
} from "@/lib/fit/projection";
export type {
  UtrProjection,
  ProjectionSubject,
  UtrEstimatePoint,
  FitBasisKind,
  RecruitingUtrSource,
  RecruitingTimeUtr,
  PaceUpside,
} from "@/lib/fit/projection";

export {
  resolvePlanGoal,
  PACE_STRETCH_MARGIN_PER_YEAR,
  planGoalPaceSeverity,
  planGoalNeedsPaceWarning,
  PACE_STRETCH_NOTE,
  planGoalInputError,
} from "@/lib/fit/goal";
export type { PlanGoal, PlanGoalPaceSeverity } from "@/lib/fit/goal";

export {
  isRealisticTarget,
  compareSchoolBands,
  countBands,
  buildFitReport,
  closestSchoolsFromReport,
} from "@/lib/fit/bands";
export type { SchoolBandComparison, BandCounts, FitView, FitRow, FitReport } from "@/lib/fit/bands";

export { SUMMER_STARTED_NOTE, diagnosticProjection, buildDiagnosticFitReport } from "@/lib/fit/diagnostic";
export type { DiagnosticProjectionBasis, DiagnosticProjection } from "@/lib/fit/diagnostic";
