import { describe, expect, it } from "vitest";
import {
  compareSchoolBands,
  countBands,
  projectUtrAtRecruiting,
  yearsUntilRecruiting,
} from "./fit";
import { UTR_GROWTH_PER_YEAR } from "./config/growth";
import { REALISTIC_UTR_CEILING } from "./config/recruiting";
import type { SchoolLite } from "./types";

// TASK 3. Every case the brief names, plus the two that decide whether this
// is honest: a junior gets no invented growth, and a missing UTR produces
// nothing at all rather than a default.
//
// All dates are injected. A test whose answer depends on the day it runs is
// a test that will fail on some future morning for no reason.

// Grades at the pinned date, read from getCurrentGrade rather than assumed —
// the first draft of this file guessed and was a year out on every case:
//
//   class of 2027 -> grade 12 (senior)
//   class of 2028 -> grade 11 (JUNIOR — being recruited right now)
//   class of 2029 -> grade 10
//   class of 2030 -> grade 9
//   class of 2031 -> grade 8
//
// So the brief's "Class of 2028, UTR 6" case and its "a current junior" case
// are the same player, which is worth knowing rather than papering over.
const NOW = new Date("2026-11-14T12:00:00");

function school(over: Partial<SchoolLite> & { slug: string }): SchoolLite {
  return {
    id: over.slug,
    name: "Test",
    shortName: "Test",
    city: "Testville",
    state: "CA",
    conference: "Test",
    division: "D1",
    gender: "women",
    primaryColor: "#000",
    secondaryColor: "#fff",
    textColor: "#fff",
    avgRosterUTR: 10,
    minCompetitiveUTR: 9,
    usNewsRanking: 50,
    ...over,
  };
}

const project = (currentUtr: number | null, graduationYear: number, gender: "male" | "female" = "female") =>
  projectUtrAtRecruiting({ currentUtr, graduationYear, gender, now: NOW });

describe("how far away recruiting is", () => {
  it("counts years to junior year and never goes negative", () => {
    expect(yearsUntilRecruiting(2031, NOW)).toBe(3); // grade 8 -> 11
    expect(yearsUntilRecruiting(2030, NOW)).toBe(2); // grade 9
    expect(yearsUntilRecruiting(2029, NOW)).toBe(1); // grade 10
    expect(yearsUntilRecruiting(2028, NOW)).toBe(0); // already a junior
    expect(yearsUntilRecruiting(2027, NOW)).toBe(0); // senior
    expect(yearsUntilRecruiting(2026, NOW)).toBe(0); // graduated
  });
});

describe("Class of 2031, UTR 9 — the case that read as 'all reaches'", () => {
  const p = project(9, 2031)!;

  it("projects three years of growth", () => {
    expect(p.yearsOfGrowth).toBe(3);
    expect(p.isAtOrPastRecruiting).toBe(false);
    expect(p.recruitingYear).toBe(2029);
  });

  it("uses the stated assumptions and nothing else", () => {
    expect(p.slow).toBeCloseTo(9 + UTR_GROWTH_PER_YEAR.slow * 3, 5); // 10.5
    expect(p.normal).toBeCloseTo(9 + UTR_GROWTH_PER_YEAR.normal * 3, 5); // 12.0
    // 9 + 1.5*3 = 13.5, above the 12.5 female ceiling.
    expect(p.fast).toBe(REALISTIC_UTR_CEILING.female);
  });

  it("no longer shows every program as a reach", () => {
    // The brief's acceptance criterion, as a number rather than a feeling.
    const catalog = [
      school({ slug: "a", minCompetitiveUTR: 9.5, avgRosterUTR: 10.5 }),
      school({ slug: "b", minCompetitiveUTR: 10.5, avgRosterUTR: 11.5 }),
      school({ slug: "c", minCompetitiveUTR: 11.5, avgRosterUTR: 12.2 }),
      school({ slug: "d", minCompetitiveUTR: 8.0, avgRosterUTR: 9.0 }),
    ];
    const today = countBands(catalog, 9);
    const atRecruiting = countBands(catalog, p.normal);

    // Today: one likely, the rest out of reach in some form.
    expect(today.likely + today.target).toBe(1);
    // By junior year every one of them is in play.
    expect(atRecruiting.likely + atRecruiting.target).toBe(4);
    expect(atRecruiting.reach + atRecruiting.outOfRange).toBe(0);
  });

  it("reports when the ceiling capped it instead of silently rounding", () => {
    expect(p.cappedByCeiling).toBe(true);
    expect(p.fast).toBeLessThanOrEqual(REALISTIC_UTR_CEILING.female);
  });
});

describe("Class of 2027, UTR 11 — a senior", () => {
  const p = project(11, 2027)!;

  it("gets no growth at all, at any pace", () => {
    // They are being recruited now. Inventing a better player than the one
    // coaches are looking at is the worst possible month to do it in.
    expect(p.yearsOfGrowth).toBe(0);
    expect(p.isAtOrPastRecruiting).toBe(true);
    expect(p.slow).toBe(11);
    expect(p.normal).toBe(11);
    expect(p.fast).toBe(11);
  });

  it("leaves every band unchanged", () => {
    const catalog = [school({ slug: "a", minCompetitiveUTR: 11.5, avgRosterUTR: 12.5 })];
    const rows = compareSchoolBands(catalog, 11, p);
    expect(rows[0].today).toBe(rows[0].projected);
    expect(rows[0].improves).toBe(false);
  });
});

describe("Class of 2028, UTR 6 — a junior at this date", () => {
  const p = project(6, 2028)!;

  it("gets no growth, because they are being recruited now", () => {
    expect(p.yearsOfGrowth).toBe(0);
    expect(p.isAtOrPastRecruiting).toBe(true);
    expect(p.slow).toBe(6);
    expect(p.normal).toBe(6);
    expect(p.fast).toBe(6);
  });

  it("does not pretend a 5-point gap closes", () => {
    const reach = school({ slug: "far", minCompetitiveUTR: 11, avgRosterUTR: 12 });
    const rows = compareSchoolBands([reach], 6, p);
    expect(rows[0].projected).not.toBe("likely");
    expect(rows[0].projected).not.toBe("target");
  });
});

describe("Class of 2029, UTR 6 — one year out", () => {
  const p = project(6, 2029)!;

  it("projects exactly one year at each pace", () => {
    expect(p.yearsOfGrowth).toBe(1);
    expect(p.slow).toBe(6.5);
    expect(p.normal).toBe(7);
    expect(p.fast).toBe(7.5);
  });

  it("does not pretend one year closes a five-point gap", () => {
    const reach = school({ slug: "far", minCompetitiveUTR: 11, avgRosterUTR: 12 });
    const rows = compareSchoolBands([reach], 6, p);
    expect(rows[0].projected).not.toBe("likely");
    expect(rows[0].projected).not.toBe("target");
  });
});

describe("a current junior", () => {
  it("gets no growth once they reach junior year", () => {
    // Class of 2029 is grade 10 at NOW and grade 11 a year later — so the
    // same player goes from one year of projected growth to none, which is
    // the transition worth pinning.
    expect(project(8.4, 2029)!.yearsOfGrowth).toBe(1);
    const juniorNow = new Date("2027-11-14T12:00:00");
    const p = projectUtrAtRecruiting({
      currentUtr: 8.4,
      graduationYear: 2029,
      gender: "female",
      now: juniorNow,
    })!;
    expect(p.yearsOfGrowth).toBe(0);
    expect(p.isAtOrPastRecruiting).toBe(true);
    expect(p.normal).toBe(8.4);
  });
});

describe("missing or impossible UTR", () => {
  it("returns null rather than a default", () => {
    // A caller that forgets to handle this should break loudly. There is no
    // honest projection from a number we do not have.
    expect(project(null, 2030)).toBeNull();
    expect(projectUtrAtRecruiting({ currentUtr: undefined, graduationYear: 2030, gender: "male" })).toBeNull();
    expect(project(0, 2030)).toBeNull();
    expect(project(Number.NaN, 2030)).toBeNull();
  });

  it("leaves bands on today's rating when there is no projection", () => {
    const catalog = [school({ slug: "a", minCompetitiveUTR: 9, avgRosterUTR: 10 })];
    const rows = compareSchoolBands(catalog, 9.5, null);
    expect(rows[0].projected).toBe(rows[0].today);
    expect(rows[0].improves).toBe(false);
  });
});

describe("out-of-range UTR", () => {
  it("never projects past the per-gender realistic ceiling", () => {
    const male = project(13.8, 2031, "male")!;
    expect(male.fast).toBeLessThanOrEqual(REALISTIC_UTR_CEILING.male);
    expect(male.normal).toBeLessThanOrEqual(REALISTIC_UTR_CEILING.male);
    expect(male.slow).toBeLessThanOrEqual(REALISTIC_UTR_CEILING.male);
  });

  it("caps a rating already above the ceiling instead of climbing further", () => {
    const p = project(16.4, 2031, "female")!;
    expect(p.fast).toBe(REALISTIC_UTR_CEILING.female);
    expect(p.slow).toBe(REALISTIC_UTR_CEILING.female);
  });
});

describe("the comparison a school row renders", () => {
  it("marks the schools the trajectory actually moves", () => {
    const p = project(8, 2031)!; // +3 at normal pace -> 11.0
    const catalog = [
      school({ slug: "moves", minCompetitiveUTR: 10, avgRosterUTR: 11 }),
      school({ slug: "already", minCompetitiveUTR: 6, avgRosterUTR: 7 }),
    ];
    const rows = compareSchoolBands(catalog, 8, p);
    expect(rows.find((r) => r.slug === "moves")!.improves).toBe(true);
    // Already "likely" today — a projection cannot improve on it.
    expect(rows.find((r) => r.slug === "already")!.improves).toBe(false);
  });

  it("exposes slow and fast for the expanded row", () => {
    const p = project(7, 2030)!;
    const rows = compareSchoolBands([school({ slug: "a", minCompetitiveUTR: 9, avgRosterUTR: 10 })], 7, p);
    expect(rows[0]).toHaveProperty("projectedSlow");
    expect(rows[0]).toHaveProperty("projectedFast");
  });
});

describe("the numbers are deterministic", () => {
  it("gives the same answer for the same inputs, every time", () => {
    const a = project(9.25, 2030);
    const b = project(9.25, 2030);
    expect(a).toEqual(b);
  });

  it("rounds to one decimal, not two", () => {
    // UTR publishes two. A projection carrying two implies a precision the
    // assumption does not have.
    const p = project(7.33, 2030)!;
    for (const v of [p.slow, p.normal, p.fast]) {
      expect(Math.round(v * 10) / 10).toBe(v);
    }
  });
});
