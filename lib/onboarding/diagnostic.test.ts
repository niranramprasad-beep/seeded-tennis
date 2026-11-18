import { describe, expect, it } from "vitest";
import { emptyPlayer } from "@/lib/data/user";
import {
  EMPTY_ANSWERS,
  RESULT_STEP,
  STEP,
  canContinue,
  diagnosticPlayerProfile,
  diagnosticUtrEntries,
  diagnosticValues,
  firstStep,
  gradYearOptions,
  parseGpaText,
  parsePendingAnswers,
  parseUtrText,
  pastRatingMonthLabel,
  playerNeedsParent,
  prefillFromSearchParams,
  serializePendingAnswers,
  stepAfter,
  stepBefore,
  type DiagnosticAnswers,
} from "./diagnostic";

const NOW = new Date(2026, 10, 18, 12, 0, 0); // Nov 18 2026
const none = new Set<number>();
const player = (patch: Partial<DiagnosticAnswers> = {}): DiagnosticAnswers => ({
  ...EMPTY_ANSWERS,
  role: "player",
  gender: "female",
  ...patch,
});

describe("typed answers", () => {
  it("a UTR is 1.00–16.50 with at most two decimals, or it is not a UTR", () => {
    expect(parseUtrText("8.25")).toEqual({ value: 8.25, error: null });
    expect(parseUtrText(" 16.5 ")).toEqual({ value: 16.5, error: null });
    expect(parseUtrText("")).toEqual({ value: null, error: null });
    for (const bad of ["0", "0.99", "16.51", "17", "8.255", "abc", "-3", "1e1", "."]) {
      expect(parseUtrText(bad).value, bad).toBeNull();
      expect(parseUtrText(bad).error, bad).toBeTruthy();
    }
  });

  it("a GPA is 0.0–4.0", () => {
    expect(parseGpaText("3.6").value).toBe(3.6);
    expect(parseGpaText("4").value).toBe(4);
    expect(parseGpaText("4.1").error).toBeTruthy();
    expect(parseGpaText("").value).toBeNull();
  });
});

describe("navigation", () => {
  it("Continue stays disabled until the step is answered", () => {
    expect(canContinue(STEP.role, EMPTY_ANSWERS)).toBe(false);
    expect(canContinue(STEP.role, player())).toBe(true);
    expect(canContinue(STEP.utrToday, player({ utrTodayText: "20" }))).toBe(false);
    expect(canContinue(STEP.utrToday, player({ utrTodayText: "9.1" }))).toBe(true);
    expect(canContinue(STEP.utrToday, player({ noUtrYet: true }))).toBe(true);
    expect(canContinue(STEP.birth, player({ birthMonth: 4 }))).toBe(false);
    expect(canContinue(STEP.birth, player({ birthMonth: 4, birthYear: 2011 }))).toBe(true);
  });

  it("'I don't have a UTR yet' skips both past-rating questions, both ways", () => {
    const a = player({ noUtrYet: true });
    expect(stepAfter(STEP.utrToday, a, none)).toBe(STEP.gradYear);
    expect(stepBefore(STEP.gradYear, a)).toBe(STEP.utrToday);
    const b = player({ utrTodayText: "8" });
    expect(stepAfter(STEP.utrToday, b, none)).toBe(STEP.utrSixMonths);
    expect(stepBefore(STEP.gradYear, b)).toBe(STEP.utrYear);
  });

  it("the homepage link's answers are passed over going forward, then the result", () => {
    const { answers, prefilled } = prefillFromSearchParams(
      { utr: "8.7", gradYear: "2029", gender: "women", gpa: "3.4" },
      NOW
    );
    const set = new Set(prefilled);
    expect(firstStep(answers, set)).toBe(STEP.role); // nobody said who they are
    const withRole = { ...answers, role: "player" as const };
    expect(stepAfter(STEP.role, withRole, set)).toBe(STEP.utrSixMonths); // team + UTR prefilled
    expect(stepAfter(STEP.utrYear, withRole, set)).toBe(STEP.birth); // grad year prefilled
    expect(stepAfter(STEP.enrollment, withRole, set)).toBe(RESULT_STEP); // GPA prefilled
    // ...and Back still reaches them.
    expect(stepBefore(STEP.utrSixMonths, withRole)).toBe(STEP.utrToday);
  });

  it("prefill ignores anything that does not parse — ?utr=0 is not a rating", () => {
    const { answers, prefilled } = prefillFromSearchParams(
      { utr: "0", gradYear: "1999", gender: "x", gpa: "9" },
      NOW
    );
    expect(prefilled).toEqual([]);
    expect(answers).toEqual(EMPTY_ANSWERS);
  });
});

describe("computed lists and labels", () => {
  it("grad years are this year's seniors and four more — computed, not typed", () => {
    expect(gradYearOptions(NOW)).toEqual([2027, 2028, 2029, 2030, 2031]);
    // The school year rolls over on August 1.
    expect(gradYearOptions(new Date(2027, 6, 31))).toEqual([2027, 2028, 2029, 2030, 2031]);
    expect(gradYearOptions(new Date(2027, 7, 1))).toEqual([2028, 2029, 2030, 2031, 2032]);
  });

  it("the past-rating label names the real month", () => {
    expect(pastRatingMonthLabel(6, NOW)).toBe("May 2026");
    expect(pastRatingMonthLabel(12, NOW)).toBe("November 2025");
    expect(pastRatingMonthLabel(6, new Date(2027, 2, 31))).toBe("September 2026");
  });

  it("under 13 uses the shared year-only rule (<= 13 rounds toward asking)", () => {
    expect(playerNeedsParent(player({ birthYear: 2013 }), NOW)).toBe(true);
    expect(playerNeedsParent(player({ birthYear: 2012 }), NOW)).toBe(false);
    expect(playerNeedsParent(player({ birthYear: null }), NOW)).toBe(false);
  });
});

describe("what a player's answers save as", () => {
  const full = player({
    utrTodayText: "8.25",
    utrSixMonthsText: "7.9",
    utrYearText: "7.4",
    gradYear: 2029,
    birthMonth: 3,
    birthYear: 2011,
    enrollmentTerm: "spring_after_grad",
    gpaText: "3.6",
  });

  it("dated utr_entries: a year ago, 6 months ago, today — local dates, oldest first", () => {
    expect(diagnosticUtrEntries(full, NOW)).toEqual([
      { utr: 7.4, recordedAt: "2025-11-18", note: "About a year ago (from sign-up)" },
      { utr: 7.9, recordedAt: "2026-05-18", note: "About 6 months ago (from sign-up)" },
      { utr: 8.25, recordedAt: "2026-11-18", note: "Starting UTR" },
    ]);
  });

  it("the profile gets every answer; currentUTR is today's rating", () => {
    const p = diagnosticPlayerProfile({ ...emptyPlayer, name: "Sam R." }, full);
    expect(p).toMatchObject({
      name: "Sam R.",
      role: "player",
      currentUTR: 8.25,
      graduationYear: 2029,
      commitmentDate: "2028-09-01",
      gender: "female",
      gpa: 3.6,
      birthMonth: 3,
      enrollmentTerm: "spring_after_grad",
      onboarded: true,
    });
  });

  it("no UTR → the 0 sentinel (stored as NULL) and NO entries — never a placeholder", () => {
    const a = { ...full, noUtrYet: true, utrTodayText: "", utrSixMonthsText: "", utrYearText: "" };
    expect(diagnosticPlayerProfile(emptyPlayer, a).currentUTR).toBe(0);
    expect(diagnosticUtrEntries(a, NOW)).toEqual([]);
  });

  it("past ratings never count without one today", () => {
    const a = { ...full, noUtrYet: true }; // stale text left behind
    expect(diagnosticValues(a).utrSixMonthsAgo).toBeNull();
    expect(diagnosticValues(a).utrYearAgo).toBeNull();
    expect(diagnosticUtrEntries(a, NOW)).toEqual([]);
  });

  it("a parent's answers are refused: a parent's profile holds no UTR or player stats", () => {
    const parent = { ...full, role: "parent" as const };
    expect(() => diagnosticPlayerProfile(emptyPlayer, parent)).toThrow();
    expect(diagnosticUtrEntries(parent, NOW)).toEqual([]);
  });
});

describe("answers carried across the Google redirect", () => {
  it("round-trips, and expires after an hour", () => {
    const a = player({ utrTodayText: "9", gradYear: 2030, birthYear: 2011, birthMonth: 2 });
    const raw = serializePendingAnswers(a, NOW);
    expect(parsePendingAnswers(raw, new Date(NOW.getTime() + 59 * 60 * 1000))).toEqual(a);
    expect(parsePendingAnswers(raw, new Date(NOW.getTime() + 61 * 60 * 1000))).toBeNull();
  });

  it("rejects junk instead of trusting it", () => {
    expect(parsePendingAnswers(null, NOW)).toBeNull();
    expect(parsePendingAnswers("{", NOW)).toBeNull();
    expect(parsePendingAnswers(JSON.stringify({ v: 2, savedAt: NOW.getTime(), answers: {} }), NOW)).toBeNull();
    const odd = parsePendingAnswers(
      JSON.stringify({ v: 1, savedAt: NOW.getTime(), answers: { role: "player", birthMonth: 13, gender: "x" } }),
      NOW
    )!;
    expect(odd.birthMonth).toBeNull();
    expect(odd.gender).toBeNull();
  });
});
