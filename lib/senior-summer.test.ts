import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { codeOnly } from "./testing/source-text";
import { diagnosticProjection, recruitingTimeUtr } from "./fit";
import { explainSchoolFit } from "./school-fit";
import type { SchoolLite } from "./types";
import {
  seniorSummerMeasureSentence,
  seniorSummerPhase,
  seniorSummerTodayNote,
  seniorSummerVerb,
  seniorSummerYear,
} from "./senior-summer";

// Final-check B20 (2026-11-21): the summer before senior year in ONE tense
// everywhere, following the real date. For the class of 2027 in November
// 2026 the onboarding said "We'll measure you at summer 2026", the report
// "has started", the school page "has begun" next to "has already passed".

const NOV_2026 = new Date(2026, 10, 21, 12);
const MAY_2026 = new Date(2026, 4, 31, 12);
const JULY_2026 = new Date(2026, 6, 10, 12);
const ROOT = join(__dirname, "..");

describe("seniorSummerPhase", () => {
  it("class of 2027 -> summer 2026", () => expect(seniorSummerYear(2027)).toBe(2026));
  it.each([
    [MAY_2026, "upcoming"],
    [new Date(2026, 5, 1, 0, 0), "underway"],
    [JULY_2026, "underway"],
    [new Date(2026, 6, 31, 23, 59), "underway"],
    [new Date(2026, 7, 1, 0, 0), "passed"],
    [NOV_2026, "passed"],
  ] as const)("%s -> %s", (now, phase) => expect(seniorSummerPhase(2026, now)).toBe(phase));

  it("the verbs", () => {
    expect(seniorSummerVerb("underway")).toBe("has started");
    expect(seniorSummerVerb("passed")).toBe("has passed");
  });
});

describe("the onboarding result heading", () => {
  it("future tense only while the summer is ahead", () => {
    expect(seniorSummerMeasureSentence("you", 2026, MAY_2026)).toBe("We'll measure you at summer 2026, the summer before senior year.");
    expect(seniorSummerMeasureSentence("you", 2026, JULY_2026)).toBe(
      "Summer 2026, the summer before senior year, has started, so we measure you at today's rating."
    );
    expect(seniorSummerMeasureSentence("your player", 2026, NOV_2026)).toBe(
      "Summer 2026, the summer before senior year, has passed, so we measure your player at today's rating."
    );
  });

  it("the finding's case is gone: no 'We'll measure' for a past summer", () => {
    expect(seniorSummerMeasureSentence("you", 2026, NOV_2026)).not.toMatch(/We'll/);
  });

  it("the result screen uses the helper", () => {
    const flow = codeOnly(join(ROOT, "components/seeded/onboarding/diagnostic/diagnostic-flow.tsx"));
    expect(flow).toMatch(/seniorSummerMeasureSentence\(who, projectionTargetDate\(gradYear\)\.getFullYear\(\)\)/);
    expect(flow).not.toMatch(/We&rsquo;ll measure \{/);
  });
});

describe("one tense across the report, the school page and the pace message (Nov 2026, class of 2027)", () => {
  it("fit report note", () => {
    const p = diagnosticProjection({ todayUtr: 9, graduationYear: 2027, gender: "male", now: NOV_2026 })!;
    expect(p.note).toBe("The summer before senior year has passed, so this is today's UTR.");
    const july = diagnosticProjection({ todayUtr: 9, graduationYear: 2027, gender: "male", now: JULY_2026 })!;
    expect(july.note).toBe("The summer before senior year has started, so this is today's UTR.");
    expect(seniorSummerTodayNote(2026, NOV_2026)).toBe(p.note);
  });

  it("school pace message says the same verb as the report", () => {
    // Same fixture shape as lib/school-fit.test.ts (fake school, test values).
    const school: SchoolLite = {
      id: "tense-test",
      slug: "tense-test",
      name: "tense-test",
      shortName: "tense-test",
      city: "Testville",
      state: "VA",
      conference: "Test Conf",
      division: "D1",
      gender: "men",
      primaryColor: "#000",
      secondaryColor: "#000",
      textColor: "#fff",
      avgRosterUTR: 12,
      minCompetitiveUTR: 11,
      usNewsRanking: 50,
    } as SchoolLite;
    const nov = explainSchoolFit(8, school, { graduationYear: 2027, now: NOV_2026 });
    expect(nov.nextBand?.message).toMatch(/^The summer before senior year has passed, /);
    const july = explainSchoolFit(8, school, { graduationYear: 2027, now: JULY_2026 });
    expect(july.nextBand?.message).toMatch(/^The summer before senior year has started, /);
  });

  it("no screen hardcodes 'has begun' / 'already passed' for that summer any more", () => {
    for (const f of [
      "components/seeded/schools/seeded-school-detail.tsx",
      "components/seeded/roadmap/goal-pace-warning.tsx",
      "lib/school-fit.ts",
    ]) {
      const src = codeOnly(join(ROOT, f));
      expect(src, f).not.toMatch(/summer before senior year (has begun|has already passed|\([^)]*\) has passed)/);
      expect(src, f).toMatch(/seniorSummerVerb\(seniorSummerPhase\(/);
    }
  });

  it("the band logic is untouched: from June 1 the judged rating is today's in every phase", () => {
    for (const now of [JULY_2026, NOV_2026]) {
      const r = recruitingTimeUtr({ currentUtr: 9, graduationYear: 2027, gender: "male", now, history: [] })!;
      expect(r.isProjected).toBe(false);
      expect(r.value).toBe(9);
    }
  });
});
