import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PACE_STRETCH_NOTE,
  PLANNING_PACE_CAP_PER_YEAR,
  PLANNING_RULE_SENTENCE,
  buildFitReport,
  paceUpsideSentence,
  type BandCounts,
  type RecruitingTimeUtr,
} from "./fit";
import {
  UTR_RANGE_NOTE,
  closestProgramAbove,
  fitReportHeadline,
  formatUtrDistance,
  headlinePaceSource,
  heroFitCta,
  inRangeButtonLabel,
  nothingInRangeSentence,
  teamLineRelation,
} from "./fit-copy";
import { PACE_STRETCH_PHRASE, bandPositionLabel, explainSchoolFit, paceIsStretch } from "./school-fit";
import { DEFAULT_GROWTH_LABEL, growthAssumptionLabel } from "./config/growth";
import { realisticPaceProjectionFor } from "./what-if-utr";
import { getSchoolsLite } from "./db/schools";
import { codeOnly, readableSource } from "./testing/source-text";
import type { SchoolLite } from "./types";

// The honest zero state (owner's audit, 2026-11-21): A-001, A-002, A-006,
// A-007, A-008, A-022, plus the independent verifier's follow-ups the same
// day. The copy builders live in lib/fit-copy.ts as pure functions so this
// file reads exactly what a screen prints.

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

  it("names the gender when the list is one gender's programs", () => {
    expect(
      nothingInRangeSentence({ programCount: 31, programLabel: "women's", utr: 5, closest: { slug: "m", name: "Middlebury", gap: 3.1 } })
    ).toBe("None of our 31 women's programs are in range at 5.00 yet. Closest: Middlebury, about +3.1 away (estimate).");
    expect(nothingInRangeSentence({ programCount: 37, programLabel: "men's", utr: 5, closest: null })).toBe(
      "None of our 37 men's programs are in range at 5.00 yet."
    );
  });

  it("a small gap keeps two decimals — never '+0.0'", () => {
    expect(nothingInRangeSentence({ programCount: 24, utr: 9.97, closest: { slug: "f", name: "Florida", gap: 0.03 } })).toBe(
      "None of our 24 programs are in range at 9.97 yet. Closest: Florida, about +0.03 away (estimate)."
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
          for (const utr of [9.4, 0, null, 25]) {
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
      projectedNote: null,
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
    expect(heroFitCta({ counts: counts(0, 0, 0, 2), utr: 9.4, schools: catalog, programLabel: "women's" })).toEqual({
      kind: "zero",
      showCounts: false,
      sentence: "None of our 2 women's programs are in range at 9.40 yet. Closest: Florida, about +0.8 away (estimate).",
      link: { label: "See all programs", href: "/schools" },
      projectedNote: null,
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
        projectedNote: null,
      });
    }
    expect(heroFitCta({ counts: null, utr: 9.4, schools: catalog }).kind).toBe("no-utr");
  });

  it("a number that is not a UTR (above 16.5, below 1) says what a UTR is, not 'Add a UTR'", () => {
    for (const utr of [25, 16.51, 0.5]) {
      const cta = heroFitCta({ counts: counts(0, 3, 5), utr, schools: catalog });
      expect(cta).toMatchObject({ kind: "no-utr", showCounts: false, note: UTR_RANGE_NOTE });
    }
    expect(UTR_RANGE_NOTE).toBe("UTRs run from 1.00 to 16.50. Enter one in that range to see your counts.");
    expect(heroFitCta({ counts: counts(0, 3, 5), utr: 16.5, schools: catalog }).kind).toBe("button");
  });

  it("today's count on the button; the summer estimate is a separate, labelled line only when higher", () => {
    expect(
      heroFitCta({ counts: counts(1, 2, 0), projected: { inRange: 8, year: 2028 }, utr: 9.4, schools: catalog })
    ).toMatchObject({ label: "See my 2 Target and Likely schools", projectedNote: "By summer 2028, est.: 8 Target and Likely." });
    expect(heroFitCta({ counts: counts(1, 2, 0), projected: { inRange: 2, year: 2028 }, utr: 9.4, schools: catalog }).projectedNote).toBeNull();
    const zero = heroFitCta({ counts: counts(3, 0, 0), projected: { inRange: 8, year: 2028 }, utr: 7.5, schools: catalog });
    expect(zero.kind).toBe("zero");
    expect(zero.projectedNote).toBe("By summer 2028, est.: 8 Target and Likely.");
  });

  it("the verifier's case: a 7.5 Class of 2029 player is not told 'See my 8' while today 0 are in range", async () => {
    const NOW = new Date(2026, 10, 21, 12);
    const women = (await getSchoolsLite()).filter((s) => s.gender === "women");
    for (const utr of [7.5, 8, 9.4]) {
      const projectionInput = realisticPaceProjectionFor({ currentUTR: utr, graduationYear: 2029, gender: "female", now: NOW });
      const report = buildFitReport({ currentUtr: utr, graduationYear: 2029, gender: "female", schools: women, projectionInput, now: NOW })!;
      const cta = heroFitCta({
        counts: report.todayCounts,
        projected: { inRange: report.recruitingInRange, year: report.utr.year },
        utr,
        schools: women,
        programLabel: "women's",
      });
      if (report.todayInRange === 0) expect(cta.kind).toBe("zero");
      else expect(cta).toMatchObject({ kind: "button", label: inRangeButtonLabel(report.todayInRange) });
      if (report.recruitingInRange > report.todayInRange) {
        expect(cta.projectedNote).toBe(`By summer ${report.utr.year}, est.: ${report.recruitingInRange} Target and Likely.`);
      }
    }
  });
});

describe("the screens render through these functions", () => {
  it("the homepage card: TODAY's counts through heroFitCta, no hand-built count text", () => {
    const f = "components/seeded/home/seeded-home-view.tsx";
    const src = codeOnly(f);
    expect(src).toMatch(/heroFitCta\(\{\s*counts: report\?\.todayCounts,/);
    expect(src).toMatch(/inRange: report\.recruitingInRange, year: report\.utr\.year/);
    expect(src).toMatch(/const counts = report\?\.todayCounts;/);
    expect(src).toMatch(/\{cta\.projectedNote\}/);
    expect(src).toMatch(/cta\.showCounts && counts \?/);
    expect(src).toMatch(/\{heroButtonLabel\(cta\.label, touched\)\}/);
    expect(src).toMatch(/currentUtr: isUsableUtr\(utrNum\) \? utrNum : null/);
    expect(src).not.toMatch(/See my \{/);
    // The tiles are only reachable behind cta.showCounts.
    const tiles = src.indexOf("<CountTile value={counts.reach}");
    expect(src.lastIndexOf("cta.showCounts", tiles)).toBeGreaterThan(-1);
  });

  it("the fit report: headline from fitReportHeadline, zero state from nothingInRangeSentence", () => {
    const src = codeOnly("components/seeded/onboarding/seeded-pre-auth-onboarding.tsx");
    const headline = src.slice(src.indexOf("<h1"), src.indexOf("</h1>"));
    // final-check A4: the lead is fitReportHeadline, or — when nothing is in
    // range today or by the summer — the homepage's zero sentence.
    expect(headline).toMatch(/\blead\b/);
    expect(src).toMatch(/fitReportLead\(report, parent \? "parent" : "player", zeroInput\)/);
    expect(src).toMatch(/nothingInRangeSentence\(\{/);
    expect(src).toMatch(/closestProgramAbove\(today, filtered\)/);
    expect(src).toMatch(/programCount: filtered\.length/);
    expect(src).toMatch(/programLabel: GENDER_LABEL\[gender\]\.toLowerCase\(\)/);
  });

  it("the home subhead and meta description say what the range is and give a counted N", () => {
    // Since the spreadsheet sync (2026-11-22) a range is a hand-checked roster
    // for some teams and our estimate for the rest; the copy must say both.
    const home = readableSource("components/seeded/home/seeded-home-view.tsx");
    expect(home).toMatch(/compares your UTR with the range for \{teamCount\} college\s+teams \(a hand-checked roster where we have one, our estimate where we don.t\)/);
    expect(home).toMatch(/the range for \{schools\.length\} college teams . a hand-checked roster where we\s+have one, our estimate where we don.t/);
    expect(home).toMatch(/Takes about 90 seconds\./);
    const page = readFileSync("app/page.tsx", "utf8");
    expect(page).toMatch(/getCatalogCounts\(\)/);
    expect(page).toContain("compares your UTR with the range for ${total} college teams (a hand-checked roster where we have one, our estimate elsewhere)");
    expect(page).not.toMatch(/compares you to real programs/);
  });
});

describe("fitReportHeadline — today first (A-006), and says where the pace came from", () => {
  // Fixed date: Class of 2029's summer before senior year is June 1 2028.
  const NOW = new Date(2026, 10, 21, 12);
  const YEAR_AGO = new Date(2025, 10, 21, 12);
  const catalog = [
    school("in-today", 8.5, 9.0), // Likely today
    school("by-summer", 10.0, 11.5), // below the floor today, Target at the projection
    school("never", 13.0, 14.0), // out of reach
  ];
  const build = (currentUtr: number, graduationYear = 2029, yearAgoUtr?: number) =>
    buildFitReport({
      currentUtr,
      graduationYear,
      gender: "female",
      schools: catalog,
      now: NOW,
      projectionInput: yearAgoUtr
        ? { utrHistory: [{ date: YEAR_AGO, utr: yearAgoUtr }], graduationYear, gender: "female", now: NOW }
        : undefined,
    })!;

  it("no logged pace: '(our default assumption)'", () => {
    const report = build(9.4);
    expect(report.utr.source).toBe("typical-growth");
    expect(report.todayInRange).toBe(1);
    expect(report.recruitingInRange).toBe(2);
    expect(report.utr.planningPacePerYear).toBe(1);
    expect(fitReportHeadline(report, "player")).toBe(
      "Today, 1 program is in range. If you gain about 1.00 UTR a year (our default assumption), that could be 2 by summer 2028."
    );
    expect(fitReportHeadline(report, "parent")).toBe(
      "Today, 1 program is in range. If your player gains about 1.00 UTR a year (our default assumption), that could be 2 by summer 2028."
    );
  });

  it("their own logged pace under the cap: '(your pace so far)'", () => {
    const report = build(9.4, 2029, 8.2); // +1.20 a year
    expect(report.utr.source).toBe("logged-pace");
    expect(report.utr.planningPacePerYear).toBeCloseTo(1.2, 10);
    expect(headlinePaceSource(report.utr, "player")).toBe("your pace so far");
    expect(fitReportHeadline(report, "player")).toBe(
      `Today, 1 program is in range. If you gain about 1.20 UTR a year (your pace so far), that could be ${report.recruitingInRange} by summer 2028.`
    );
  });

  it("a parent reads the PLAYER's pace, never 'your pace so far' (round-2 verifier)", () => {
    const report = build(9.4, 2029, 8.2);
    expect(headlinePaceSource(report.utr, "parent")).toBe("your player's pace so far");
    expect(fitReportHeadline(report, "parent")).toBe(
      `Today, 1 program is in range. If your player gains about 1.20 UTR a year (your player's pace so far), that could be ${report.recruitingInRange} by summer 2028.`
    );
    expect(fitReportHeadline(report, "parent")).not.toMatch(/\(your pace so far\)/);
    // The cap and the default are Seeded's, whoever reads them.
    expect(headlinePaceSource(build(9.4, 2029, 7.0).utr, "parent")).toBe("our planning limit");
    expect(headlinePaceSource(build(9.4).utr, "parent")).toBe("our default assumption");
  });

  it("their own pace above the cap, planned at 1.5: '(our planning limit)'", () => {
    const report = build(9.4, 2029, 7.0); // +2.40 a year, planned at 1.5
    expect(report.utr.planningPacePerYear).toBe(PLANNING_PACE_CAP_PER_YEAR);
    expect(headlinePaceSource(report.utr, "player")).toBe("our planning limit");
    expect(fitReportHeadline(report, "player")).toBe(
      `Today, 1 program is in range. If you gain about 1.50 UTR a year (our planning limit), that could be ${report.recruitingInRange} by summer 2028.`
    );
  });

  it("never says '(our assumption)' about a measured pace", () => {
    for (const r of [build(9.4), build(9.4, 2029, 8.2), build(9.4, 2029, 7.0)]) {
      expect(fitReportHeadline(r, "player")).not.toMatch(/\(our assumption\)/);
    }
  });

  it("only today's sentence when nothing is projected, the pace is flat, or the projection is 0 too", () => {
    const summerBegun = build(9.4, 2027); // June 1 2026 has passed
    expect(summerBegun.utr.isProjected).toBe(false);
    expect(fitReportHeadline(summerBegun, "player")).toBe("Today, 1 program is in range.");
    const base = { todayInRange: 0, recruitingInRange: 0, utr: { isProjected: true, planningPacePerYear: 1, year: 2028, source: "typical-growth" } as RecruitingTimeUtr };
    expect(fitReportHeadline(base, "player")).toBe("Today, no program is in range.");
    const falling = { ...base, recruitingInRange: 2, utr: { ...base.utr, planningPacePerYear: -0.2 } };
    expect(fitReportHeadline(falling, "player")).toBe("Today, no program is in range.");
  });
});

describe("teamLineRelation — no signed gaps, and never 'at' when the chip says otherwise (A-007)", () => {
  it("takes (rating, line): below / above / at", () => {
    expect(teamLineRelation(9.7, 10.0, "average")).toBe("0.3 below the team average");
    expect(teamLineRelation(10.3, 10.0, "average")).toBe("0.3 above the team average");
    expect(teamLineRelation(6.86, 8.1, "floor")).toBe("1.2 below the team floor");
    expect(teamLineRelation(10, 10, "average")).toBe("at the team average");
  });

  it("the verifier's cases: 8.06 vs a floor of 8.1 and 9.96 vs an average of 10.0 are below, to two decimals", () => {
    expect(teamLineRelation(8.06, 8.1, "floor")).toBe("0.04 below the team floor");
    expect(teamLineRelation(9.96, 10.0, "average")).toBe("0.04 below the team average");
    expect(teamLineRelation(8.14, 8.1, "floor")).toBe("0.04 above the team floor");
    expect(formatUtrDistance(0.004)).toBe("less than 0.01");
    expect(formatUtrDistance(0.094)).toBe("0.09");
    expect(formatUtrDistance(0.15)).toBe("0.1");
  });

  it("a drawn average with floating-point noise ((min + max) / 2) is still 'at'", () => {
    const min = 8.1;
    const max = 10.0 + (10.0 - 8.1);
    expect(teamLineRelation(10.0, (min + max) / 2, "average")).toBe("at the team average");
  });

  it("agrees with the band chip by construction, across every rating 7.90–10.20", () => {
    // One school: floor 8.1, average 10.0. Class of 2027: the summer has
    // begun, so the band is judged at today's rating, as the chip is.
    const s = school("one", 8.1, 10.0);
    for (let i = 790; i <= 1020; i++) {
      const utr = i / 100;
      const report = buildFitReport({ currentUtr: utr, graduationYear: 2027, gender: "female", schools: [s], now: new Date(2026, 10, 21, 12) })!;
      const band = report.bandBySlug.get("one")!;
      const chip = bandPositionLabel(band);
      const floorText = teamLineRelation(utr, s.minCompetitiveUTR, "floor");
      const avgText = teamLineRelation(utr, s.avgRosterUTR, "average");
      if (chip === "Below the floor") expect(floorText, `${utr}`).toMatch(/below the team floor$/);
      else expect(floorText, `${utr}`).not.toMatch(/below/);
      if (chip === "At or above team average") expect(avgText, `${utr}`).not.toMatch(/below/);
      else expect(avgText, `${utr}`).toMatch(/below the team average$/);
      expect(`${floorText} ${avgText}`).not.toMatch(/\b0\.00?\b/);
    }
  });

  it("every call site passes (rating, line) — the side is decided in one place", () => {
    // Each allowed call, exactly. A swapped pair or a hand-computed gap is a
    // different string and fails here (verifier: flipping the old signed
    // argument at range-bar.tsx / seeded-school-detail.tsx left every test
    // green).
    const ALLOWED: Record<string, string[]> = {
      // Verifier M1: the tooltip line is lib/fit-copy.ts rangeBarYouLine now.
      "components/seeded/ui/range-bar.tsx": [],
      // final-check A2: these three now print every gap through
      // teamGapSentence (lib/fit-copy.ts), which names the rating's basis
      // ("today" / "by summer 2027, estimate") — no bare call is left.
      "components/seeded/schools/seeded-school-detail.tsx": [],
      "components/seeded/schools/seeded-schools-browser.tsx": [],
      "components/seeded/roadmap/target-schools-list.tsx": [],
      // "middle" for a checked roster's median (the spreadsheet sync, 2026-11-22).
      "components/seeded/roadmap/closest-schools.tsx": ['teamLineRelation(judging.utr, school.avgRosterUTR, school.utrRange ? "middle" : "average")'],
      "lib/fit-copy.ts": [
        'teamLineRelation(rating: number, line: number, which: "average" | "floor" | "middle")',
        'teamLineRelation(value, school.minCompetitiveUTR, "floor")',
        'teamLineRelation(value, school.avgRosterUTR, school.utrRange ? "middle" : "average")',
        'teamLineRelation(input.you, input.median, input.checked ? "middle" : "average")',
      ],
    };
    for (const [file, calls] of Object.entries(ALLOWED)) {
      const found = codeOnly(file).match(/teamLineRelation\([^)]*\)/g) ?? [];
      expect(found.sort(), file).toEqual([...calls].sort());
    }
  });
});

describe("the planning rule replaces the growth claim (A-008)", () => {
  it("states the cap the bands actually use", () => {
    expect(PLANNING_RULE_SENTENCE).toBe(
      `We plan with at most ${PLANNING_PACE_CAP_PER_YEAR} UTR a year. That's our planning rule, not a measured average.`
    );
  });

  it("the upside sentence: one 'but we plan with' clause, then the required sentence", () => {
    const s = paceUpsideSentence({ value: 8.1, upside: { value: 8.9, perYear: 2 } } as never);
    expect(s).toBe(
      "At your current pace you'd reach 8.90, but we plan with 8.10. We plan with at most 1.5 UTR a year. That's our planning rule, not a measured average."
    );
    expect(s).not.toMatch(/most players|instead: we plan/i);
    // The required sentence appears whole, exactly once.
    expect(s!.split(PLANNING_RULE_SENTENCE).length - 1).toBe(1);
    expect(paceUpsideSentence({ value: 8.1, upside: { value: 8.9, perYear: 2 } } as never, "Avery")).toBe(
      `At Avery's current pace Avery would reach 8.90, but we plan with 8.10. ${PLANNING_RULE_SENTENCE}`
    );
  });

  it("the default growth assumption is ours, not 'typical'", () => {
    expect(DEFAULT_GROWTH_LABEL).toBe("1.0 UTR a year");
    expect(growthAssumptionLabel("normal")).toBe("Uses our default assumption of 1.0 UTR a year.");
  });

  it("the next-band line and the goal banner say 'a stretch' for the same 1.45–1.55 band", () => {
    expect(PACE_STRETCH_NOTE).toBe(`That's ${PACE_STRETCH_PHRASE}.`);
    for (const [r, stretch] of [[1.44, false], [1.45, true], [1.5, true], [1.55, true], [1.56, false]] as const) {
      expect(paceIsStretch(r), String(r)).toBe(stretch);
    }
    // 1.52 a year: floor 10.0, player 8.48, one year (June 2025 → June 2026).
    const ex = explainSchoolFit(8.48, school("s", 10.0, 11.0), { graduationYear: 2027, now: new Date(2025, 5, 1, 12) });
    expect(ex.nextBand!.requiredPaceUtrPerYear).toBe(1.52);
    expect(ex.nextBand!.message).toContain(`That needs about 1.52 a year, ${PACE_STRETCH_PHRASE}. ${PLANNING_RULE_SENTENCE}`);
    expect(ex.nextBand!.message).not.toMatch(/more than our planning limit/);
    // …and the same card does not also call it out of reach (round-2
    // verifier): no "won't realistically close", no "Consider instead".
    expect(ex.unreachable).toBe(false);
    expect(ex.alternatives).toEqual([]);
    // Just past the band (1.56) it is out of reach again.
    const past = explainSchoolFit(8.44, school("s", 10.0, 11.0), { graduationYear: 2027, now: new Date(2025, 5, 1, 12) });
    expect(past.nextBand!.requiredPaceUtrPerYear).toBe(1.56);
    expect(past.unreachable).toBe(true);
    expect(past.nextBand!.message).toContain("more than our planning limit");
  });
});
