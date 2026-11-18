import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
import { emptyPlayer } from "@/lib/data/user";
import { buildDiagnosticFitReport, buildFitReport, diagnosticProjection, utrHistoryFromEntries } from "./fit";
import {
  EMPTY_ANSWERS,
  diagnosticPlayerProfile,
  diagnosticUtrEntries,
  diagnosticValues,
  type DiagnosticAnswers,
} from "./onboarding/diagnostic";
import type { SchoolLite } from "./types";

// ONE NUMBER BEFORE AND AFTER SIGN-UP (docs/DECISIONS.md, 2026-11-18).
//
// The onboarding diagnostic shows a "Projected UTR, summer before senior
// year". Sign-up then saves the answers: the profile's current_utr and one
// dated utr_entries row per rating (lib/onboarding/save-diagnostic.ts). The
// signed-in app's fit report reads those rows back (useFitReport →
// utrHistoryFromEntries → buildFitReport). For the same moment, the two
// numbers must be identical — this simulates the saved rows exactly as the
// save path builds them and the app reads them.

const SCHOOLS = [
  { slug: "a", minCompetitiveUTR: 12.4, avgRosterUTR: 13.6 },
  { slug: "b", minCompetitiveUTR: 10.0, avgRosterUTR: 11.2 },
  { slug: "c", minCompetitiveUTR: 8.6, avgRosterUTR: 9.6 },
  { slug: "d", minCompetitiveUTR: 6.2, avgRosterUTR: 7.4 },
].map((s) => ({ ...s, id: s.slug, name: s.slug, shortName: s.slug }) as unknown as SchoolLite);

const answers = (patch: Partial<DiagnosticAnswers>): DiagnosticAnswers => ({
  ...EMPTY_ANSWERS,
  role: "player",
  gender: "male",
  gradYear: 2031,
  birthMonth: 4,
  birthYear: 2013,
  enrollmentTerm: "fall_after_grad",
  ...patch,
});

const CASES: Array<[string, Partial<DiagnosticAnswers>]> = [
  ["year ago and 6 months ago", { utrTodayText: "8.25", utrSixMonthsText: "7.9", utrYearText: "7.4" }],
  ["year ago only", { utrTodayText: "8.25", utrYearText: "7.4" }],
  ["6 months ago only", { utrTodayText: "8.25", utrSixMonthsText: "7.9" }],
  ["no past rating (typical growth)", { utrTodayText: "8.25" }],
  ["a falling rating (held at today)", { utrTodayText: "8.25", utrYearText: "9.1" }],
  ["a capped pace", { utrTodayText: "11.5", utrYearText: "8", gender: "female" }],
  ["the summer has begun", { utrTodayText: "10.4", utrYearText: "9.6", gradYear: 2027 }],
];

const MOMENTS: Array<[string, Date]> = [
  ["local noon", new Date(2026, 10, 18, 12, 0)],
  ["late evening", new Date(2026, 10, 18, 23, 30)],
  ["just after midnight", new Date(2026, 10, 1, 0, 5)],
  ["Aug 31 of a leap year", new Date(2028, 7, 31, 23, 59)],
];

/** The signed-in app's report for a player whose diagnostic was saved at
 * `now`, read at `now`. */
function appReportAfterSaving(a: DiagnosticAnswers, now: Date) {
  const profile = diagnosticPlayerProfile({ ...emptyPlayer }, a);
  const rows = diagnosticUtrEntries(a, now); // what POST /api/utr-entries stores
  const history = utrHistoryFromEntries(rows.map((r) => ({ utr: r.utr, recordedAt: r.recordedAt })));
  return buildFitReport({
    currentUtr: profile.currentUTR,
    graduationYear: profile.graduationYear,
    gender: profile.gender,
    schools: SCHOOLS,
    projectionInput: { utrHistory: history, graduationYear: profile.graduationYear, gender: profile.gender },
    now,
  });
}

function diagnosticFor(a: DiagnosticAnswers, now: Date) {
  const v = diagnosticValues(a);
  const input = {
    todayUtr: v.utrToday,
    sixMonthsAgoUtr: v.utrSixMonthsAgo,
    yearAgoUtr: v.utrYearAgo,
    graduationYear: v.gradYear!,
    gender: v.gender!,
    now,
  };
  return { card: diagnosticProjection(input)!, built: buildDiagnosticFitReport({ ...input, schools: SCHOOLS })! };
}

describe("the onboarding summer number is the app's summer number after sign-up", () => {
  for (const [what, patch] of CASES) {
    for (const [when, now] of MOMENTS) {
      if (patch.gradYear === 2027 && now.getFullYear() === 2028) continue; // graduated
      it(`${what}, at ${when}`, () => {
        const a = answers(patch);
        const { card, built } = diagnosticFor(a, now);
        const app = appReportAfterSaving(a, now)!;
        // The card, the diagnostic's own report and the app agree…
        expect(built.report.utr.value).toBe(card.value);
        expect(app.utr.value).toBe(card.value);
        // …on the rule that produced it and the sentence beside it.
        expect(app.utr.source).toBe(card.recruiting.source);
        expect(app.utr.assumption).toBe(card.recruiting.assumption);
        expect(app.utr.low).toBe(card.recruiting.low);
        expect(app.utr.high).toBe(card.recruiting.high);
        expect(app.utr.year).toBe(card.targetYear);
      });
    }
  }

  it("the cases cover every branch of the rule", () => {
    const now = MOMENTS[0][1];
    const sources = new Set(CASES.map(([, p]) => diagnosticFor(answers(p), now).card.basis));
    expect([...sources].sort()).toEqual(["logged-pace", "summer-started", "typical-growth"]);
  });

  // Time zones: the saved rows are date-only strings and the app parses them
  // as LOCAL days. Run the real modules in a child `node` per zone (a worker
  // cannot change its own TZ) and compare the two numbers there.
  const probe = buildSync({
    stdin: {
      contents: `
        import { buildFitReport, diagnosticProjection, utrHistoryFromEntries } from "@/lib/fit";
        import { diagnosticUtrEntries, EMPTY_ANSWERS } from "@/lib/onboarding/diagnostic";
        const now = new Date(2026, 10, 18, 23, 30, 0);
        const a = { ...EMPTY_ANSWERS, role: "player", gender: "male", gradYear: 2031,
          utrTodayText: "8.25", utrSixMonthsText: "7.9", utrYearText: "7.4" };
        const card = diagnosticProjection({ todayUtr: 8.25, sixMonthsAgoUtr: 7.9, yearAgoUtr: 7.4,
          graduationYear: 2031, gender: "male", now });
        const history = utrHistoryFromEntries(diagnosticUtrEntries(a, now));
        const app = buildFitReport({ currentUtr: 8.25, graduationYear: 2031, gender: "male", schools: [],
          projectionInput: { utrHistory: history, graduationYear: 2031, gender: "male" }, now });
        console.log(JSON.stringify({
          offset: new Date(2026, 10, 18).getTimezoneOffset(),
          card: card.value, app: app.utr.value, source: app.utr.source,
          months: app.utr.pace && app.utr.pace.months,
        }));
      `,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
  }).outputFiles[0].text;

  for (const [tz, offset] of [
    ["America/Los_Angeles", 480],
    ["Pacific/Auckland", -780],
    ["UTC", 0],
  ] as const) {
    it(`agrees in ${tz}`, () => {
      const out = JSON.parse(
        execFileSync(process.execPath, ["-"], { input: probe, env: { ...process.env, TZ: tz }, encoding: "utf8" })
      );
      expect(out.offset, "the child really ran in this zone").toBe(offset);
      expect(out.source).toBe("logged-pace");
      expect(out.months).toBe(12);
      expect(out.app).toBe(out.card);
    });
  }
});
