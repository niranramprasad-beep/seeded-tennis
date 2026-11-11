import { describe, expect, it } from "vitest";
import { gapToRelevantBoundary, sortSchoolsForSeeded } from "./school-sort";
import type { SchoolLite } from "./types";

function school(overrides: Partial<SchoolLite> & { slug: string }): SchoolLite {
  return {
    id: overrides.slug,
    name: overrides.slug,
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
    ...overrides,
  };
}

describe("gapToRelevantBoundary", () => {
  it("measures how far above the median once already Likely", () => {
    expect(gapToRelevantBoundary(12, school({ slug: "a" }))).toBeCloseTo(1, 5);
  });

  it("measures the gap to the median while in Target", () => {
    expect(gapToRelevantBoundary(10.5, school({ slug: "a" }))).toBeCloseTo(0.5, 5);
  });

  it("measures the gap to the floor while below it (Reach/Out-of-range)", () => {
    expect(gapToRelevantBoundary(9, school({ slug: "a" }))).toBeCloseTo(1, 5);
  });
});

describe("sortSchoolsForSeeded", () => {
  const schools = [
    school({ slug: "far-reach", minCompetitiveUTR: 13, avgRosterUTR: 14, usNewsRanking: 10 }),
    school({ slug: "likely", minCompetitiveUTR: 8, avgRosterUTR: 9, usNewsRanking: 90 }),
    school({ slug: "close-target", minCompetitiveUTR: 10, avgRosterUTR: 10.2, usNewsRanking: 40 }),
  ];
  const utr = 10;

  it("'default' returns the input array unchanged (same reference)", () => {
    expect(sortSchoolsForSeeded(schools, "default", utr)).toBe(schools);
  });

  it("'gap' sorts by distance to the relevant boundary, closest first", () => {
    const sorted = sortSchoolsForSeeded(schools, "gap", utr).map((s) => s.slug);
    // close-target: gap 0.2 to median; likely: gap 1 above median;
    // far-reach: gap 3 to floor.
    expect(sorted).toEqual(["close-target", "likely", "far-reach"]);
  });

  it("'fit' sorts by band order (Likely, Target, Reach, Out-of-range), gap as tiebreak", () => {
    const sorted = sortSchoolsForSeeded(schools, "fit", utr).map((s) => s.slug);
    expect(sorted).toEqual(["likely", "close-target", "far-reach"]);
  });

  it("'academics' sorts by US News ranking ascending", () => {
    const sorted = sortSchoolsForSeeded(schools, "academics", utr).map((s) => s.slug);
    expect(sorted).toEqual(["far-reach", "close-target", "likely"]);
  });

  it("'fit' honestly falls back to Reach (never Out-of-range) with no projection", () => {
    const belowFloor = [school({ slug: "below", minCompetitiveUTR: 15, avgRosterUTR: 16 })];
    const sorted = sortSchoolsForSeeded(belowFloor, "fit", 5);
    expect(sorted).toHaveLength(1);
  });
});
