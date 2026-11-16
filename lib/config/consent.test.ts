import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONSENT_REQUIRED_WITHIN_YEARS,
  birthYearOptions,
  isPlausibleBirthYear,
  parentConsentRequired,
} from "./consent";

// P0-8. There are two copies of the under-13 rule — this module (so signup
// can warn someone before creating their account) and
// consent_required_for_birth_year() in migration 030 (which is the actual
// gate). The first test exists because two copies of an age rule that drift
// apart either lock a 14-year-old out of a product they paid for, or let a
// 12-year-old straight past the consent step. Both are silent.

const MIGRATION = readFileSync(
  join(__dirname, "..", "..", "supabase", "migrations", "030_under13_parent_consent.sql"),
  "utf8"
);

describe("the TypeScript rule matches the SQL rule", () => {
  it("compares against the same number of years", () => {
    // select p_birth_year is not null
    //    and (extract(year from current_date)::int - p_birth_year) <= 13;
    const match = MIGRATION.match(
      /extract\(year from current_date\)::int - p_birth_year\)\s*<=\s*(\d+)/
    );
    expect(match, "could not find the age comparison in migration 030").not.toBeNull();
    expect(Number(match![1])).toBe(CONSENT_REQUIRED_WITHIN_YEARS);
  });

  it("uses the same inclusive comparison, not a stricter one", () => {
    // `< 13` instead of `<= 13` would let anyone turning 13 this year
    // through without consent. Assert the operator itself.
    expect(MIGRATION).toMatch(/- p_birth_year\)\s*<=\s*13/);
  });

  it("treats an unknown birth year the same way in both", () => {
    expect(MIGRATION).toMatch(/p_birth_year is not null/);
    expect(parentConsentRequired(null)).toBe(false);
    expect(parentConsentRequired(undefined)).toBe(false);
  });
});

describe("who needs a parent's consent", () => {
  const now = new Date("2026-11-14T12:00:00");

  it("asks for consent for anyone who could still be 12", () => {
    expect(parentConsentRequired(2013, now)).toBe(true); // 12 or 13 in 2026
    expect(parentConsentRequired(2015, now)).toBe(true);
    expect(parentConsentRequired(2020, now)).toBe(true);
  });

  it("does not ask once they are certainly 14 or older", () => {
    expect(parentConsentRequired(2012, now)).toBe(false); // 13 or 14 in 2026
    expect(parentConsentRequired(2009, now)).toBe(false);
    expect(parentConsentRequired(1980, now)).toBe(false);
  });

  it("rounds the one ambiguous year toward asking", () => {
    // Born 2013: turns 13 at some point in 2026. Before their birthday they
    // are 12. The rule treats the whole year as under-13 rather than
    // guessing which side of the birthday today is.
    expect(parentConsentRequired(2013, new Date("2026-01-01"))).toBe(true);
    expect(parentConsentRequired(2013, new Date("2026-12-31"))).toBe(true);
  });

  it("moves with the calendar", () => {
    expect(parentConsentRequired(2013, new Date("2027-06-01"))).toBe(false);
  });
});

describe("a typed birth year", () => {
  const now = new Date("2026-11-14T12:00:00");

  it("rejects the future, so nobody can age themselves out", () => {
    expect(isPlausibleBirthYear(2027, now)).toBe(false);
    expect(isPlausibleBirthYear(2026, now)).toBe(true);
  });

  it("rejects typos that would otherwise read as a child", () => {
    expect(isPlausibleBirthYear(19, now)).toBe(false);
    expect(isPlausibleBirthYear(216, now)).toBe(false);
    expect(isPlausibleBirthYear(1899, now)).toBe(false);
  });

  it("is not the same question as the age rule", () => {
    // "You haven't told us" must never be confused with "you are under 13".
    expect(isPlausibleBirthYear(null, now)).toBe(false);
    expect(parentConsentRequired(null, now)).toBe(false);
  });

  it("offers only plausible years, newest first", () => {
    const options = birthYearOptions(now);
    expect(options[0]).toBe(2026);
    expect(options.at(-1)).toBe(1936);
    expect(Math.max(...options)).toBe(2026);
    for (const y of options) expect(isPlausibleBirthYear(y, now)).toBe(true);
  });
});
