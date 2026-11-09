import { describe, expect, it } from "vitest";
import {
  classifySchoolFit,
  closestSchoolsByUtrGap,
  computeGoalPace,
  countSchoolFits,
  explainSchoolFit,
  findAlternativeSchools,
  REALISTIC_UTR_IMPROVEMENT_PER_YEAR,
  type SchoolFitProjectionInput,
} from "./school-fit";
import { computeUtrProjection, type UtrDataPoint } from "./utr-projection";
import type { SchoolLite } from "./types";

const SCHOOL = { minCompetitiveUTR: 10, avgRosterUTR: 11 };

function d(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

function schoolLite(overrides: Partial<SchoolLite> & { slug: string }): SchoolLite {
  return {
    id: overrides.slug,
    name: overrides.shortName ?? overrides.slug,
    shortName: overrides.slug,
    city: "Testville",
    state: "VA",
    conference: "Test Conf",
    division: "D1",
    gender: "men",
    primaryColor: "#000",
    secondaryColor: "#000",
    textColor: "#fff",
    avgRosterUTR: 11,
    minCompetitiveUTR: 10,
    usNewsRanking: 50,
    conferenceRank: 1,
    coachName: "Coach",
    coachEmail: "coach@example.com",
    recruitingPageUrl: "",
    ...overrides,
  };
}

describe("classifySchoolFit — Likely/Target boundaries (no projection needed)", () => {
  it("classifies a UTR above the team median as Likely", () => {
    expect(classifySchoolFit(11.5, SCHOOL)).toBe("likely");
  });

  it("classifies a UTR exactly at the team median as Likely", () => {
    expect(classifySchoolFit(11, SCHOOL)).toBe("likely");
  });

  it("classifies a UTR inside the range, below the median, as Target", () => {
    expect(classifySchoolFit(10.5, SCHOOL)).toBe("target");
  });

  it("classifies a UTR exactly at the team floor as Target", () => {
    expect(classifySchoolFit(10, SCHOOL)).toBe("target");
  });
});

describe("classifySchoolFit — below the floor, no projection supplied", () => {
  it("falls back to Reach, never fabricating Out-of-range without real pace data", () => {
    expect(classifySchoolFit(9, SCHOOL)).toBe("reach");
  });
});

describe("classifySchoolFit — below the floor, with a real projection", () => {
  // Class of 2027 -> summer before senior year is June 1, 2026 (getSummerBeforeGradeYear(2027, 12) = 2026).
  const GRAD_YEAR_2027 = 2027;
  const NOW = d("2025-11-08");

  const fastClimb: UtrDataPoint[] = [
    { date: d("2025-05-01"), utr: 7.0 },
    { date: d("2025-08-01"), utr: 8.0 },
    { date: d("2025-11-01"), utr: 9.0 },
  ];
  const flatPace: UtrDataPoint[] = [
    { date: d("2025-05-01"), utr: 8.9 },
    { date: d("2025-08-01"), utr: 8.95 },
    { date: d("2025-11-01"), utr: 9.0 },
  ];

  it("classifies as Reach when fewer than 3 real history points exist — can't prove the gap is unclosable", () => {
    const projection: SchoolFitProjectionInput = {
      utrHistory: flatPace.slice(0, 2),
      graduationYear: GRAD_YEAR_2027,
      now: NOW,
    };
    expect(classifySchoolFit(9, SCHOOL, projection)).toBe("reach");
  });

  it("classifies as Reach when the real pace projects to close the gap by the summer before senior year", () => {
    const projection: SchoolFitProjectionInput = {
      utrHistory: fastClimb,
      graduationYear: GRAD_YEAR_2027,
      now: NOW,
    };
    expect(classifySchoolFit(9, SCHOOL, projection)).toBe("reach");
  });

  it("classifies as Out-of-range when the real pace does NOT project to close the gap in time", () => {
    const projection: SchoolFitProjectionInput = {
      utrHistory: flatPace,
      graduationYear: GRAD_YEAR_2027,
      now: NOW,
    };
    expect(classifySchoolFit(9, SCHOOL, projection)).toBe("out-of-range");
  });

  it("evaluates at today's pace (not a date that's already gone) once the milestone has passed", () => {
    // Class of 2025: summer before senior year (June 1, 2024) is already
    // behind "now" — the same fast-climbing history that reads Reach when
    // the milestone is still ahead has no runway left here, so it can't
    // out-run the fact that the player is below the floor today.
    const projection: SchoolFitProjectionInput = {
      utrHistory: fastClimb,
      graduationYear: 2025,
      now: NOW,
    };
    expect(classifySchoolFit(9, SCHOOL, projection)).toBe("out-of-range");
  });

  it("tightens the ceiling to the player's real gender cap when supplied", () => {
    // A ridiculous history (every point still real, just a steep slope) run
    // through the female ceiling (12.5) vs no gender at all (defaults to
    // the higher male ceiling, 14) should never disagree about which side
    // of a floor well below both ceilings the projection lands on.
    const steepClimb: UtrDataPoint[] = [
      { date: d("2025-01-01"), utr: 6.0 },
      { date: d("2025-06-01"), utr: 8.0 },
      { date: d("2025-11-01"), utr: 10.0 },
    ];
    const withGender = classifySchoolFit(9, SCHOOL, {
      utrHistory: steepClimb,
      graduationYear: GRAD_YEAR_2027,
      gender: "female",
      now: NOW,
    });
    const withoutGender = classifySchoolFit(9, SCHOOL, {
      utrHistory: steepClimb,
      graduationYear: GRAD_YEAR_2027,
      now: NOW,
    });
    expect(withGender).toBe("reach");
    expect(withoutGender).toBe("reach");
  });
});

describe("countSchoolFits", () => {
  const schools = [
    { minCompetitiveUTR: 10, avgRosterUTR: 11 }, // reach/out-of-range for a 9.0 player
    { minCompetitiveUTR: 8, avgRosterUTR: 9.5 }, // target for a 9.0 player (inside the range, below the median)
    { minCompetitiveUTR: 7, avgRosterUTR: 8 }, // likely for a 9.0 player (at/above the median)
  ];

  it("buckets reach/target/likely and leaves outOfRange at 0 with no projection", () => {
    const counts = countSchoolFits(9, schools);
    expect(counts).toEqual({ reach: 1, target: 1, likely: 1, outOfRange: 0 });
  });

  it("buckets a below-floor school into outOfRange once a real, non-closing projection is supplied", () => {
    const flatPace: UtrDataPoint[] = [
      { date: d("2025-05-01"), utr: 8.9 },
      { date: d("2025-08-01"), utr: 8.95 },
      { date: d("2025-11-01"), utr: 9.0 },
    ];
    const counts = countSchoolFits(9, schools, {
      utrHistory: flatPace,
      graduationYear: 2027,
      now: d("2025-11-08"),
    });
    expect(counts).toEqual({ reach: 0, target: 1, likely: 1, outOfRange: 1 });
  });
});

describe("explainSchoolFit — no real player UTR", () => {
  const school = schoolLite({ slug: "stanford", shortName: "Stanford", minCompetitiveUTR: 12.3, avgRosterUTR: 13.6 });

  it("returns band 'unverified' and never fabricates a gap when playerUtr is null", () => {
    const explanation = explainSchoolFit(null, school, { graduationYear: 2028 });
    expect(explanation.band).toBe("unverified");
    expect(explanation.gapToFloor).toBeNull();
    expect(explanation.gapToMedian).toBeNull();
    expect(explanation.pace).toEqual({ status: "no-player-utr" });
    expect(explanation.nextBand).toBeNull();
    expect(explanation.unreachable).toBe(false);
    expect(explanation.alternatives).toEqual([]);
    expect(explanation.summary).toContain("haven't logged a UTR yet");
  });

  it("treats a non-positive UTR (the <=0 convention used elsewhere in the app) the same way", () => {
    const explanation = explainSchoolFit(0, school, { graduationYear: 2028 });
    expect(explanation.band).toBe("unverified");
  });

  it("still returns the honest 'not tracked' statements and evergreen timing note", () => {
    const explanation = explainSchoolFit(null, school, { graduationYear: 2028 });
    expect(explanation.playersLeaving).toMatch(/tracked yet/i);
    expect(explanation.academics).toMatch(/tracked yet/i);
    expect(explanation.timing).toMatch(/D1 coaches/);
  });
});

describe("explainSchoolFit — summary sentence, real numbers only", () => {
  const school = schoolLite({ slug: "stanford", shortName: "Stanford", minCompetitiveUTR: 12.3, avgRosterUTR: 13.6 });

  it("matches the spec's own example almost verbatim for a below-floor player", () => {
    const explanation = explainSchoolFit(5.8, school, { graduationYear: 2028 });
    expect(explanation.summary).toBe("Stanford's lowest reliable player is 12.3. You're 5.8.");
    expect(explanation.gapToFloor).toBeCloseTo(6.5, 2);
    expect(explanation.gapToMedian).toBeCloseTo(7.8, 2);
  });

  it("switches to an 'already above' sentence once the player clears the floor", () => {
    const explanation = explainSchoolFit(14, school, { graduationYear: 2028 });
    expect(explanation.summary).toBe("You're 14.0, already above Stanford's competitive floor of 12.3.");
    expect(explanation.gapToFloor).toBeCloseTo(-1.7, 2);
  });
});

describe("explainSchoolFit — Likely band has nothing higher to move into", () => {
  const school = schoolLite({ slug: "likely-school", minCompetitiveUTR: 10, avgRosterUTR: 11 });

  it("returns a null nextBand and unreachable: false", () => {
    const explanation = explainSchoolFit(11.5, school, { graduationYear: 2028 });
    expect(explanation.band).toBe("likely");
    expect(explanation.nextBand).toBeNull();
    expect(explanation.unreachable).toBe(false);
    expect(explanation.alternatives).toEqual([]);
  });
});

describe("explainSchoolFit — pace projection (point 4)", () => {
  const school = schoolLite({ slug: "pace-school", minCompetitiveUTR: 10, avgRosterUTR: 11 });

  it("returns 'Log more results to see your pace' with fewer than 3 real history points", () => {
    const explanation = explainSchoolFit(10.5, school, { graduationYear: 2028 });
    expect(explanation.pace).toEqual({
      status: "insufficient-history",
      message: "Log more results to see your pace.",
    });
  });

  it("returns a real projected UTR + date once >=3 real history points exist", () => {
    const flatPace: UtrDataPoint[] = [
      { date: d("2025-05-01"), utr: 8.9 },
      { date: d("2025-08-01"), utr: 8.95 },
      { date: d("2025-11-01"), utr: 9.0 },
    ];
    const graduationYear = 2027;
    const now = d("2025-11-08");
    const explanation = explainSchoolFit(9, school, { graduationYear, utrHistory: flatPace, now });
    expect(explanation.pace.status).toBe("ready");
    if (explanation.pace.status !== "ready") throw new Error("unreachable");
    // Computed independently from the same real regression, not hardcoded —
    // this just proves explainSchoolFit wires the real math through, rather
    // than re-deriving its own expectation of what that math should say.
    const expected =
      Math.round(computeUtrProjection(flatPace)!.predict(new Date(2026, 5, 1)) * 10) / 10;
    expect(explanation.pace.projectedUTR).toBeCloseTo(expected, 5);
    expect(explanation.pace.byDate).toBe("2026-06-01");
  });
});

describe("explainSchoolFit — required pace vs the realistic 0.5-1.5/yr band (point 5+6)", () => {
  it("reads 'within-realistic-range' when the gap/years lands inside the realistic band", () => {
    const school = schoolLite({ slug: "target-school", minCompetitiveUTR: 10, avgRosterUTR: 11 });
    // Class of 2028 -> summer before senior year June 1, 2027, ~1.56 years
    // out from "now" below. gap to median (11 - 10) = 1 -> ~0.64/yr.
    const explanation = explainSchoolFit(10, school, { graduationYear: 2028, now: d("2025-11-08") });
    expect(explanation.band).toBe("target");
    expect(explanation.nextBand).not.toBeNull();
    const nextBand = explanation.nextBand!;
    expect(nextBand.targetBand).toBe("likely");
    expect(nextBand.utrNeeded).toBe(11);
    expect(nextBand.gap).toBe(1);
    expect(nextBand.byDate).toBe("2027-06-01");
    expect(nextBand.paceRead).toBe("within-realistic-range");
    expect(nextBand.requiredPaceUtrPerYear).toBeGreaterThanOrEqual(REALISTIC_UTR_IMPROVEMENT_PER_YEAR.min);
    expect(nextBand.requiredPaceUtrPerYear).toBeLessThanOrEqual(REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max);
    expect(nextBand.message).toContain("a realistic pace");
    expect(explanation.unreachable).toBe(false);
    expect(explanation.alternatives).toEqual([]);
  });

  it("reads 'slower-than-realistic' when there's plenty of runway for a small gap", () => {
    const school = schoolLite({ slug: "target-school-2", minCompetitiveUTR: 10, avgRosterUTR: 11 });
    // Class of 2029 -> ~2.56 years out; gap to median = 1 -> ~0.39/yr, below the 0.5 floor.
    const explanation = explainSchoolFit(10, school, { graduationYear: 2029, now: d("2025-11-08") });
    const nextBand = explanation.nextBand!;
    expect(nextBand.paceRead).toBe("slower-than-realistic");
    expect(nextBand.requiredPaceUtrPerYear).toBeLessThan(REALISTIC_UTR_IMPROVEMENT_PER_YEAR.min);
    expect(nextBand.message).toContain("you have room");
    expect(explanation.unreachable).toBe(false);
  });

  it("reads 'faster-than-realistic' and marks the band unreachable when the gap is too big for the runway", () => {
    const school = schoolLite({ slug: "reach-school", minCompetitiveUTR: 10, avgRosterUTR: 11 });
    // Class of 2027 -> ~0.56 years out; gap to floor = 2 -> ~3.6/yr, well past 1.5.
    const explanation = explainSchoolFit(8, school, { graduationYear: 2027, now: d("2025-11-08") });
    expect(explanation.band).toBe("reach"); // no projection history -> honest fallback, never fabricated out-of-range
    const nextBand = explanation.nextBand!;
    expect(nextBand.targetBand).toBe("target"); // Reach crosses the floor into Target
    expect(nextBand.utrNeeded).toBe(10);
    expect(nextBand.paceRead).toBe("faster-than-realistic");
    expect(nextBand.requiredPaceUtrPerYear).toBeGreaterThan(REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max);
    expect(nextBand.message).toContain("faster than most players improve");
    expect(explanation.unreachable).toBe(true);
  });

  it("marks the band unreachable with a null requiredPace once the milestone has already passed", () => {
    const school = schoolLite({ slug: "no-runway-school", minCompetitiveUTR: 10, avgRosterUTR: 11 });
    // Class of 2026 -> summer before senior year (June 1, 2025) is already behind "now".
    const explanation = explainSchoolFit(8, school, { graduationYear: 2026, now: d("2025-11-08") });
    const nextBand = explanation.nextBand!;
    expect(nextBand.paceRead).toBe("no-time-left");
    expect(nextBand.requiredPaceUtrPerYear).toBeNull();
    expect(nextBand.message).toContain("already passed");
    expect(explanation.unreachable).toBe(true);
  });

  it("classifies as out-of-range (real slope-based) and still runs the generic pace read + unreachable check independently", () => {
    const school = schoolLite({ slug: "out-of-range-school", minCompetitiveUTR: 10, avgRosterUTR: 11 });
    const flatPace: UtrDataPoint[] = [
      { date: d("2025-05-01"), utr: 8.9 },
      { date: d("2025-08-01"), utr: 8.95 },
      { date: d("2025-11-01"), utr: 9.0 },
    ];
    const explanation = explainSchoolFit(9, school, {
      graduationYear: 2027,
      utrHistory: flatPace,
      now: d("2025-11-08"),
    });
    expect(explanation.band).toBe("out-of-range");
    expect(explanation.nextBand!.targetBand).toBe("target");
    expect(explanation.unreachable).toBe(true);
  });
});

describe("explainSchoolFit — point 7, no realistic alternative inside this band", () => {
  it("suggests up to 3 real alternatives from the real catalog when unreachable", () => {
    const target = schoolLite({
      slug: "big-state",
      shortName: "Big State",
      gender: "men",
      state: "CA",
      usNewsRanking: 3, // top25
      minCompetitiveUTR: 10,
      avgRosterUTR: 11,
    });
    const bothMatch = schoolLite({
      slug: "both-match",
      gender: "men",
      state: "CA", // same region
      usNewsRanking: 5, // same tier (top25)
      minCompetitiveUTR: 6,
      avgRosterUTR: 7, // Likely for an 8.0 player
    });
    const tierMatch = schoolLite({
      slug: "tier-match",
      gender: "men",
      state: "NY", // different region
      usNewsRanking: 10, // same tier (top25)
      minCompetitiveUTR: 6,
      avgRosterUTR: 7,
    });
    const regionMatch = schoolLite({
      slug: "region-match",
      gender: "men",
      state: "CA", // same region
      usNewsRanking: 120, // different tier (unranked)
      minCompetitiveUTR: 6,
      avgRosterUTR: 7,
    });
    const noMatch = schoolLite({
      slug: "no-match",
      gender: "men",
      state: "NY",
      usNewsRanking: 130,
      minCompetitiveUTR: 6,
      avgRosterUTR: 7,
    });
    const wrongGender = schoolLite({
      slug: "wrong-gender",
      gender: "women",
      state: "CA",
      usNewsRanking: 5,
      minCompetitiveUTR: 6,
      avgRosterUTR: 7,
    });
    const notRealistic = schoolLite({
      slug: "not-realistic",
      gender: "men",
      state: "CA",
      usNewsRanking: 5,
      minCompetitiveUTR: 12, // still a Reach for an 8.0 player — not realistic today
      avgRosterUTR: 13,
    });
    const catalog = [target, bothMatch, tierMatch, regionMatch, noMatch, wrongGender, notRealistic];

    // Class of 2027 -> ~0.56 years of runway; gap to the floor (10 - 8 = 2) is
    // ~3.6/yr, well past the realistic ceiling -> unreachable.
    const explanation = explainSchoolFit(8, target, {
      graduationYear: 2027,
      now: d("2025-11-08"),
      catalog,
    });

    expect(explanation.unreachable).toBe(true);
    expect(explanation.alternatives.map((s) => s.slug)).toEqual(["both-match", "tier-match", "region-match"]);
  });

  it("returns no alternatives when the band is reachable, even if a catalog is supplied", () => {
    const target = schoolLite({ slug: "reachable-school", minCompetitiveUTR: 10, avgRosterUTR: 11 });
    const catalog = [target, schoolLite({ slug: "other", minCompetitiveUTR: 6, avgRosterUTR: 7 })];
    const explanation = explainSchoolFit(10, target, { graduationYear: 2028, now: d("2025-11-08"), catalog });
    expect(explanation.unreachable).toBe(false);
    expect(explanation.alternatives).toEqual([]);
  });

  it("returns no alternatives when unreachable but no catalog was supplied", () => {
    const target = schoolLite({ slug: "unreachable-no-catalog", minCompetitiveUTR: 10, avgRosterUTR: 11 });
    const explanation = explainSchoolFit(8, target, { graduationYear: 2027, now: d("2025-11-08") });
    expect(explanation.unreachable).toBe(true);
    expect(explanation.alternatives).toEqual([]);
  });
});

describe("findAlternativeSchools", () => {
  const target = schoolLite({ slug: "target", gender: "men", state: "CA", usNewsRanking: 3 });

  it("excludes the school itself and any school of the wrong gender", () => {
    const catalog = [
      target,
      schoolLite({ slug: "same-school-again", gender: "men", state: "CA", usNewsRanking: 5, minCompetitiveUTR: 6, avgRosterUTR: 7 }),
      schoolLite({ slug: "wrong-gender", gender: "women", state: "CA", usNewsRanking: 5, minCompetitiveUTR: 6, avgRosterUTR: 7 }),
    ];
    // same-school-again is a realistic Likely match and shares tier+region,
    // so it's a legitimate alternative; "target" itself and wrong-gender
    // should never appear.
    const alts = findAlternativeSchools(target, [target, ...catalog.slice(1)], 8);
    expect(alts.map((s) => s.slug)).toEqual(["same-school-again"]);
  });

  it("requires the player to be realistically Target or Likely today — never a future Reach", () => {
    const stillAReach = schoolLite({
      slug: "still-a-reach",
      gender: "men",
      state: "CA",
      usNewsRanking: 5,
      minCompetitiveUTR: 12,
      avgRosterUTR: 13,
    });
    const alts = findAlternativeSchools(target, [target, stillAReach], 8);
    expect(alts).toEqual([]);
  });

  it("requires at least a tier or region match — a school with neither is excluded even if realistic", () => {
    const noOverlap = schoolLite({
      slug: "no-overlap",
      gender: "men",
      state: "NY", // different region from target's CA
      usNewsRanking: 130, // different tier from target's top25
      minCompetitiveUTR: 6,
      avgRosterUTR: 7,
    });
    const alts = findAlternativeSchools(target, [target, noOverlap], 8);
    expect(alts).toEqual([]);
  });

  it("breaks a tie between two same-score matches by closest US News ranking, then by name", () => {
    const closer = schoolLite({
      slug: "closer",
      shortName: "Zeta",
      gender: "men",
      state: "CA",
      usNewsRanking: 4, // |4-3| = 1
      minCompetitiveUTR: 6,
      avgRosterUTR: 7,
    });
    const farther = schoolLite({
      slug: "farther",
      shortName: "Alpha",
      gender: "men",
      state: "CA",
      usNewsRanking: 20, // |20-3| = 17
      minCompetitiveUTR: 6,
      avgRosterUTR: 7,
    });
    const alts = findAlternativeSchools(target, [target, farther, closer], 8);
    expect(alts.map((s) => s.slug)).toEqual(["closer", "farther"]);
  });

  it("caps results at the given limit", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      schoolLite({
        slug: `alt-${i}`,
        gender: "men",
        state: "CA",
        usNewsRanking: 5,
        minCompetitiveUTR: 6,
        avgRosterUTR: 7,
      })
    );
    const alts = findAlternativeSchools(target, [target, ...many], 8, undefined, 2);
    expect(alts).toHaveLength(2);
  });

  it("returns an empty list against an empty catalog", () => {
    expect(findAlternativeSchools(target, [], 8)).toEqual([]);
  });
});

describe("computeGoalPace — whole-roadmap pace warning math (point 2)", () => {
  it("reads 'within-realistic-range' for the same gap/runway as the per-school version", () => {
    // Class of 2028 -> summer before senior year June 1, 2027, ~1.56 years
    // out from "now" below. gap (10 - 9) = 1 -> ~0.64/yr.
    const pace = computeGoalPace(9, 10, 2028, d("2025-11-08"));
    expect(pace.byDate).toBe("2027-06-01");
    expect(pace.gap).toBe(1);
    expect(pace.paceRead).toBe("within-realistic-range");
    expect(pace.requiredPaceUtrPerYear).toBeGreaterThanOrEqual(REALISTIC_UTR_IMPROVEMENT_PER_YEAR.min);
    expect(pace.requiredPaceUtrPerYear).toBeLessThanOrEqual(REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max);
  });

  it("reads 'slower-than-realistic' when there's plenty of runway for the gap", () => {
    // Class of 2029 -> ~2.56 years out; gap 1 -> ~0.39/yr, below the 0.5 floor.
    const pace = computeGoalPace(9, 10, 2029, d("2025-11-08"));
    expect(pace.paceRead).toBe("slower-than-realistic");
    expect(pace.requiredPaceUtrPerYear).toBeLessThan(REALISTIC_UTR_IMPROVEMENT_PER_YEAR.min);
  });

  it("reads 'faster-than-realistic' when the gap is too big for the runway — the warning-banner case", () => {
    // Class of 2027 -> ~0.56 years out; gap 2 -> ~3.6/yr, well past 1.5.
    const pace = computeGoalPace(8, 10, 2027, d("2025-11-08"));
    expect(pace.paceRead).toBe("faster-than-realistic");
    expect(pace.requiredPaceUtrPerYear).toBeGreaterThan(REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max);
  });

  it("reads 'no-time-left' with a null pace once the milestone has already passed and the goal isn't met", () => {
    // Class of 2026 -> summer before senior year (June 1, 2025) already behind "now".
    const pace = computeGoalPace(8, 10, 2026, d("2025-11-08"));
    expect(pace.byDate).toBe("2025-06-01");
    expect(pace.requiredPaceUtrPerYear).toBeNull();
    expect(pace.paceRead).toBe("no-time-left");
  });

  it("never reports a warning pace once the goal is already met, even with no runway left", () => {
    const pace = computeGoalPace(11, 10, 2026, d("2025-11-08"));
    expect(pace.gap).toBe(0);
    expect(pace.requiredPaceUtrPerYear).toBeNull();
    expect(pace.paceRead).toBe("within-realistic-range");
  });

  it("floors the gap at 0 when currentUTR is already above the goal, with real runway left", () => {
    const pace = computeGoalPace(11, 10, 2029, d("2025-11-08"));
    expect(pace.gap).toBe(0);
    expect(pace.requiredPaceUtrPerYear).toBe(0);
    // 0/yr is below the realistic floor, not "within range" — "you have room," never a warning.
    expect(pace.paceRead).toBe("slower-than-realistic");
  });
});

describe("closestSchoolsByUtrGap — 'closest schools to you' (point 4)", () => {
  const near = schoolLite({ slug: "near", shortName: "Near", minCompetitiveUTR: 8.5, avgRosterUTR: 9 }); // |9-9|=0
  const slightlyOff = schoolLite({ slug: "slightly-off", shortName: "SlightlyOff", minCompetitiveUTR: 9, avgRosterUTR: 9.5 }); // |9.5-9|=.5
  const reach = schoolLite({ slug: "reach", shortName: "Reach", minCompetitiveUTR: 10, avgRosterUTR: 11 }); // |11-9|=2
  const belowFloor = schoolLite({ slug: "below-floor", shortName: "BelowFloor", minCompetitiveUTR: 6, avgRosterUTR: 7 }); // |7-9|=2

  it("ranks real schools by smallest absolute gap to the player's current UTR first", () => {
    const results = closestSchoolsByUtrGap(9, [reach, belowFloor, slightlyOff, near]);
    expect(results.map((r) => r.school.slug)).toEqual(["near", "slightly-off", "reach", "below-floor"]);
  });

  it("breaks a tied avgRosterUTR gap using distance to the competitive floor", () => {
    // Both 2 away from the player's UTR on avgRosterUTR, but "below-floor"'s
    // own floor (6) is farther from 9 than "reach"'s floor (10) is — reach
    // should sort first.
    const results = closestSchoolsByUtrGap(9, [belowFloor, reach]);
    expect(results.map((r) => r.school.slug)).toEqual(["reach", "below-floor"]);
  });

  it("includes the real signed gap and the same band classifySchoolFit would return", () => {
    const [result] = closestSchoolsByUtrGap(9, [slightlyOff]);
    expect(result.gap).toBe(0.5);
    expect(result.band).toBe(classifySchoolFit(9, slightlyOff));
  });

  it("respects the limit", () => {
    const results = closestSchoolsByUtrGap(9, [near, slightlyOff, reach, belowFloor], 2);
    expect(results).toHaveLength(2);
  });

  it("returns an empty list against an empty catalog", () => {
    expect(closestSchoolsByUtrGap(9, [])).toEqual([]);
  });
});
