import { describe, expect, it } from "vitest";
import { codeOnly } from "./testing/source-text";
import {
  closestSchoolsMeasuredFrom,
  judgingRatingFor,
  rangeBarYouLine,
  rangeCaption,
  schoolPageUtrRow,
  targetRowGapSentence,
  todayRatingFor,
  whyBandGapLines,
  basisOfReportUtr,
  defaultFitTab,
  emptyBandSentence,
  fitReportHeadline,
  fitReportLead,
  nothingInRangeSentence,
  ratingBasisLabel,
  ratingWithBasis,
  teamGapSentence,
  type RatingBasis,
} from "./fit-copy";
import { CHART_LINE_NAMES, chartLegendItems } from "./chart-legend";
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
  it("labels: today / by summer {year}, estimate / by summer {year}, your plan", () => {
    expect(ratingBasisLabel(today)).toBe("today");
    expect(ratingBasisLabel(estimate)).toBe("by summer 2027, estimate");
    expect(ratingBasisLabel({ kind: "plan", year: 2027 })).toBe("by summer 2027, your plan");
  });

  it("the year is the report's own, never a hardcoded one", () => {
    const utr = { isProjected: true, year: 2029, source: "logged-pace" } as Pick<RecruitingTimeUtr, "isProjected" | "year" | "source">;
    expect(ratingBasisLabel(basisOfReportUtr(utr))).toBe("by summer 2029, estimate");
    expect(basisOfReportUtr({ isProjected: false, year: 2029, source: "current" })).toEqual({ kind: "today" });
    // A report judged on the Plan UTR says so itself (2026-11-27).
    expect(basisOfReportUtr({ isProjected: false, year: 2029, source: "plan" })).toEqual({ kind: "plan", year: 2029 });
  });

  it("the finding's example: Plan and the school page print the same gap, each labelled", () => {
    const s = school("x", 9.5, 10.5);
    // Plan used today's 8.20 unlabelled; the school page the 8.7 estimate.
    expect(teamGapSentence(8.2, today, s, { lines: ["average"] })).toBe("You 8.20 today: below the team average (10.xx)");
    expect(teamGapSentence(8.7, estimate, s, { lines: ["average"] })).toBe(
      "You 8.7 by summer 2027, estimate: below the team average (10.xx)"
    );
    expect(teamGapSentence(8.7, estimate, s, { who: "Bailey" })).toBe(
      "Bailey 8.7 by summer 2027, estimate: below the team floor (9.xx) · below the team average (10.xx)"
    );
  });

  it("no rating, no sentence — never a gap from the 0 sentinel", () => {
    expect(teamGapSentence(0, today, school("x", 9, 10))).toBeNull();
    expect(teamGapSentence(null, estimate, school("x", 9, 10))).toBeNull();
    expect(ratingWithBasis(0, today)).toBeNull();
  });

});

describe("A1: 'today' is only ever the real rating", () => {
  it("explainSchoolFit's summary prints the rating it is given as today — so callers must give it today's", () => {
    const s = school("x", 9.4, 10.2);
    const e = explainSchoolFit(8.2, s, { graduationYear: 2028, now: NOW, band: "target" });
    expect(e.summary).toContain("You're 8.20 today");
  });

  it("no 'needs about -0.30 a year' when today's rating is already past the next band's line", () => {
    // Tier judged on a lower rating (Reach) while today's 9.6 is above the floor.
    const e = explainSchoolFit(9.6, school("x", 9.4, 10.2), { graduationYear: 2028, now: NOW, band: "reach" });
    expect(e.nextBand).toBeNull();
  });

  it("each screen asks the pure helpers, with exactly these arguments (verifier M1)", () => {
    // The logic lives in lib/fit-copy.ts and is tested below; what a screen
    // may still get wrong is WHICH values it hands over. Each call is pinned.
    const browser = codeOnly("components/seeded/schools/seeded-schools-browser.tsx");
    expect(browser).toMatch(/explainSchoolFit\(todayUtr, s,/);
    expect(browser).not.toMatch(/explainSchoolFit\(effectiveUtr/);
    expect(browser).toMatch(/const todayUtr: number \| null = todayRatingFor\(effectiveUtr\);/);
    expect(browser).toMatch(/const judging = judgingRatingFor\(\{ report \}\);/);
    expect(browser).toMatch(/whyBandGapLines\(judging, todayUtr, s, judgingWho\)/);
    expect(browser).toMatch(/rangeCaption\(judging, judgingWho, range\)/);
    expect(browser).toMatch(/youBasis=\{judging \? ratingBasisLabel\(judging\.basis\) : null\}/);

    const layout = codeOnly("components/seeded/roadmap/seeded-roadmap-layout.tsx");
    expect(layout).toMatch(/const judging = judgingRatingFor\(\{ report: fitReport \}\);/);
    expect(layout.match(/judging=\{judging\}/g)).toHaveLength(2);
    expect(layout).toMatch(/todayUtr=\{hasRealUtr\(player\.currentUTR\) \? player\.currentUTR : null\}/);

    const targets = codeOnly("components/seeded/roadmap/target-schools-list.tsx");
    expect(targets).toMatch(/explainSchoolFit\(todayUtr, s,/);
    expect(targets).toMatch(/const gapLabel = targetRowGapSentence\(judging, s, band\);/);
    expect(targets).toMatch(/you=\{judging\?\.utr \?\? null\}/);
    expect(targets).toMatch(/youBasis=\{judging \? ratingBasisLabel\(judging\.basis\) : null\}/);

    const closest = codeOnly("components/seeded/roadmap/closest-schools.tsx");
    expect(closest).toMatch(/const measuredFrom = closestSchoolsMeasuredFrom\(judging\);/);

    const detail = codeOnly("components/seeded/schools/seeded-school-detail.tsx");
    expect(detail).toMatch(/const judgingRating = judgingRatingFor\(\{ report \}\);/);
    expect(detail).toMatch(/schoolPageUtrRow\(judgingRating, todayRatingFor\(subjectUtr\), school, subjectWho\)/);
    expect(detail).toMatch(/description=\{utrRow\?\.description \?\? ""\}/);
    expect(detail).toMatch(/rangeCaption\(judgingRating, subjectWho, range\)/);
    expect(detail).toMatch(/youBasis=\{judgingBasis \? ratingBasisLabel\(judgingBasis\) : null\}/);
    expect(detail).toMatch(/const judgingBasis = judgingRating\?\.basis \?\? null;/);

    const bar = codeOnly("components/seeded/ui/range-bar.tsx");
    expect(bar).toMatch(/rangeBarYouLine\(\{ youLabel, you: you!, youIsEstimate, youBasis, median: median!, checked \}\)/);

    for (const file of [
      "components/seeded/schools/seeded-schools-browser.tsx",
      "components/seeded/schools/seeded-school-detail.tsx",
      "components/seeded/roadmap/target-schools-list.tsx",
    ]) {
      const src = codeOnly(file);
      // No screen assembles a basis or a gap of its own any more.
      expect(src, file).not.toMatch(/teamLineRelation\(|teamGapSentence\(|basisOfReportUtr\(|whatIfBasis\(|projectedYouLabel\(/);
    }
  });
});

describe("verifier M1: the pure helpers every fit screen consumes", () => {
  const s = school("emory", 9.1, 10.3);
  const estimateReport = { utr: { value: 8.5, isProjected: true, year: 2027, source: "logged-pace" as const } };
  const todayReport = { utr: { value: 8.2, isProjected: false, year: 2027, source: "current" as const } };
  const planReport = { utr: { value: 8.99, isProjected: false, year: 2027, source: "plan" as const } };

  it("judgingRatingFor: estimate / today / plan / sentinel — the report says which", () => {
    expect(judgingRatingFor({ report: estimateReport })).toEqual({ utr: 8.5, basis: { kind: "estimate", year: 2027 } });
    expect(judgingRatingFor({ report: todayReport })).toEqual({ utr: 8.2, basis: { kind: "today" } });
    // Judged on the Plan UTR: labelled as the plan, never as today (the A1
    // bug otherwise).
    expect(judgingRatingFor({ report: planReport })).toEqual({ utr: 8.99, basis: { kind: "plan", year: 2027 } });
    // No report, or the 0 sentinel: nothing.
    expect(judgingRatingFor({ report: null })).toBeNull();
    expect(judgingRatingFor({ report: { utr: { value: 0, isProjected: false, year: 2027, source: "current" } } })).toBeNull();
    expect(todayRatingFor(0)).toBeNull();
    expect(todayRatingFor(null)).toBeNull();
    expect(todayRatingFor(8.2)).toBe(8.2);
  });

  it("whyBandGapLines: the judging gap, then TODAY's from today's rating — never the judging value as today", () => {
    const judging = { utr: 8.99, basis: { kind: "plan", year: 2027 } as RatingBasis };
    expect(whyBandGapLines(judging, 8.2, s)).toEqual([
      "You 8.99 by summer 2027, your plan: below the team floor (9.xx) · below the team average (10.xx)",
      "You 8.20 today: below the team floor (9.xx) · below the team average (10.xx)",
    ]);
    expect(whyBandGapLines({ utr: 8.5, basis: estimate }, 8.2, s)).toEqual([
      "You 8.5 by summer 2027, estimate: below the team floor (9.xx) · below the team average (10.xx)",
      "You 8.20 today: below the team floor (9.xx) · below the team average (10.xx)",
    ]);
    // Judged on today: one line, not two.
    expect(whyBandGapLines({ utr: 8.2, basis: today }, 8.2, s)).toEqual(["You 8.20 today: below the team floor (9.xx) · below the team average (10.xx)"]);
    // No real rating today: no today line.
    expect(whyBandGapLines({ utr: 8.5, basis: estimate }, null, s)).toHaveLength(1);
    expect(whyBandGapLines(null, null, s)).toEqual([]);
  });

  it("verifier LOW: a parent's caption starts with a capital", () => {
    expect(ratingWithBasis(8.7, estimate, "your player")).toBe("Your player 8.7 by summer 2027, estimate");
    expect(rangeCaption({ utr: 8.7, basis: estimate }, "your player", { min: 9.1, max: 11.5 })).toBe(
      "Your player 8.7 by summer 2027, estimate · team 9.xx–11.xx"
    );
  });

  it("targetRowGapSentence: the band's line, from the judging rating, labelled", () => {
    expect(targetRowGapSentence({ utr: 8.5, basis: estimate }, s, "out-of-range")).toBe(
      "You 8.5 by summer 2027, estimate: below the team floor (9.xx)."
    );
    expect(targetRowGapSentence({ utr: 9.5, basis: estimate }, s, "target")).toBe(
      "You 9.5 by summer 2027, estimate: below the team average (10.xx)."
    );
    expect(targetRowGapSentence({ utr: 8.2, basis: today }, s, "reach")).toBe("You 8.20 today: below the team floor (9.xx).");
    expect(targetRowGapSentence(null, s, "reach")).toBe("Log a UTR to see your gap.");
    expect(targetRowGapSentence({ utr: 8.5, basis: estimate }, s, "unverified")).toBe("Log a UTR to see your gap.");
  });

  it("schoolPageUtrRow: judging gap + today's rating + chip suffix; no today line when judged on today", () => {
    expect(schoolPageUtrRow({ utr: 8.5, basis: estimate }, 8.2, s)).toEqual({
      description: "You 8.5 by summer 2027, estimate: below the team floor (9.xx) · below the team average (10.xx). You 8.20 today.",
      chipSuffix: " by summer 2027, estimate",
    });
    expect(schoolPageUtrRow({ utr: 8.2, basis: today }, 8.2, s, "Bailey")).toEqual({
      description: "Bailey 8.20 today: below the team floor (9.xx) · below the team average (10.xx).",
      chipSuffix: "",
    });
    expect(schoolPageUtrRow({ utr: 8.5, basis: estimate }, null, s).description).not.toMatch(/today/);
  });

  it("closestSchoolsMeasuredFrom and rangeBarYouLine carry the basis", () => {
    expect(closestSchoolsMeasuredFrom({ utr: 8.5, basis: estimate })).toBe("your 8.5 by summer 2027, estimate");
    expect(closestSchoolsMeasuredFrom({ utr: 8.2, basis: today })).toBe("your 8.20 today");
    expect(closestSchoolsMeasuredFrom(null)).toBeNull();
    expect(rangeBarYouLine({ youLabel: "You", you: 8.5, youIsEstimate: true, youBasis: "by summer 2027, estimate", median: 10.3 })).toBe(
      "You 8.5 by summer 2027, estimate · below the team average (10.xx)"
    );
    expect(rangeBarYouLine({ youLabel: "You", you: 8.2, youIsEstimate: false, youBasis: null, median: 10.3 })).toBe(
      "You 8.20 · below the team average (10.xx)"
    );
  });
});

describe("A3: one chart vocabulary", () => {
  it("names each line once", () => {
    expect(CHART_LINE_NAMES).toEqual({ logged: "Your UTR", estimate: "Estimate", plan: "Plan" });
  });

  it("the legend lists only what is drawn, in those words (swatches since 2026-11-27)", () => {
    expect(chartLegendItems({ estimate: false, planUtr: "11.50" })).toEqual([
      { key: "logged", label: "Your UTR (logged)" },
      { key: "plan", label: "Plan to 11.50" },
    ]);
    expect(chartLegendItems({ estimate: true, planUtr: null })).toEqual([
      { key: "logged", label: "Your UTR (logged)" },
      { key: "estimate", label: "Estimate" },
    ]);
    expect(chartLegendItems({ estimate: false, planUtr: null })).toEqual([{ key: "logged", label: "Your UTR (logged)" }]);
  });

  it("both charts use it, and both draw the estimate dotted", () => {
    expect(codeOnly("components/seeded/roadmap/plan-trajectory-chart.tsx")).toMatch(/chartLegendItems\(\{/);
    expect(codeOnly("components/seeded/dashboard/seeded-dashboard-layout.tsx")).toMatch(/chartLegendItems\(\{/);
    for (const file of [
      "components/seeded/roadmap/plan-trajectory-chart.tsx",
      "components/seeded/dashboard/utr-vs-plan-chart.tsx",
      "components/seeded/family/dashboard/utr-trend-chart.tsx",
    ]) {
      expect(codeOnly(file), file).toMatch(/points=\{(paths\.estimate|estimateLine|projLine)\}[^>]*strokeDasharray="0\.5 6"/);
    }
    // /family's legend swatch is dotted and named like the others.
    const family = codeOnly("components/seeded/family/dashboard/utr-trend-chart.tsx");
    expect(family).toMatch(/strokeDasharray="0\.5 6" strokeLinecap="round" \/>\s*<\/svg>\s*\{CHART_LINE_NAMES\.estimate\}/);
    for (const file of ["components/seeded/roadmap/plan-trajectory-chart.tsx", "components/seeded/dashboard/seeded-dashboard-layout.tsx"]) {
      // B24 too: "The line is the UTRs you've logged." was the logged-only
      // case's own wording on /today.
      expect(codeOnly(file), file).not.toMatch(/Green dashes|Dashed: your plan|Dotted: your estimate|The line is the UTRs|UTRs you've logged/);
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
    expect(lead).toBe("None of our 37 men's programs are in range at 5.00 yet. Closest: Middlebury, floor 8.xx.");
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
