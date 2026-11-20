import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
import {
  SUMMER_STARTED_NOTE,
  buildDiagnosticFitReport,
  buildFitReport,
  diagnosticProjection,
  projectUtrAtRecruiting,
  projectionAssumptionLabel,
  projectionTargetDate,
  yearsUntilRecruiting,
} from "./fit";
import { REALISTIC_UTR_CEILING } from "./config/recruiting";
import { toLocalDateString, shiftLocalMonths } from "./time";
import type { SchoolLite } from "./types";

// The /onboarding diagnostic's projection (board 20), which since 2026-11-18
// is recruitingTimeUtr() — the app's one rule — over the answered ratings:
// the player's OWN pace when they gave a past rating, carried to June 1 of
// (grad year − 1); the labelled typical-growth estimate when they did not.
// The rule's own edges live in lib/fit-projection-rule.test.ts; the
// before/after-sign-up agreement in lib/fit-onboarding-consistency.test.ts.

const NOW = new Date(2026, 10, 18, 12, 0, 0); // Nov 18 2026, local noon

describe("diagnosticProjection", () => {
  it("uses the year-ago pace, (today − year ago) / 12 per month, to June 1 of grad − 1", () => {
    const p = diagnosticProjection({
      todayUtr: 8,
      yearAgoUtr: 7,
      sixMonthsAgoUtr: 7.9, // ignored: the year-ago rating wins
      graduationYear: 2030,
      gender: "male",
      now: NOW,
    })!;
    expect(p.basis).toBe("logged-pace");
    expect(p.pacePerYear).toBeCloseTo(1, 10);
    expect(p.targetYear).toBe(2029);
    expect(projectionTargetDate(2030)).toEqual(new Date(2029, 5, 1));
    // 8 + (1/12 per month) × months to June 1 2029 (about 30.4)
    const months = yearsUntilRecruiting(2030, NOW) * 12;
    expect(months).toBeGreaterThan(30);
    expect(months).toBeLessThan(31);
    expect(p.value).toBe(Math.round((8 + months / 12) * 10) / 10);
    expect(p.value).toBe(10.5);
    expect(p.isEstimate).toBe(true);
    expect(p.display).toBe("10.5");
    expect(p.note).toBe("At your logged pace (+1.00 a year since November 2025).");
    expect(p.recruiting.low).toBe(p.value);
    expect(p.recruiting.high).toBe(p.value);
  });

  it("falls back to the 6-month pace, (today − 6 months ago) / 6", () => {
    const p = diagnosticProjection({
      todayUtr: 8,
      sixMonthsAgoUtr: 7.7,
      graduationYear: 2029,
      gender: "female",
      now: NOW,
    })!;
    expect(p.basis).toBe("logged-pace");
    expect(p.pacePerYear).toBeCloseTo(0.6, 10);
    const months = yearsUntilRecruiting(2029, NOW) * 12;
    expect(p.value).toBe(Math.round((8 + 0.05 * months) * 10) / 10);
    expect(p.note).toBe("At your logged pace (+0.60 a year since May 2026).");
  });

  it("no past rating → the typical-growth estimate, labelled as one (not today's rating)", () => {
    const p = diagnosticProjection({ todayUtr: 8.25, graduationYear: 2031, gender: "male", now: NOW })!;
    const typical = projectUtrAtRecruiting({ currentUtr: 8.25, graduationYear: 2031, gender: "male", now: NOW })!;
    expect(p.basis).toBe("typical-growth");
    expect(p.value).toBe(typical.normal);
    expect(p.value).toBe(11.8);
    expect(p.display).toBe("11.8");
    expect(p.isEstimate).toBe(true);
    expect(p.note).toBe(projectionAssumptionLabel("normal"));
    expect(p.note).toBe("Assumes typical growth of 1.0 UTR per year.");
    expect(p.recruiting.low).toBe(typical.slow);
    expect(p.recruiting.high).toBe(typical.fast);
  });

  it("target summer already started → today's rating, and it says so (even with a pace)", () => {
    // Class of 2027 in Nov 2026: their summer before senior year was June 2026.
    const p = diagnosticProjection({
      todayUtr: 11,
      yearAgoUtr: 9,
      graduationYear: 2027,
      gender: "male",
      now: NOW,
    })!;
    expect(p.basis).toBe("summer-started");
    expect(p.value).toBe(11);
    expect(p.display).toBe("11.00");
    expect(p.isEstimate).toBe(false);
    expect(p.monthsToTarget).toBe(0);
    expect(p.note).toBe(SUMMER_STARTED_NOTE);
  });

  it("June 1 itself counts as started; May 31 still has a sliver of growth", () => {
    const onTheDay = diagnosticProjection({
      todayUtr: 9,
      yearAgoUtr: 8,
      graduationYear: 2028,
      gender: "female",
      now: new Date(2027, 5, 1, 0, 0, 0),
    })!;
    expect(onTheDay.basis).toBe("summer-started");
    const dayBefore = diagnosticProjection({
      todayUtr: 9,
      yearAgoUtr: 8,
      graduationYear: 2028,
      gender: "female",
      now: new Date(2027, 4, 31, 12, 0, 0),
    })!;
    expect(dayBefore.basis).toBe("logged-pace");
    expect(dayBefore.value).toBe(9);
  });

  it("a rating that went down is held at today's, never carried into a lower one", () => {
    const p = diagnosticProjection({
      todayUtr: 8,
      yearAgoUtr: 9,
      graduationYear: 2031,
      gender: "male",
      now: NOW,
    })!;
    expect(p.basis).toBe("logged-pace");
    expect(p.value).toBe(8);
    expect(p.display).toBe("8.00");
    expect(p.pacePerYear).toBeLessThan(0);
    expect(p.note).toBe(
      "Your rating has gone down since November 2025 (−1.00 a year), so this stays at today's UTR."
    );
  });

  it("caps growth at the same per-gender ceiling buildFitReport uses — never below today", () => {
    const fast = diagnosticProjection({
      todayUtr: 11,
      yearAgoUtr: 8,
      graduationYear: 2031,
      gender: "female",
      now: NOW,
    })!;
    expect(fast.value).toBe(REALISTIC_UTR_CEILING.female);
    expect(fast.cappedByCeiling).toBe(true);
    expect(fast.note).toMatch(/capped/);

    // Already above the women's ceiling: the cap does not pull a real
    // rating down.
    const above = diagnosticProjection({
      todayUtr: 13,
      yearAgoUtr: 12.5,
      graduationYear: 2031,
      gender: "female",
      now: NOW,
    })!;
    expect(above.value).toBe(13);
  });

  it("no usable rating today → null, never a default", () => {
    for (const todayUtr of [null, undefined, 0, 0.5, 17, Number.NaN]) {
      expect(diagnosticProjection({ todayUtr, graduationYear: 2030, gender: "male", now: NOW })).toBeNull();
    }
  });

  it("ignores past ratings outside 1–16.5 rather than using them", () => {
    const p = diagnosticProjection({
      todayUtr: 8,
      yearAgoUtr: 0,
      sixMonthsAgoUtr: 20,
      graduationYear: 2030,
      gender: "male",
      now: NOW,
    })!;
    expect(p.basis).toBe("typical-growth");
  });
});

describe("buildDiagnosticFitReport: the report bands at the number the card shows", () => {
  const SCHOOLS = [
    { slug: "a", minCompetitiveUTR: 12.4, avgRosterUTR: 13.6 },
    { slug: "b", minCompetitiveUTR: 10.0, avgRosterUTR: 11.2 },
    { slug: "c", minCompetitiveUTR: 8.6, avgRosterUTR: 9.6 },
    { slug: "d", minCompetitiveUTR: 6.2, avgRosterUTR: 7.4 },
  ].map((s) => ({ ...s, id: s.slug, name: s.slug, shortName: s.slug }) as unknown as SchoolLite);

  it("with a pace: projected view, judged at the projection", () => {
    const built = buildDiagnosticFitReport({
      todayUtr: 8,
      yearAgoUtr: 7,
      graduationYear: 2030,
      gender: "male",
      schools: SCHOOLS,
      now: NOW,
    })!;
    expect(built.report.utr).toBe(built.projection.recruiting);
    expect(built.report.utr.value).toBe(built.projection.value);
    expect(built.report.utr.isProjected).toBe(true);
    expect(built.report.view).toBe("recruiting");
    expect(built.report.utr.low).toBe(built.report.utr.high);
    expect(built.report.utr.assumption).toBe(built.projection.note);
    expect(built.report.inRange).toBe(built.report.counts.target + built.report.counts.likely);
  });

  it("without a past rating: judged at the typical-growth estimate — the same report a signed-in player with no history gets", () => {
    const built = buildDiagnosticFitReport({
      todayUtr: 8,
      graduationYear: 2031,
      gender: "male",
      schools: SCHOOLS,
      now: NOW,
    })!;
    const app = buildFitReport({ currentUtr: 8, graduationYear: 2031, gender: "male", schools: SCHOOLS, now: NOW })!;
    expect(built.report.utr.value).toBe(11.5);
    expect(built.report.utr.value).toBe(app.utr.value);
    expect(built.report.utr.source).toBe("typical-growth");
    expect(built.report.utr.isProjected).toBe(true);
    expect(built.report.view).toBe("recruiting");
  });

  it("projection.recruiting carries the same year and value", () => {
    const p = diagnosticProjection({ todayUtr: 9, sixMonthsAgoUtr: 8.5, graduationYear: 2029, gender: "female", now: NOW })!;
    const r = p.recruiting;
    expect(r.value).toBe(p.value);
    expect(r.year).toBe(2028);
    expect(r.basis).toBe("projected");
  });

  it("three real answered ratings decide Reach vs Out of range — a flat history cannot close a big gap", () => {
    // Flat at 8 for a year: the pace is 0, so a 12.4 floor is out of range.
    const flat = buildDiagnosticFitReport({
      todayUtr: 8,
      sixMonthsAgoUtr: 8,
      yearAgoUtr: 8,
      graduationYear: 2029,
      gender: "male",
      schools: SCHOOLS,
      now: NOW,
    })!;
    expect(flat.report.bandBySlug.get("a")).toBe("out-of-range");
  });

  it("no rating → null (the report shows its honest empty state)", () => {
    expect(
      buildDiagnosticFitReport({ todayUtr: null, graduationYear: 2030, gender: "male", schools: SCHOOLS, now: NOW })
    ).toBeNull();
  });
});

describe("month arithmetic and local dates (leap years, short months, time zones)", () => {
  it("clamps to the end of a shorter month instead of rolling into the next", () => {
    expect(toLocalDateString(shiftLocalMonths(new Date(2026, 7, 31), -6))).toBe("2026-02-28");
    expect(toLocalDateString(shiftLocalMonths(new Date(2028, 7, 31), -6))).toBe("2028-02-29"); // leap
    expect(toLocalDateString(shiftLocalMonths(new Date(2028, 1, 29), -12))).toBe("2027-02-28");
    expect(toLocalDateString(shiftLocalMonths(new Date(2027, 2, 31), -1))).toBe("2027-02-28");
    expect(toLocalDateString(shiftLocalMonths(new Date(2026, 0, 15), -6))).toBe("2025-07-15"); // across a year
    expect(toLocalDateString(shiftLocalMonths(new Date(2026, 4, 31), -6))).toBe("2025-11-30");
  });

  // A test worker cannot change its own time zone (ICU reads TZ once), so
  // each zone runs the REAL modules in a fresh `node` with TZ set: the
  // modules are bundled with esbuild and piped in. The first value proves
  // the zone took effect, so these can never all quietly run in the
  // machine's own zone (which a first version of this test did).
  const OFFSET_NOV_2026: Record<string, number> = {
    "America/Los_Angeles": 480,
    "Pacific/Auckland": -780,
    UTC: 0,
    "Asia/Kolkata": -330,
  };
  const probe = buildSync({
    stdin: {
      contents: `
        import { toLocalDateString, shiftLocalMonths } from "@/lib/time";
        import { projectionTargetDate } from "@/lib/fit";
        import { pastRatingDate, pastRatingMonthLabel, diagnosticUtrEntries, EMPTY_ANSWERS } from "@/lib/onboarding/diagnostic";
        const lateEvening = new Date(2026, 10, 18, 23, 30, 0);
        const justAfterMidnight = new Date(2026, 10, 1, 0, 5, 0);
        const leapEdge = new Date(2028, 7, 31, 23, 59, 0);
        console.log(JSON.stringify({
          offset: new Date(2026, 10, 18).getTimezoneOffset(),
          late: toLocalDateString(lateEvening),
          lateMinus6: pastRatingDate(6, lateEvening),
          lateLabel6: pastRatingMonthLabel(6, lateEvening),
          lateLabel12: pastRatingMonthLabel(12, lateEvening),
          midnightMinus12: toLocalDateString(shiftLocalMonths(justAfterMidnight, -12)),
          leapMinus6: pastRatingDate(6, leapEdge),
          target: toLocalDateString(projectionTargetDate(2030)),
          entries: diagnosticUtrEntries(
            { ...EMPTY_ANSWERS, role: "player", utrTodayText: "8.25", utrSixMonthsText: "7.9", utrYearText: "7.4" },
            lateEvening
          ).map((e) => e.recordedAt),
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

  for (const tz of Object.keys(OFFSET_NOV_2026)) {
    it(`late evening, just after midnight and Aug 31 of a leap year keep their local dates in ${tz}`, () => {
      const out = JSON.parse(
        execFileSync(process.execPath, ["-"], { input: probe, env: { ...process.env, TZ: tz }, encoding: "utf8" })
      );
      expect(out.offset, "the child really ran in this zone").toBe(OFFSET_NOV_2026[tz]);
      expect(out.late).toBe("2026-11-18");
      expect(out.lateMinus6).toBe("2026-05-18");
      expect(out.lateLabel6).toBe("May 2026");
      expect(out.lateLabel12).toBe("November 2025");
      expect(out.midnightMinus12).toBe("2025-11-01");
      expect(out.leapMinus6).toBe("2028-02-29");
      // The projection target is local June 1 wherever you are.
      expect(out.target).toBe("2029-06-01");
      expect(out.entries).toEqual(["2025-11-18", "2026-05-18", "2026-11-18"]);
    });
  }
});
