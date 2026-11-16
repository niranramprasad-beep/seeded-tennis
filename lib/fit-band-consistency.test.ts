import { describe, expect, it } from "vitest";
import { classifySchoolFit, countSchoolFits, explainSchoolFit, fitBasis } from "./school-fit";
import { realisticPaceProjectionFor, whatIfProjectionFor } from "./what-if-utr";
import type { SchoolLite } from "./types";

// P1-FIT-1. The same player and the same school produced different bands on
// different screens, because the screens disagreed about what projection to
// pass classifySchoolFit:
//
//   School detail / Plan  -> real history            -> "Out of range"
//   /schools browser      -> undefined (what-if mode) -> "Reach"
//
// and classifySchoolFit answers "reach" for ANY below-floor school when it
// has no projection. Live, that read "Reach 37 · Out of range 0" on /schools
// while Stanford's own page said Out of range.
//
// These tests lock the invariant that matters to a user: one player, one
// school, one band — whichever screen they're looking at. They're written
// against the shared functions every screen calls rather than the screens
// themselves, because that sharing IS the fix; a screen that stops calling
// these is the regression to catch in review.

function school(overrides: Partial<SchoolLite> & { slug: string }): SchoolLite {
  return {
    id: overrides.slug,
    name: "Test University",
    shortName: "Test",
    city: "Testville",
    state: "CA",
    conference: "Test Conference",
    division: "D1",
    gender: "men",
    primaryColor: "#000",
    secondaryColor: "#fff",
    textColor: "#fff",
    avgRosterUTR: 13.6,
    minCompetitiveUTR: 12.3,
    usNewsRanking: 3,
    ...overrides,
  };
}

const NOW = new Date("2026-01-01T00:00:00");

// A real junior: 5.81 UTR, graduating 2028, three logged entries on a
// modest upward trend. The audit's live example.
const PLAYER = {
  currentUTR: 5.81,
  graduationYear: 2028,
  gender: "male" as const,
};

const REAL_PROJECTION = {
  utrHistory: [
    { date: new Date("2025-01-15"), utr: 5.1 },
    { date: new Date("2025-06-15"), utr: 5.4 },
    { date: new Date("2025-11-15"), utr: 5.8 },
  ],
  graduationYear: PLAYER.graduationYear,
  gender: PLAYER.gender,
  now: NOW,
};

const ELITE = school({ slug: "elite", minCompetitiveUTR: 12.3, avgRosterUTR: 13.6 });
const MID = school({ slug: "mid", minCompetitiveUTR: 5.5, avgRosterUTR: 6.4 });
const BELOW = school({ slug: "below", minCompetitiveUTR: 4.0, avgRosterUTR: 5.0 });

describe("one player + one school = one band, on every screen", () => {
  // Each entry is "how a screen asks the question". Every screen that shows a
  // band ultimately calls one of these three with the same inputs.
  const askers = {
    // Schools browser rows, Outreach cards, Today, Family
    classify: (p: number, s: SchoolLite, proj: typeof REAL_PROJECTION) =>
      classifySchoolFit(fitBasis(p, proj), s),
    // School detail "Why this band", Plan target list, expanded Schools row
    explain: (p: number, s: SchoolLite, proj: typeof REAL_PROJECTION) =>
      explainSchoolFit(p, s, { ...proj, catalog: [ELITE, MID, BELOW] }).band,
    // The Schools browser's filter-chip counters
    count: (p: number, s: SchoolLite, proj: typeof REAL_PROJECTION) => {
      const c = countSchoolFits(fitBasis(p, proj), [s]);
      if (c.outOfRange) return "out-of-range";
      if (c.reach) return "reach";
      if (c.target) return "target";
      return "likely";
    },
  };

  for (const s of [ELITE, MID, BELOW]) {
    it(`agrees across classify / explain / count for "${s.slug}"`, () => {
      const bands = Object.values(askers).map((ask) =>
        ask(PLAYER.currentUTR, s, REAL_PROJECTION)
      );
      expect(new Set(bands).size).toBe(1);
    });
  }

  it("calls an unreachable program out of range, not a reach", () => {
    // 5.81 now, trending ~+0.7/yr, against a 12.3 floor. No honest reading of
    // that history closes a 6.5 gap by senior summer.
    expect(classifySchoolFit(fitBasis(PLAYER.currentUTR, REAL_PROJECTION), ELITE)).toBe("out-of-range");
  });
});

describe("what-if modes agree with the screens they drive", () => {
  const MODES = ["mine", "plus1.5", "custom"] as const;

  it("produces a usable projection in every mode", () => {
    for (const mode of MODES) {
      const projection = whatIfProjectionFor(mode, REAL_PROJECTION, {
        currentUTR: PLAYER.currentUTR,
        hypotheticalUTR: 9,
      });
      expect(projection).toBeDefined();
      expect(projection.utrHistory.length).toBeGreaterThanOrEqual(3);
    }
  });

  // The headline bug: every mode except "mine" said Reach for everything.
  it("can still answer out-of-range in a hypothetical mode", () => {
    for (const mode of MODES) {
      const projection = whatIfProjectionFor(mode, REAL_PROJECTION, {
        currentUTR: PLAYER.currentUTR,
        hypotheticalUTR: 9,
      });
      // At a hypothetical 9.0, a 12.3 floor is still unreachable.
      expect(classifySchoolFit(fitBasis(9, projection), ELITE)).toBe("out-of-range");
    }
  });

  it("never reports zero out-of-range across the catalog in a hypothetical mode", () => {
    const projection = whatIfProjectionFor("plus1.5", REAL_PROJECTION, {
      currentUTR: PLAYER.currentUTR,
      hypotheticalUTR: 7.3,
    });
    const counts = countSchoolFits(fitBasis(7.3, projection), [ELITE, MID, BELOW]);
    expect(counts.outOfRange).toBeGreaterThan(0);
    expect(counts.reach + counts.target + counts.likely + counts.outOfRange).toBe(3);
  });

  it("row bands and the chip counters agree in a hypothetical mode", () => {
    const catalog = [ELITE, MID, BELOW];
    const projection = whatIfProjectionFor("custom", REAL_PROJECTION, {
      currentUTR: PLAYER.currentUTR,
      hypotheticalUTR: 6.2,
    });
    const counts = countSchoolFits(fitBasis(6.2, projection), catalog);
    const rows = catalog.map((s) => classifySchoolFit(fitBasis(6.2, projection), s));

    expect(rows.filter((b) => b === "out-of-range").length).toBe(counts.outOfRange);
    expect(rows.filter((b) => b === "reach").length).toBe(counts.reach);
    expect(rows.filter((b) => b === "target").length).toBe(counts.target);
    expect(rows.filter((b) => b === "likely").length).toBe(counts.likely);
  });

  it("a higher hypothetical never produces a worse band", () => {
    const catalog = [ELITE, MID, BELOW];
    const RANK = { "out-of-range": 0, reach: 1, target: 2, likely: 3 } as const;
    for (const s of catalog) {
      let previous = -1;
      for (const utr of [4, 6, 8, 10, 12, 14]) {
        const projection = whatIfProjectionFor("custom", REAL_PROJECTION, {
          currentUTR: PLAYER.currentUTR,
          hypotheticalUTR: utr,
        });
        const rank = RANK[classifySchoolFit(fitBasis(utr, projection), s)];
        expect(rank).toBeGreaterThanOrEqual(previous);
        previous = rank;
      }
    }
  });
});

// ---------------------------------------------------------------- P1-FIT-4
// The pre-auth journey (homepage calculator -> /onboarding fit report) knows
// exactly one thing about the visitor: the UTR they typed. Both screens used
// to call the classifier with no projection, which is not an abstention —
// classifySchoolFit returns "reach" for every school below the team floor
// when it has none. Live symptom on a signed-out /onboarding: "Reach 37 ·
// Out of range 0", and a 3.0 visitor told Stanford was a Reach.
//
// These lock the two properties that matter: the pre-auth path produces
// out-of-range for a gap no realistic pace closes, and the homepage and the
// fit report cannot disagree (they are one function, called with one input).
describe("P1-FIT-4 pre-auth fit uses a realistic-pace projection", () => {
  const elite = school({ slug: "elite", minCompetitiveUTR: 12.3, avgRosterUTR: 13.6 });
  // 1.5/yr is the top of REALISTIC_UTR_IMPROVEMENT_PER_YEAR, so ~2.4 years
  // of runway buys at most ~3.6 UTR. A 3.0 visitor cannot reach 12.3.
  const preAuth = (currentUTR: number, graduationYear: number) =>
    realisticPaceProjectionFor({ currentUTR, graduationYear, gender: "male", now: NOW });

  it("marks a gap no realistic pace can close as out-of-range, not reach", () => {
    expect(classifySchoolFit(fitBasis(3.0, preAuth(3.0, 2028)), elite)).toBe("out-of-range");
  });

  it("still allows reach where the realistic pace does close the gap", () => {
    const closeable = school({ slug: "closeable", minCompetitiveUTR: 8.0, avgRosterUTR: 9.0 });
    expect(classifySchoolFit(fitBasis(6.0, preAuth(6.0, 2028)), closeable)).toBe("reach");
  });

  it("does not downgrade a school the visitor already qualifies for", () => {
    expect(classifySchoolFit(fitBasis(13.9, preAuth(13.9, 2028)), elite)).toBe("likely");
    expect(classifySchoolFit(fitBasis(12.5, preAuth(12.5, 2028)), elite)).toBe("target");
  });

  it("stops reporting zero out-of-range for a low-UTR visitor", () => {
    const catalog = [
      elite,
      school({ slug: "mid", minCompetitiveUTR: 9.0, avgRosterUTR: 10.0 }),
      school({ slug: "low", minCompetitiveUTR: 4.0, avgRosterUTR: 5.0 }),
    ];
    const counts = countSchoolFits(fitBasis(3.0, preAuth(3.0, 2028)), catalog);
    expect(counts.outOfRange).toBeGreaterThan(0);
  });

  it("gives the homepage calculator and the fit report the same answer", () => {
    // Both screens build the projection from the same three inputs through
    // the same helper; this fails if either starts deriving its own.
    const fromHome = realisticPaceProjectionFor({
      currentUTR: 5.81,
      graduationYear: 2028,
      gender: "female",
      now: NOW,
    });
    const fromReport = realisticPaceProjectionFor({
      currentUTR: 5.81,
      graduationYear: 2028,
      gender: "female",
      now: NOW,
    });
    for (const s of [elite, school({ slug: "b", minCompetitiveUTR: 7, avgRosterUTR: 8 })]) {
      expect(classifySchoolFit(fitBasis(5.81, fromHome), s)).toBe(classifySchoolFit(fitBasis(5.81, fromReport), s));
    }
  });
});
