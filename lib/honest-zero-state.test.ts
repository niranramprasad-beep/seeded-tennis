import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PLANNING_PACE_CAP_PER_YEAR,
  PLANNING_RULE_SENTENCE,
  buildFitReport,
  paceUpsideSentence,
  type BandCounts,
  type RecruitingTimeUtr,
} from "./fit";
import {
  closestProgramAbove,
  fitReportHeadline,
  heroFitCta,
  inRangeButtonLabel,
  nothingInRangeSentence,
  teamLineRelation,
} from "./fit-copy";
import { codeOnly, readableSource } from "./testing/source-text";
import type { SchoolLite } from "./types";

// The honest zero state (owner's audit, 2026-11-21): A-001, A-002, A-006,
// A-007, A-008. The copy builders live in lib/fit-copy.ts as pure functions
// so this file reads exactly what a screen prints.

function school(slug: string, floor: number, avg: number, shortName = slug): SchoolLite {
  return {
    id: slug,
    slug,
    name: shortName,
    shortName,
    city: "",
    state: "CA",
    conference: "",
    division: "D1",
    gender: "women",
    primaryColor: "",
    secondaryColor: "",
    textColor: "",
    avgRosterUTR: avg,
    minCompetitiveUTR: floor,
    usNewsRanking: 1,
  };
}

const counts = (reach: number, target: number, likely: number, outOfRange = 0): BandCounts => ({
  reach,
  target,
  likely,
  outOfRange,
});

describe("closestProgramAbove — the nearest estimated range above the rating", () => {
  const catalog = [school("far", 12, 13), school("near", 10.2, 11), school("mid", 11, 12)];

  it("picks the smallest gap to the range's lower bound (the floor), not the average", () => {
    // "avg-near" has the closest AVERAGE (10.5) but a floor further away
    // (10.4) than "near" (10.2).
    const withAvg = [...catalog, school("avg-near", 10.4, 10.5)];
    expect(closestProgramAbove(9.4, withAvg)).toEqual({ slug: "near", name: "near", gap: 0.8 });
  });

  it("skips programs with no usable range — never invents one", () => {
    const broken = [school("nan", Number.NaN, 11), school("zero", 0, 0), school("near", 10.2, 11)];
    expect(closestProgramAbove(9.4, broken)?.slug).toBe("near");
    expect(closestProgramAbove(9.4, [school("nan", Number.NaN, Number.NaN)])).toBeNull();
  });

  it("skips programs already in range (floor at or below the rating)", () => {
    expect(closestProgramAbove(10.2, catalog)?.slug).toBe("mid");
    expect(closestProgramAbove(13, catalog)).toBeNull();
  });

  it("ties go to the name first alphabetically, whatever the catalogue order", () => {
    const tied = [school("b", 10, 11, "Bravo"), school("a", 10, 11, "Alpha")];
    expect(closestProgramAbove(9, tied)?.name).toBe("Alpha");
    expect(closestProgramAbove(9, [...tied].reverse())?.name).toBe("Alpha");
  });

  it("returns nothing without a real UTR (null, the 0 sentinel, NaN)", () => {
    for (const utr of [null, undefined, 0, -1, Number.NaN]) {
      expect(closestProgramAbove(utr, catalog)).toBeNull();
    }
  });
});

describe("nothingInRangeSentence", () => {
  it("states the catalogue count, today's UTR at two decimals and the closest gap as an estimate", () => {
    expect(
      nothingInRangeSentence({ programCount: 24, utr: 9.4, closest: { slug: "f", name: "Florida", gap: 1.15 } })
    ).toBe("None of our 24 programs are in range at 9.40 yet. Closest: Florida, about +1.1 away (estimate).");
  });

  it("never prints '+0.0'", () => {
    expect(nothingInRangeSentence({ programCount: 24, utr: 9.97, closest: { slug: "f", name: "Florida", gap: 0.03 } })).toBe(
      "None of our 24 programs are in range at 9.97 yet. Closest: Florida, less than 0.1 away (estimate)."
    );
  });

  it("no output at all without a real UTR", () => {
    for (const utr of [null, undefined, 0]) {
      expect(nothingInRangeSentence({ programCount: 24, utr, closest: null })).toBeNull();
    }
  });
});

describe("heroFitCta — the homepage card never shows 0 / 0 / 0 or 'See my — schools'", () => {
  const catalog = [school("near", 10.2, 11, "Florida"), school("far", 12, 13, "Stanford")];

  it("an exhaustive sweep of small counts never yields a zero or a dash where the count goes", () => {
    for (let r = 0; r <= 3; r++)
      for (let t = 0; t <= 3; t++)
        for (let l = 0; l <= 3; l++)
          for (const utr of [9.4, 0, null]) {
            const cta = heroFitCta({ counts: counts(r, t, l), utr, schools: catalog });
            if (cta.showCounts) expect(r + t + l, "tiles shown with 0 / 0 / 0").toBeGreaterThan(0);
            const text = cta.kind === "zero" ? cta.sentence : cta.label;
            expect(text).not.toMatch(/See my (?:0|—|-|–)(?:\s|$)|\b0 \/ 0 \/ 0\b|\bNaN\b|undefined/);
            if (cta.kind === "button") {
              expect(cta.label).toBe(inRangeButtonLabel(t + l));
              expect(t + l).toBeGreaterThan(0);
            }
          }
  });

  it("the button counts Target + Likely only — never Reach", () => {
    expect(heroFitCta({ counts: counts(9, 2, 1), utr: 9.4, schools: catalog })).toEqual({
      kind: "button",
      showCounts: true,
      label: "See my 3 Target and Likely schools",
    });
  });

  it("singular: 'See my 1 Target or Likely school'", () => {
    expect(inRangeButtonLabel(1)).toBe("See my 1 Target or Likely school");
    expect(inRangeButtonLabel(2)).toBe("See my 2 Target and Likely schools");
    expect(heroFitCta({ counts: counts(0, 0, 1), utr: 9.4, schools: catalog })).toMatchObject({
      label: "See my 1 Target or Likely school",
    });
  });

  it("all zero: no tiles, the zero sentence and 'See all programs' to /schools", () => {
    expect(heroFitCta({ counts: counts(0, 0, 0, 2), utr: 9.4, schools: catalog })).toEqual({
      kind: "zero",
      showCounts: false,
      sentence: "None of our 2 programs are in range at 9.40 yet. Closest: Florida, about +0.8 away (estimate).",
      link: { label: "See all programs", href: "/schools" },
    });
  });

  it("Reach only: the tiles stay (they are not all zero) but the button becomes the zero state", () => {
    const cta = heroFitCta({ counts: counts(2, 0, 0), utr: 9.4, schools: catalog });
    expect(cta.kind).toBe("zero");
    expect(cta.showCounts).toBe(true);
  });

  it("no real UTR: no tiles, no zero sentence, a plain button and a prompt", () => {
    for (const utr of [0, null, undefined, Number.NaN]) {
      expect(heroFitCta({ counts: counts(0, 0, 0), utr, schools: catalog })).toEqual({
        kind: "no-utr",
        showCounts: false,
        label: "See my schools",
        note: "Add a UTR to see your counts.",
      });
    }
    expect(heroFitCta({ counts: null, utr: 9.4, schools: catalog }).kind).toBe("no-utr");
  });
});

describe("the screens render through these functions", () => {
  it("the homepage card: tiles and button from heroFitCta, no hand-built count text", () => {
    const f = "components/seeded/home/seeded-home-view.tsx";
    const src = codeOnly(f);
    expect(src).toMatch(/heroFitCta\(\{ counts: report\?\.counts, utr: utrNum, schools: filtered \}\)/);
    expect(src).toMatch(/cta\.showCounts && counts \?/);
    expect(src).toMatch(/\{cta\.label\}/);
    expect(src).not.toMatch(/See my \{/);
    // The tiles are only reachable behind cta.showCounts.
    const tiles = src.indexOf("<CountTile value={counts.reach}");
    expect(src.lastIndexOf("cta.showCounts", tiles)).toBeGreaterThan(-1);
  });

  it("the fit report: headline from fitReportHeadline, zero state from nothingInRangeSentence", () => {
    const src = codeOnly("components/seeded/onboarding/seeded-pre-auth-onboarding.tsx");
    const headline = src.slice(src.indexOf("<h1"), src.indexOf("</h1>"));
    expect(headline).toMatch(/fitReportHeadline\(report, parent \? "parent" : "player"\)/);
    expect(src).toMatch(/nothingInRangeSentence\(\{/);
    expect(src).toMatch(/closestProgramAbove\(today, filtered\)/);
    expect(src).toMatch(/programCount: filtered\.length/);
  });

  it("the home subhead and meta description name our estimated range and a counted N", () => {
    const home = readableSource("components/seeded/home/seeded-home-view.tsx");
    expect(home).toMatch(/compares your UTR with our estimated range for \{teamCount\} college teams/);
    expect(home).toMatch(/our estimated range for \{schools\.length\} college teams/);
    expect(home).toMatch(/Takes about 90 seconds\./);
    const page = readFileSync("app/page.tsx", "utf8");
    expect(page).toMatch(/getCatalogCounts\(\)/);
    expect(page).toContain("compares your UTR with our estimated range for ${total} college teams");
    expect(page).not.toMatch(/compares you to real programs/);
  });
});

describe("fitReportHeadline — today first (A-006)", () => {
  // Fixed date: Class of 2029's summer before senior year is June 1 2028.
  const NOW = new Date(2026, 10, 21, 12);
  const catalog = [
    school("in-today", 8.5, 9.0), // Likely today
    school("by-summer", 10.0, 11.5), // below the floor today, Target at the projection
    school("never", 13.0, 14.0), // out of reach
  ];
  const build = (currentUtr: number, graduationYear = 2029) =>
    buildFitReport({ currentUtr, graduationYear, gender: "female", schools: catalog, now: NOW })!;

  it("counts today, then the planning pace and the projected count the bands use", () => {
    const report = build(9.4);
    expect(report.todayInRange).toBe(1);
    expect(report.recruitingInRange).toBe(2);
    expect(report.utr.planningPacePerYear).toBe(1);
    expect(fitReportHeadline(report, "player")).toBe(
      "Today, 1 program is in range. If you gain about 1.00 UTR a year (our assumption), that could be 2 by summer 2028."
    );
    expect(fitReportHeadline(report, "parent")).toBe(
      "Today, 1 program is in range. If your player gains about 1.00 UTR a year (our assumption), that could be 2 by summer 2028."
    );
  });

  it("the pace is the capped planning pace, never the player's own faster one", () => {
    const fake = {
      todayInRange: 0,
      recruitingInRange: 3,
      utr: { isProjected: true, planningPacePerYear: PLANNING_PACE_CAP_PER_YEAR, year: 2028, pace: { perYear: 2.4 } },
    } as unknown as Parameters<typeof fitReportHeadline>[0];
    expect(fitReportHeadline(fake, "player")).toBe(
      "Today, 0 programs are in range. If you gain about 1.50 UTR a year (our assumption), that could be 3 by summer 2028."
    );
  });

  it("only today's sentence when nothing is projected, the pace is flat, or the projection is 0 too", () => {
    const summerBegun = build(9.4, 2027); // June 1 2026 has passed
    expect(summerBegun.utr.isProjected).toBe(false);
    expect(fitReportHeadline(summerBegun, "player")).toBe("Today, 1 program is in range.");
    const base = { todayInRange: 0, recruitingInRange: 0, utr: { isProjected: true, planningPacePerYear: 1, year: 2028 } as RecruitingTimeUtr };
    expect(fitReportHeadline(base, "player")).toBe("Today, 0 programs are in range.");
    const falling = { ...base, recruitingInRange: 2, utr: { ...base.utr, planningPacePerYear: -0.2 } };
    expect(fitReportHeadline(falling, "player")).toBe("Today, 0 programs are in range.");
  });
});

describe("teamLineRelation — no signed gaps (A-007)", () => {
  it("positive gap (line − rating) means the player is BELOW the line", () => {
    expect(teamLineRelation(0.3, "average")).toBe("0.3 below the team average");
    expect(teamLineRelation(-0.3, "average")).toBe("0.3 above the team average");
    expect(teamLineRelation(1.24, "floor")).toBe("1.2 below the team floor");
  });

  it("equal at the printed precision reads 'at'", () => {
    expect(teamLineRelation(0, "average")).toBe("at the team average");
    expect(teamLineRelation(0.04, "average")).toBe("at the team average");
    expect(teamLineRelation(-0.04, "floor")).toBe("at the team floor");
  });

  it("agrees with the range bar's sign: average 10.0, player 9.7 → below", () => {
    const median = 10.0;
    const you = 9.7;
    expect(teamLineRelation(median - you, "average")).toBe("0.3 below the team average");
  });
});

describe("the planning rule replaces the growth claim (A-008)", () => {
  it("states the cap the bands actually use", () => {
    expect(PLANNING_RULE_SENTENCE).toBe(
      `We plan with at most ${PLANNING_PACE_CAP_PER_YEAR} UTR a year. That's our planning rule, not a measured average.`
    );
  });

  it("the upside sentence keeps the cap statement", () => {
    const s = paceUpsideSentence({ value: 8.1, upside: { value: 8.9, perYear: 2 } } as never);
    expect(s).toBe(`At your current pace you'd reach 8.90. We plan with 8.10 instead. ${PLANNING_RULE_SENTENCE}`);
    expect(s).not.toMatch(/most players/i);
  });
});
