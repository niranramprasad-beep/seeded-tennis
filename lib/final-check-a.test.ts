import { describe, expect, it } from "vitest";
import { codeOnly } from "./testing/source-text";
import {
  basisOfReportUtr,
  defaultFitTab,
  emptyBandSentence,
  fitReportHeadline,
  fitReportLead,
  nothingInRangeSentence,
  ratingBasisLabel,
  ratingWithBasis,
  teamGapSentence,
  whatIfBasis,
  type RatingBasis,
} from "./fit-copy";
import { CHART_LINE_NAMES, chartLegendSentence } from "./chart-legend";
import { explainSchoolFit } from "./school-fit";
import type { RecruitingTimeUtr } from "./fit";
import type { SchoolLite } from "./types";

// final-check (2026-11-21), PR A: A1 (a what-if printed as "today"), A2 (one
// school, two gaps, neither labelled), A3 (two chart legends, two meanings
// for "dashes") and A4 (the fit report's wall of zeros). Pure functions first;
// the last block pins the screens to them.

function school(slug: string, floor: number, avg: number): SchoolLite {
  return {
    id: slug,
    slug,
    name: slug,
    shortName: slug,
    city: "",
    state: "CA",
    conference: "",
    division: "D1",
    gender: "men",
    primaryColor: "",
    secondaryColor: "",
    textColor: "",
    avgRosterUTR: avg,
    minCompetitiveUTR: floor,
    usNewsRanking: 1,
  };
}

const NOW = new Date(2026, 10, 21, 12);
const today: RatingBasis = { kind: "today" };
const estimate: RatingBasis = { kind: "estimate", year: 2027 };

describe("A2: every rating beside a team line says which rating it is", () => {
  it("labels: today / by summer {year}, estimate / what-if with its own pace", () => {
    expect(ratingBasisLabel(today)).toBe("today");
    expect(ratingBasisLabel(estimate)).toBe("by summer 2027, estimate");
    expect(ratingBasisLabel({ kind: "what-if", year: 2027, pace: "plus1.5", pacePerYear: 1.5 })).toBe(
      "by summer 2027, what-if at +1.50 a year"
    );
    expect(ratingBasisLabel({ kind: "what-if", year: 2027, pace: "mine" })).toBe("by summer 2027, what-if at your pace");
    expect(ratingBasisLabel({ kind: "what-if", year: 2027, pace: "custom" })).toBe("by summer 2027, what-if");
    expect(ratingBasisLabel({ kind: "what-if", year: null, pace: "custom" })).toBe("now, what-if");
  });

  it("the year is the projection's own, never a hardcoded one", () => {
    const utr = { isProjected: true, year: 2029 } as Pick<RecruitingTimeUtr, "isProjected" | "year">;
    expect(ratingBasisLabel(basisOfReportUtr(utr))).toBe("by summer 2029, estimate");
    expect(basisOfReportUtr({ isProjected: false, year: 2029 })).toEqual({ kind: "today" });
  });

  it("the finding's example: Plan and the school page print the same gap, each labelled", () => {
    const s = school("x", 9.5, 10.5);
    // Plan used today's 8.20 unlabelled; the school page the 8.7 estimate.
    expect(teamGapSentence(8.2, today, s, { lines: ["average"] })).toBe("You 8.20 today: 2.3 below the team average");
    expect(teamGapSentence(8.7, estimate, s, { lines: ["average"] })).toBe(
      "You 8.7 by summer 2027, estimate: 1.8 below the team average"
    );
    expect(teamGapSentence(8.7, estimate, s, { who: "Bailey" })).toBe(
      "Bailey 8.7 by summer 2027, estimate: 0.8 below the team floor · 1.8 below the team average"
    );
  });

  it("no rating, no sentence — never a gap from the 0 sentinel", () => {
    expect(teamGapSentence(0, today, school("x", 9, 10))).toBeNull();
    expect(teamGapSentence(null, estimate, school("x", 9, 10))).toBeNull();
    expect(ratingWithBasis(0, today)).toBeNull();
  });

  it("whatIfBasis: null while the slider is untouched; the summer before senior year otherwise", () => {
    expect(whatIfBasis({ isAtRealCurrent: true, activePaceMode: null }, 2028, NOW)).toBeNull();
    expect(whatIfBasis({ isAtRealCurrent: false, activePaceMode: "plus1.5" }, 2028, NOW)).toEqual({
      kind: "what-if",
      year: 2027,
      pace: "plus1.5",
      pacePerYear: 1.5,
    });
    // Class of 2027: the summer before senior year (June 2026) has begun.
    expect(whatIfBasis({ isAtRealCurrent: false, activePaceMode: "custom" }, 2027, NOW)).toEqual({ kind: "what-if", year: null, pace: "custom", pacePerYear: null });
  });
});

describe("A1: 'today' is only ever the real rating", () => {
  it("explainSchoolFit's summary prints the rating it is given as today — so callers must give it today's", () => {
    const s = school("x", 9.4, 10.2);
    const e = explainSchoolFit(8.2, s, { graduationYear: 2028, now: NOW, band: "target" });
    expect(e.summary).toContain("You're 8.20 today");
  });

  it("no 'needs about -0.30 a year' when today's rating is already past the next band's line", () => {
    // Band judged on a lower what-if (Reach) while today's 9.6 is above the floor.
    const e = explainSchoolFit(9.6, school("x", 9.4, 10.2), { graduationYear: 2028, now: NOW, band: "reach" });
    expect(e.nextBand).toBeNull();
  });

  it("the Schools browser passes today's rating, never the slider's, to explainSchoolFit", () => {
    const src = codeOnly("components/seeded/schools/seeded-schools-browser.tsx");
    expect(src).toMatch(/explainSchoolFit\(todayUtr, s,/);
    expect(src).not.toMatch(/explainSchoolFit\(effectiveUtr/);
    expect(src).toMatch(/const todayUtr: number \| null = whatIf\.todayUtr;/);
    expect(src).toMatch(/whatIfBasis\(whatIf, player\.graduationYear\)/);
    const plan = codeOnly("components/seeded/roadmap/target-schools-list.tsx");
    expect(plan).toMatch(/explainSchoolFit\(todayUtr, s,/);
    expect(codeOnly("lib/hooks/use-what-if-utr.ts")).toMatch(/todayUtr: hasRealUtr\(currentUTR\) \? currentUTR : null/);
  });

  it("every screen that prints a gap goes through the labelled helper", () => {
    for (const file of [
      "components/seeded/schools/seeded-schools-browser.tsx",
      "components/seeded/schools/seeded-school-detail.tsx",
      "components/seeded/roadmap/target-schools-list.tsx",
    ]) {
      const src = codeOnly(file);
      expect(src, file).toMatch(/teamGapSentence\(/);
      expect(src, file).not.toMatch(/teamLineRelation\(/);
      expect(src, file).not.toMatch(/projectedYouLabel\(/);
    }
  });
});

describe("A3: one chart vocabulary", () => {
  it("names each line once", () => {
    expect(CHART_LINE_NAMES).toEqual({
      logged: "Logged",
      estimate: "Planning estimate",
      plan: "Your plan",
      upside: "Estimate at your own pace",
    });
  });

  it("the legend lists only what is drawn, in those words", () => {
    expect(chartLegendSentence({ estimate: true, estimateEnd: "8.7", plan: "line", upside: true })).toBe(
      "Solid: Logged, the UTRs you entered. Dotted: Planning estimate, what your bands use (8.7 by the summer before senior year). Dashed, with gold diamonds: Your plan, the checkpoints to your goal. Grey dashes: Estimate at your own pace, never used for bands."
    );
    expect(chartLegendSentence({ estimate: true, plan: "next-checkpoint", upside: false })).toBe(
      "Solid: Logged, the UTRs you entered. Dotted: Planning estimate, what your bands use. Gold line: Your plan, its next checkpoint."
    );
    expect(chartLegendSentence({ estimate: false, plan: null, upside: false })).toBe("Solid: Logged, the UTRs you entered.");
  });

  it("both charts use it, and both draw the estimate dotted", () => {
    expect(codeOnly("components/seeded/roadmap/plan-trajectory-chart.tsx")).toMatch(/chartLegendSentence\(\{/);
    expect(codeOnly("components/seeded/dashboard/seeded-dashboard-layout.tsx")).toMatch(/chartLegendSentence\(\{/);
    for (const file of ["components/seeded/roadmap/plan-trajectory-chart.tsx", "components/seeded/dashboard/utr-vs-plan-chart.tsx"]) {
      expect(codeOnly(file), file).toMatch(/points=\{(paths\.estimate|estimateLine)\}[^>]*strokeDasharray="0\.5 6"/);
    }
    for (const file of ["components/seeded/roadmap/plan-trajectory-chart.tsx", "components/seeded/dashboard/seeded-dashboard-layout.tsx"]) {
      expect(codeOnly(file), file).not.toMatch(/Green dashes|Dashed: your plan|Dotted: your estimate/);
    }
  });
});

describe("A4: the fit report's zero state", () => {
  const zero = {
    programCount: 37,
    programLabel: "men's",
    utr: 5,
    closest: { slug: "m", name: "Middlebury", gap: 3.1 },
  };
  const utr = { isProjected: true, planningPacePerYear: 1, year: 2027, source: "typical-growth" } as RecruitingTimeUtr;

  it("leads with the homepage's zero sentence (closest program, gap, estimate) when nothing is in range now or by the summer", () => {
    const lead = fitReportLead({ todayInRange: 0, recruitingInRange: 0, utr }, "player", zero);
    expect(lead).toBe(nothingInRangeSentence(zero));
    expect(lead).toBe("None of our 37 men's programs are in range at 5.00 yet. Closest: Middlebury, about +3.1 away (estimate).");
    expect(lead).not.toMatch(/\b0 programs\b/);
  });

  it("keeps the dated headline when the summer projection has programs in range — without '0 programs'", () => {
    const lead = fitReportLead({ todayInRange: 0, recruitingInRange: 3, utr }, "player", zero);
    expect(lead).toBe(fitReportHeadline({ todayInRange: 0, recruitingInRange: 3, utr }, "player"));
    expect(lead).toMatch(/^Today, no program is in range\. If you gain about 1\.00 UTR a year/);
  });

  it("opens on the first non-empty band, Out of range when that is all there is", () => {
    expect(defaultFitTab({ reach: 0, target: 0, likely: 0, outOfRange: 37 })).toBe("out-of-range");
    expect(defaultFitTab({ reach: 4, target: 0, likely: 0, outOfRange: 33 })).toBe("reach");
    expect(defaultFitTab({ reach: 4, target: 2, likely: 1, outOfRange: 30 })).toBe("target");
    expect(defaultFitTab({ reach: 0, target: 0, likely: 2, outOfRange: 30 })).toBe("likely");
  });

  it("an empty band says what the band means, in words, not '0 programs'", () => {
    for (const band of ["reach", "target", "likely", "out-of-range"] as const) {
      expect(emptyBandSentence(band)).toMatch(/^No program/);
      expect(emptyBandSentence(band)).not.toMatch(/\b0\b/);
    }
  });

  it("the report renders through these, and drops the zero-count lines", () => {
    const src = codeOnly("components/seeded/onboarding/seeded-pre-auth-onboarding.tsx");
    expect(src).toMatch(/pickedTab \?\? defaultFitTab\(counts\)/);
    expect(src).toMatch(/emptyBandSentence\(tab\)/);
    expect(src).toMatch(/\{report && counts\.target \+ counts\.likely > 0 && \(/);
    expect(src).toMatch(/report\.todayInRange \+ report\.recruitingInRange > 0 &&/);
    expect(src).not.toMatch(/useState<FitBand>\("target"\)/);
  });
});
