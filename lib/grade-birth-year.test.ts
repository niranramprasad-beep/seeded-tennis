import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BIRTH_YEAR_SLACK_YEARS,
  SHOW_ALL_BIRTH_YEARS_LABEL,
  birthYearChoices,
  birthYearClearedNotice,
  birthYearRangeForGrade,
  birthYearRangeForGradYear,
  isInBirthYearRange,
  reconcileBirthYear,
  savedBirthYearClassYearHint,
  typicalBirthYearsForGradYear,
} from "./grade-birth-year";
import { birthYearOptions, parentConsentRequired } from "./config/consent";
import { usualBirthYearsForGradYear } from "./signup-checks";
import { getGradYearFromGrade } from "./time";
import {
  EMPTY_ANSWERS,
  answerGradYear,
  birthYearNeedsFullList,
  diagnosticBirthYearChoices,
  playerBirthYearOptions,
} from "./onboarding/diagnostic";
import { codeOnly } from "./testing/source-text";

// THE RULE (lib/grade-birth-year.ts): in the fall of the school year that
// starts in year Y, a US student in grade G is typically G+5 or G+6, so born
// in Y-G-6 .. Y-G-5; one year either side is allowed (held back / red-shirt,
// early starter, late birthday), so the forms offer Y-G-7 .. Y-G-4.

const NOV_2026 = new Date(2026, 10, 22); // school year starting 2026
const JUL_2026 = new Date(2026, 6, 15); // still the school year starting 2025
const AUG_2026 = new Date(2026, 7, 1); // rollover day: starting 2026

/** The rule, written out independently of the implementation. */
function expected(grade: number, schoolYearStart: number) {
  return {
    earliest: schoolYearStart - grade - 6 - BIRTH_YEAR_SLACK_YEARS,
    latest: schoolYearStart - grade - 5 + BIRTH_YEAR_SLACK_YEARS,
  };
}

describe("grade → realistic birth years", () => {
  it("slack is one year either side", () => {
    expect(BIRTH_YEAR_SLACK_YEARS).toBe(1);
  });

  it.each([
    [8, { earliest: 2011, latest: 2014 }],
    [9, { earliest: 2010, latest: 2013 }],
    [10, { earliest: 2009, latest: 2012 }],
    [11, { earliest: 2008, latest: 2011 }],
    [12, { earliest: 2007, latest: 2010 }],
  ])("grade %i in Nov 2026 (school year 2026–27)", (grade, range) => {
    expect(birthYearRangeForGrade(grade, NOV_2026)).toEqual(range);
    expect(birthYearRangeForGrade(grade, NOV_2026)).toEqual(expected(grade, 2026));
  });

  it("uses lib/time.ts's school year: July is still last year's, August 1 rolls over", () => {
    expect(birthYearRangeForGrade(10, JUL_2026)).toEqual(expected(10, 2025));
    expect(birthYearRangeForGrade(10, AUG_2026)).toEqual(expected(10, 2026));
  });

  it("is always four years, and the typical two sit in the middle", () => {
    for (let g = 1; g <= 12; g++) {
      const r = birthYearRangeForGrade(g, NOV_2026);
      expect(r.latest - r.earliest).toBe(3);
      const typical = typicalBirthYearsForGradYear(getGradYearFromGrade(g, NOV_2026));
      expect(typical).toEqual({ earliest: 2026 - g - 6, latest: 2026 - g - 5 });
      expect(r.earliest).toBe(typical.earliest - 1);
      expect(r.latest).toBe(typical.latest + 1);
    }
  });

  it("the class-year form agrees with the grade form", () => {
    for (let g = 8; g <= 12; g++) {
      expect(birthYearRangeForGradYear(getGradYearFromGrade(g, NOV_2026))).toEqual(
        birthYearRangeForGrade(g, NOV_2026)
      );
    }
    expect(birthYearRangeForGradYear(2029)).toEqual({ earliest: 2009, latest: 2012 });
  });

  it("is the same window the sign-up hint uses (one rule, not two)", () => {
    for (const gy of [2027, 2028, 2029, 2030, 2031]) {
      expect(usualBirthYearsForGradYear(gy)).toEqual(birthYearRangeForGradYear(gy));
    }
  });

  it("an 8th grader's filtered list still holds under-13 years, so the consent rule keeps working", () => {
    const years = birthYearChoices(birthYearOptions(NOV_2026), birthYearRangeForGrade(8, NOV_2026), false);
    expect(years).toEqual([2014, 2013, 2012, 2011]);
    // <= 13 by year (lib/config/consent.ts): 2014 and 2013 need a parent.
    expect(years.filter((y) => parentConsentRequired(y, NOV_2026))).toEqual([2014, 2013]);
  });
});

describe("birthYearChoices", () => {
  const all = birthYearOptions(NOV_2026);
  const range = birthYearRangeForGrade(10, NOV_2026);

  it("no grade yet (or a parent's own year): every year", () => {
    expect(birthYearChoices(all, null, false)).toEqual(all);
  });

  it("a grade: only its range, newest first", () => {
    expect(birthYearChoices(all, range, false)).toEqual([2012, 2011, 2010, 2009]);
  });

  it("'Show all years' lifts the filter", () => {
    expect(birthYearChoices(all, range, true)).toEqual(all);
    expect(SHOW_ALL_BIRTH_YEARS_LABEL).toBe("Show all years");
  });

  it("never offers a year the full list does not", () => {
    expect(birthYearChoices([2012, 2011], range, false)).toEqual([2012, 2011]);
  });
});

describe("a birth year already picked when the grade changes: CLEARED, with a message", () => {
  const range = birthYearRangeForGrade(10, NOV_2026);

  it("outside the new range: cleared, and the message says which year and why", () => {
    const r = reconcileBirthYear(2008, range, false, "10th grade");
    expect(r.birthYear).toBeNull();
    expect(r.notice).toBe(birthYearClearedNotice(2008, "10th grade"));
    expect(r.notice).toBe(
      "2008 isn't a usual birth year for 10th grade, so we cleared it. Pick the year again, or show all years."
    );
  });

  it("inside the new range: kept, no message", () => {
    for (const y of [2009, 2010, 2011, 2012]) {
      expect(reconcileBirthYear(y, range, false, "10th grade")).toEqual({ birthYear: y, notice: null });
    }
  });

  it("never swaps in a different year", () => {
    for (const y of [1980, 2000, 2008, 2013, 2020]) {
      const r = reconcileBirthYear(y, range, false, "10th grade");
      expect(r.birthYear === y || r.birthYear === null).toBe(true);
    }
  });

  it("left alone when nothing was picked, there is no range, or 'Show all years' was chosen", () => {
    expect(reconcileBirthYear(null, range, false, "10th grade")).toEqual({ birthYear: null, notice: null });
    expect(reconcileBirthYear(1980, null, false, "10th grade")).toEqual({ birthYear: 1980, notice: null });
    expect(reconcileBirthYear(2008, range, true, "10th grade")).toEqual({ birthYear: 2008, notice: null });
  });

  it("the message is not an error and does not name the consent rule", () => {
    const notice = birthYearClearedNotice(2008, "10th grade");
    expect(notice).not.toMatch(/error|invalid|must|wrong/i);
    expect(notice).not.toMatch(/\b13\b|parent|consent/i);
  });
});

describe("Settings: a SAVED birth year is kept, with a message (write-once)", () => {
  it("in range: nothing to say", () => {
    expect(savedBirthYearClassYearHint(2011, 2029)).toBeNull();
  });
  it("out of range: a message, never a block", () => {
    expect(savedBirthYearClassYearHint(2005, 2029)).toBe(
      "The class of 2029 is unusual for someone born in 2005. Check the grad year. If it's right, save anyway."
    );
  });
  it("no birth year on file (accounts from before 030): nothing", () => {
    expect(savedBirthYearClassYearHint(null, 2029)).toBeNull();
    expect(savedBirthYearClassYearHint(undefined, 2029)).toBeNull();
  });
});

describe("the /onboarding diagnostic: the class year filters the birth question", () => {
  it("offers only the class year's range once it is answered", () => {
    expect(diagnosticBirthYearChoices({ gradYear: 2029 }, false, NOV_2026)).toEqual([2012, 2011, 2010, 2009]);
    expect(diagnosticBirthYearChoices({ gradYear: null }, false, NOV_2026)).toEqual(playerBirthYearOptions(NOV_2026));
    expect(diagnosticBirthYearChoices({ gradYear: 2029 }, true, NOV_2026)).toEqual(playerBirthYearOptions(NOV_2026));
  });

  it("every class year it offers has its whole range inside the player list", () => {
    const list = playerBirthYearOptions(NOV_2026);
    for (const gy of [2027, 2028, 2029, 2030, 2031]) {
      const r = birthYearRangeForGradYear(gy);
      for (let y = r.earliest; y <= r.latest; y++) expect(list).toContain(y);
    }
  });

  it("changing the class year clears a birth year it makes unusual, and says so", () => {
    const a = { ...EMPTY_ANSWERS, role: "player" as const, gradYear: 2029, birthYear: 2011 };
    const moved = answerGradYear(a, 2027, { showAllBirthYears: false, birthYearLocked: false });
    expect(moved.answers.gradYear).toBe(2027);
    expect(moved.answers.birthYear).toBeNull();
    expect(moved.birthYearNotice).toBe(birthYearClearedNotice(2011, "the class of 2027"));

    const fine = answerGradYear(a, 2028, { showAllBirthYears: false, birthYearLocked: false });
    expect(fine.answers.birthYear).toBe(2011);
    expect(fine.birthYearNotice).toBeNull();
  });

  it("never touches a birth year on the account (write-once), or one picked from all years", () => {
    const a = { ...EMPTY_ANSWERS, role: "player" as const, gradYear: 2029, birthYear: 2011 };
    expect(answerGradYear(a, 2027, { showAllBirthYears: false, birthYearLocked: true }).answers.birthYear).toBe(2011);
    expect(answerGradYear(a, 2027, { showAllBirthYears: true, birthYearLocked: false }).answers.birthYear).toBe(2011);
  });

  it("starts on the full list when the answers already hold a year the filter would hide", () => {
    expect(birthYearNeedsFullList({ gradYear: 2029, birthYear: 2005 })).toBe(true);
    expect(birthYearNeedsFullList({ gradYear: 2029, birthYear: 2011 })).toBe(false);
    expect(birthYearNeedsFullList({ gradYear: null, birthYear: 2005 })).toBe(false);
  });

  it("isInBirthYearRange is inclusive at both ends", () => {
    const r = birthYearRangeForGradYear(2029);
    expect(isInBirthYearRange(2009, r)).toBe(true);
    expect(isInBirthYearRange(2012, r)).toBe(true);
    expect(isInBirthYearRange(2008, r)).toBe(false);
    expect(isInBirthYearRange(2013, r)).toBe(false);
  });
});

// ------------------------------------------------------------------ wiring

const ROOT = join(__dirname, "..");
const read = (f: string) => codeOnly(join(ROOT, f));
const SIGNUP = "components/auth/signup-flow.tsx";
const OAUTH = "components/auth/complete-oauth-signup.tsx";
const DIAG = "components/seeded/onboarding/diagnostic/diagnostic-flow.tsx";
const SETTINGS = "components/seeded/settings/profile-card.tsx";

/** Index of each marker in `src`; every one must be present. */
function positions(src: string, markers: string[]): number[] {
  return markers.map((m) => {
    const at = src.indexOf(m);
    expect(at, `missing ${m}`).toBeGreaterThan(-1);
    return at;
  });
}
const ascending = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] < x);

describe("profile forms: role, country, team, grade, year born (web developer's review 2026-11-22)", () => {
  it("/signup and /parent-signup: role on step 1; country, team, grade, year born on step 2", () => {
    const src = read(SIGNUP);
    expect(ascending(positions(src, ['name="signup-role"', 'id="signup-country"', 'name="signup-gender"', 'name="signup-grade"', 'id="signup-birth-year"']))).toBe(true);
  });

  it("/auth/complete: role, name, country, team, grade, year born", () => {
    const src = read(OAUTH);
    expect(ascending(positions(src, ['name="oauth-role"', 'id="oauth-name"', 'id="oauth-country"', 'name="oauth-gender"', 'name="oauth-grade"', 'id="oauth-birth-year"']))).toBe(true);
  });

  it("Settings → Profile: country, team, grad year, then the read-only year born", () => {
    const src = read(SETTINGS);
    expect(ascending(positions(src, [">Country<", ">Team<", ">High school grad year<", ">Year born<"]))).toBe(true);
  });

  it("the diagnostic keeps board 20's steps: role, team, …, class year, then birth", () => {
    // lib/onboarding/diagnostic.ts STEP — the order the question flow walks.
    const diag = readFileSync(join(ROOT, "lib/onboarding/diagnostic.ts"), "utf8");
    const step = diag.slice(diag.indexOf("export const STEP = {"), diag.indexOf("} as const;"));
    expect(ascending(positions(step, ["role:", "team:", "gradYear:", "birth:"]))).toBe(true);
  });
});

describe("the forms use the filter, the clear-with-message rule, and keep birth year write-once", () => {
  it("/signup and /auth/complete filter by grade and reconcile on a grade change", () => {
    for (const f of [SIGNUP, OAUTH]) {
      const src = read(f);
      expect(src, f).toMatch(/birthYearChoices\(birthYearOptions\(\), birthYearRange, showAllBirthYears\)/);
      expect(src, f).toMatch(/const chooseGrade = \(g: number\) => \{\s*setGrade\(g\);\s*fitBirthYearTo\(g, /);
      expect(src, f).toMatch(/reconcileBirthYear\(/);
      expect(src, f).toMatch(/onChange=\{chooseGrade\}/);
      expect(src, f).toMatch(/<BirthYearField/);
      // The old unfiltered list is gone from the birth-year select.
      expect(src, f).not.toMatch(/\{birthYearOptions\(\)\.map\(/);
    }
  });

  it("the diagnostic filters by class year and reconciles on a class-year change", () => {
    const src = read(DIAG);
    expect(src).toMatch(/diagnosticBirthYearChoices\(answers, showAllBirthYears\)/);
    expect(src).toMatch(/onChange=\{\(\) => onPickGradYear\(y\)\}/);
    expect(src).toMatch(/answerGradYear\(answers, gradYear, \{/);
    expect(src).toMatch(/birthYearLocked: lockedBirthYear != null/);
    expect(src).not.toMatch(/playerBirthYearOptions\(\)/);
  });

  it("Settings shows the birth year read-only and never sends it", () => {
    const src = read(SETTINGS);
    expect(src).toMatch(/readOnly/);
    expect(src).not.toMatch(/setBirthYear\(Number/);
    const save = src.slice(src.indexOf("const ok = await onSave({"), src.indexOf("setSaving(false);"));
    expect(save).not.toMatch(/birthYear|birth_year/);
  });
});
