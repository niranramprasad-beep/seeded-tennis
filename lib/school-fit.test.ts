import { describe, expect, it } from "vitest";
import { classifySchoolFit, countSchoolFits, type SchoolFitProjectionInput } from "./school-fit";
import type { UtrDataPoint } from "./utr-projection";

const SCHOOL = { minCompetitiveUTR: 10, avgRosterUTR: 11 };

function d(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
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
