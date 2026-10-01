import { describe, expect, it } from "vitest";
import {
  getCurrentGrade,
  getCurrentSchoolYear,
  getDefaultCommitDate,
  getGradYearFromGrade,
  getMonthsUntilGraduation,
  getRecruitingPhase,
  getSummerBeforeGradeYear,
  hasGraduated,
  ordinalGrade,
  resolveGraduationYear,
} from "./time";

describe("getCurrentSchoolYear", () => {
  it("stays in the current calendar year before the August 1 rollover", () => {
    expect(getCurrentSchoolYear(new Date(2026, 6, 31))).toBe(2026); // July 31
    expect(getCurrentSchoolYear(new Date(2026, 0, 1))).toBe(2026); // Jan 1
  });

  it("advances to next calendar year exactly on August 1", () => {
    expect(getCurrentSchoolYear(new Date(2026, 7, 1))).toBe(2027); // Aug 1
  });

  it("stays advanced for the rest of the year after rollover", () => {
    expect(getCurrentSchoolYear(new Date(2026, 7, 2))).toBe(2027); // Aug 2
    expect(getCurrentSchoolYear(new Date(2026, 11, 31))).toBe(2027); // Dec 31
  });
});

describe("getCurrentGrade", () => {
  it("matches the worked example: class of 2029 in September 2026 is 10th grade", () => {
    expect(getCurrentGrade(2029, new Date(2026, 8, 15))).toBe(10);
  });

  it("is one grade lower the day before the August 1 rollover", () => {
    expect(getCurrentGrade(2029, new Date(2026, 6, 31))).toBe(9);
  });

  it("is already bumped on August 1 itself", () => {
    expect(getCurrentGrade(2029, new Date(2026, 7, 1))).toBe(10);
  });

  it("returns 12 for senior year", () => {
    expect(getCurrentGrade(2027, new Date(2026, 8, 1))).toBe(12);
  });

  it("returns 13+ once graduation has passed", () => {
    expect(getCurrentGrade(2026, new Date(2026, 8, 1))).toBe(13);
    expect(getCurrentGrade(2024, new Date(2026, 8, 1))).toBe(15);
  });
});

describe("hasGraduated", () => {
  it("is false through senior year", () => {
    expect(hasGraduated(2027, new Date(2026, 8, 1))).toBe(false); // 12th grade
  });

  it("is false the day before rollover of the graduation year", () => {
    expect(hasGraduated(2027, new Date(2027, 6, 31))).toBe(false);
  });

  it("flips true exactly at the graduation-year rollover", () => {
    expect(hasGraduated(2027, new Date(2027, 7, 1))).toBe(true);
  });
});

describe("getGradYearFromGrade", () => {
  it("round-trips with getCurrentGrade for a range of grades and dates", () => {
    const date = new Date(2026, 8, 15);
    for (let grade = 8; grade <= 12; grade++) {
      const gradYear = getGradYearFromGrade(grade, date);
      expect(getCurrentGrade(gradYear, date)).toBe(grade);
    }
  });

  it("matches the worked example in reverse", () => {
    expect(getGradYearFromGrade(10, new Date(2026, 8, 15))).toBe(2029);
  });

  it("uses the date passed in, not today, for migration correctness", () => {
    // A grade of 10 entered a year earlier implies a different gradYear.
    const enteredLastYear = new Date(2025, 8, 15);
    const enteredNow = new Date(2026, 8, 15);
    expect(getGradYearFromGrade(10, enteredLastYear)).toBe(2028);
    expect(getGradYearFromGrade(10, enteredNow)).toBe(2029);
  });
});

describe("getSummerBeforeGradeYear", () => {
  it("places the summer before 13th grade (college) in the graduation year itself", () => {
    expect(getSummerBeforeGradeYear(2029, 13)).toBe(2029);
  });

  it("places the summer before 9th grade four years earlier", () => {
    expect(getSummerBeforeGradeYear(2029, 9)).toBe(2025);
  });
});

describe("getMonthsUntilGraduation", () => {
  it("is 0 once graduation has passed", () => {
    expect(getMonthsUntilGraduation(2026, new Date(2026, 7, 1))).toBe(0);
    expect(getMonthsUntilGraduation(2024, new Date(2026, 7, 1))).toBe(0);
  });

  it("counts months up to the August 1 rollover", () => {
    // June 1, 2026 -> Aug 1, 2026 is 2 months.
    expect(getMonthsUntilGraduation(2026, new Date(2026, 5, 1))).toBe(2);
  });

  it("counts the full distance to graduation, not just to the commit-date target", () => {
    // Class of 2029, 10th grade in Sept 2026: graduation rolls over Aug 1,
    // 2029 — 2 years and 11 months away. (Months "to commitment" is a
    // separate, earlier target — see getDefaultCommitDate.)
    expect(getMonthsUntilGraduation(2029, new Date(2026, 8, 15))).toBe(35);
  });
});

describe("getDefaultCommitDate", () => {
  it("is September 1 the year before graduation", () => {
    expect(getDefaultCommitDate(2029)).toBe("2028-09-01");
  });
});

describe("getRecruitingPhase", () => {
  it("is foundation before the contact-open date", () => {
    // Class of 2029, 9th grade (Sept 2025) — well before contact opens.
    expect(getRecruitingPhase(2029, new Date(2025, 8, 1))).toBe("foundation");
  });

  it("is still foundation the day before the June 15 contact-open date", () => {
    // Contact opens June 15, 2027 for class of 2029 (summer before 11th grade).
    expect(getRecruitingPhase(2029, new Date(2027, 5, 14))).toBe("foundation");
  });

  it("flips to active-contact exactly on the June 15 contact-open date", () => {
    expect(getRecruitingPhase(2029, new Date(2027, 5, 15))).toBe("active-contact");
  });

  it("is commitment during senior year", () => {
    expect(getRecruitingPhase(2027, new Date(2026, 8, 1))).toBe("commitment"); // 12th grade
  });

  it("is graduated after the graduation-year rollover", () => {
    expect(getRecruitingPhase(2026, new Date(2026, 7, 1))).toBe("graduated");
  });
});

describe("ordinalGrade", () => {
  it("labels known grades correctly", () => {
    expect(ordinalGrade(9)).toBe("9th");
    expect(ordinalGrade(10)).toBe("10th");
    expect(ordinalGrade(11)).toBe("11th");
    expect(ordinalGrade(12)).toBe("12th");
  });

  it("falls back to a generic th suffix for anything else", () => {
    expect(ordinalGrade(8)).toBe("8th");
    expect(ordinalGrade(13)).toBe("13th");
  });
});

describe("resolveGraduationYear", () => {
  it("trusts graduation_year when present, ignoring a stale grade column", () => {
    expect(
      resolveGraduationYear({ graduation_year: 2029, grade: 8, created_at: "2020-01-01" })
    ).toBe(2029);
  });

  it("migrates a legacy grade-only row using created_at", () => {
    // Grade 10 entered on 2025-09-15 implies class of 2028, not 2029.
    const result = resolveGraduationYear({
      graduation_year: null,
      grade: 10,
      created_at: "2025-09-15T00:00:00Z",
    });
    expect(result).toBe(2028);
  });

  it("falls back to today when created_at is missing", () => {
    const expected = getGradYearFromGrade(10);
    expect(resolveGraduationYear({ graduation_year: null, grade: 10, created_at: null })).toBe(
      expected
    );
  });

  it("returns null when there is nothing to derive from", () => {
    expect(resolveGraduationYear({ graduation_year: null, grade: null })).toBeNull();
  });
});
