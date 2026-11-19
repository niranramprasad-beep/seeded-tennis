import { describe, expect, it } from "vitest";
import {
  buildFitReport,
  compareSchoolBands,
  countBands,
  projectUtrAtRecruiting,
  projectedUtrOn,
  projectionReachDate,
  projectionTargetDate,
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

// The target is June 1 of the summer before senior year (2026-11-16
// decision: the homepage already promised "by the summer before senior
// year"; the projection used to stop at junior year). From NOW that is:
//   2031 -> June 2030 (~3.55 yr)  2030 -> June 2029 (~2.55)
//   2029 -> June 2028 (~1.55)     2028 -> June 2027 (~0.55, a junior)
//   2027 -> June 2026 (passed: 0) 2026 -> passed: 0
const Y = (target: string) => (new Date(target).getTime() - NOW.getTime()) / (365.25 * 24 * 3600 * 1000);

describe("how far away the summer before senior year is", () => {
  it("counts fractional years to June 1 of that summer and never goes negative", () => {
    expect(yearsUntilRecruiting(2031, NOW)).toBeCloseTo(Y("2030-06-01T00:00:00"), 6);
    expect(yearsUntilRecruiting(2030, NOW)).toBeCloseTo(Y("2029-06-01T00:00:00"), 6);
    expect(yearsUntilRecruiting(2029, NOW)).toBeCloseTo(Y("2028-06-01T00:00:00"), 6);
    expect(yearsUntilRecruiting(2028, NOW)).toBeCloseTo(Y("2027-06-01T00:00:00"), 6); // a junior still has months
    expect(yearsUntilRecruiting(2028, NOW)).toBeGreaterThan(0.5);
    expect(yearsUntilRecruiting(2027, NOW)).toBe(0); // that summer has passed
    expect(yearsUntilRecruiting(2026, NOW)).toBe(0); // graduated
  });
});

describe("Class of 2031, UTR 9 — the case that read as 'all reaches'", () => {
  const p = project(9, 2031)!;

  it("projects to the summer before senior year (June 2030)", () => {
    expect(p.yearsOfGrowth).toBeCloseTo(Y("2030-06-01T00:00:00"), 6);
    expect(p.isAtOrPastRecruiting).toBe(false);
    expect(p.recruitingYear).toBe(2030);
  });

  it("uses the stated assumptions and nothing else", () => {
    const yrs = Y("2030-06-01T00:00:00");
    const r = (v: number) => Math.round(v * 10) / 10;
    expect(p.slow).toBe(r(9 + UTR_GROWTH_PER_YEAR.slow * yrs)); // ~10.8
    expect(p.normal).toBe(r(Math.min(REALISTIC_UTR_CEILING.female, 9 + UTR_GROWTH_PER_YEAR.normal * yrs))); // 12.5 (ceiling)
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
    // By the summer before senior year every one of them is in play.
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

  it("projects only to the coming summer (June 2027), not past it", () => {
    const yrs = Y("2027-06-01T00:00:00");
    expect(p.isAtOrPastRecruiting).toBe(false);
    expect(p.recruitingYear).toBe(2027);
    expect(p.yearsOfGrowth).toBeCloseTo(yrs, 6);
    expect(p.normal).toBe(Math.round((6 + UTR_GROWTH_PER_YEAR.normal * yrs) * 10) / 10); // 6.5
  });

  it("does not pretend a 5-point gap closes", () => {
    const reach = school({ slug: "far", minCompetitiveUTR: 11, avgRosterUTR: 12 });
    const rows = compareSchoolBands([reach], 6, p);
    expect(rows[0].projected).not.toBe("likely");
    expect(rows[0].projected).not.toBe("target");
  });
});

describe("Class of 2029, UTR 6 — a sophomore", () => {
  const p = project(6, 2029)!;

  it("projects about a year and a half, to June 2028, at each pace", () => {
    const yrs = Y("2028-06-01T00:00:00");
    const r = (v: number) => Math.round(v * 10) / 10;
    expect(p.yearsOfGrowth).toBeCloseTo(yrs, 6);
    expect(p.slow).toBe(r(6 + UTR_GROWTH_PER_YEAR.slow * yrs)); // 6.8
    expect(p.normal).toBe(r(6 + UTR_GROWTH_PER_YEAR.normal * yrs)); // 7.5
    expect(p.fast).toBe(r(6 + UTR_GROWTH_PER_YEAR.fast * yrs)); // 8.3
  });

  it("does not pretend one year closes a five-point gap", () => {
    const reach = school({ slug: "far", minCompetitiveUTR: 11, avgRosterUTR: 12 });
    const rows = compareSchoolBands([reach], 6, p);
    expect(rows[0].projected).not.toBe("likely");
    expect(rows[0].projected).not.toBe("target");
  });
});

describe("the summer before senior year", () => {
  it("gets no growth once that summer has begun", () => {
    // Class of 2029: about a year and a half of growth at NOW, and none on
    // or after June 1 2028 — the transition worth pinning.
    expect(project(8.4, 2029)!.yearsOfGrowth).toBeGreaterThan(1.5);
    const juniorNow = new Date("2028-06-02T12:00:00");
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
    const p = project(8, 2031)!; // ~3.55 yr at normal pace -> 11.5
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

describe("one rating on one date gets one band (verifier H1, 2026-11-16)", () => {
  // Floors spread from just above to far above the projected rating.
  const schools = [9, 10, 11, 12, 12.5, 13, 13.5, 14, 15].map((floor, i) =>
    school({ slug: `s${i}`, minCompetitiveUTR: floor, avgRosterUTR: floor + 1.2 })
  );
  // A logged trend of about 0.8/yr: slower than the 1.0/yr assumption.
  const history = [
    { date: new Date("2025-11-14T12:00:00"), utr: 7.9 },
    { date: new Date("2026-05-14T12:00:00"), utr: 8.3 },
    { date: new Date("2026-11-14T12:00:00"), utr: 8.7 },
  ];
  const base = {
    currentUtr: 8.7,
    graduationYear: 2031,
    gender: "male" as const,
    schools,
    projectionInput: { utrHistory: history, graduationYear: 2031, gender: "male" as const, now: NOW },
    now: NOW,
  };

  it("the default projected view and the what-if at the same rating agree school by school", () => {
    const projected = buildFitReport({ ...base, view: "recruiting" })!;
    expect(projected.utr.isProjected).toBe(true);
    // Since 2026-11-18 the Nov 14 2025 entry (12 months) sets the summer
    // estimate itself — the player's own ~0.8/yr, not typical growth — and
    // the two views must still agree at that number.
    expect(projected.utr.source).toBe("logged-pace");
    const chosen = buildFitReport({ ...base, overrideUtr: projected.utr.value })!;
    for (const s of schools) {
      expect(chosen.bandBySlug.get(s.slug)).toBe(projected.bandBySlug.get(s.slug));
    }
  });

  it("does not grow the rating past the summer before senior year to manufacture Reaches", () => {
    const projected = buildFitReport({ ...base, view: "recruiting" })!;
    // Every floor above the projected rating is above the logged pace too,
    // so none of them is a closeable Reach.
    for (const s of schools.filter((x) => x.minCompetitiveUTR > projected.utr.value)) {
      expect(projected.bandBySlug.get(s.slug)).toBe("out-of-range");
    }
  });
});

describe("projectedUtrOn / projectionReachDate (the parent chart's line and caption)", () => {
  // Class of 2029 seen on 2026-11-15: the summer before senior year is
  // June 1 2028, about 1.54 years away.
  const NOW = new Date(2026, 10, 15, 12);
  const base = { currentUtr: 8, graduationYear: 2029, gender: "male" as const, now: NOW };

  it("starts at today's rating and ends where projectUtrAtRecruiting ends", () => {
    expect(projectedUtrOn(base, NOW)).toBe(8);
    const end = projectedUtrOn(base, projectionTargetDate(2029))!;
    const official = projectUtrAtRecruiting(base)!;
    // unrounded here; the official number is rounded to one decimal
    expect(Math.abs(end - official.normal)).toBeLessThan(0.05);
    expect(projectedUtrOn(base, projectionTargetDate(2029), "slow")!).toBeLessThan(end);
    expect(projectedUtrOn(base, projectionTargetDate(2029), "fast")!).toBeGreaterThan(end);
  });

  it("never runs past the summer before senior year, or before today", () => {
    const end = projectedUtrOn(base, projectionTargetDate(2029))!;
    expect(projectedUtrOn(base, new Date(2031, 0, 1))).toBe(end);
    expect(projectedUtrOn(base, new Date(2020, 0, 1))).toBe(8);
  });

  it("is capped at the realistic ceiling and null without a rating", () => {
    expect(projectedUtrOn({ ...base, currentUtr: 13.9 }, projectionTargetDate(2029))).toBe(REALISTIC_UTR_CEILING.male);
    for (const currentUtr of [null, undefined, 0, Number.NaN]) {
      expect(projectedUtrOn({ ...base, currentUtr }, NOW)).toBeNull();
      expect(projectionReachDate({ ...base, currentUtr }, 9)).toBeNull();
    }
  });

  it("reach date: when the typical pace crosses the line, or null when it does not by then", () => {
    const at = projectionReachDate(base, 9)!;
    const years = 1 / UTR_GROWTH_PER_YEAR.normal;
    expect(Math.abs(at.getTime() - (NOW.getTime() + years * 365.25 * 86_400_000))).toBeLessThan(1000);
    expect(at.getTime()).toBeLessThan(projectionTargetDate(2029).getTime());
    expect(projectionReachDate(base, 10)).toBeNull();
    expect(projectionReachDate(base, 7.5)).toBe(NOW);
    expect(projectionReachDate({ ...base, currentUtr: 13 }, 14.5)).toBeNull();
  });
});
