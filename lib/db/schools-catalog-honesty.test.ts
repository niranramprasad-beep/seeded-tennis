import { describe, expect, it } from "vitest";
import { getSchools, staffDirectorySearchQuery, staffDirectorySearchUrl } from "./schools";

// Regression guard for P0-3. The static catalog used to carry, per school, an
// invented head-coach name, an invented coach email at the real university's
// real domain, invented "recent recruits" (named minors), an invented
// conference rank, an invented program blurb and an `https://example.com/...`
// recruiting URL — all of it rendered to users as fact, and some of it
// asserted to real college coaches by the outreach draft.
//
// These tests exist so that reintroducing any of it fails CI instead of
// shipping. If a future roster import (P1-DATA-1) adds real, sourced coach
// contacts, that change has to come with a per-school source and date and a
// deliberate edit here — not a quiet re-add.
describe("school catalog contains no invented data", () => {
  const FORBIDDEN_KEYS = [
    "coachName",
    "coachEmail",
    "recruitingPageUrl",
    "recentRecruits",
    "programNote",
    "conferenceRank",
  ];

  it("exposes no coach, recruit, rank or recruiting-URL fields", async () => {
    const schools = await getSchools();
    expect(schools.length).toBeGreaterThan(0);

    const offenders = schools.flatMap((school) =>
      FORBIDDEN_KEYS.filter((key) => key in school).map((key) => `${school.slug}.${key}`)
    );
    expect(offenders).toEqual([]);
  });

  it("contains no email address in any field", async () => {
    const schools = await getSchools();
    // Any "x@y.z" anywhere in a serialized school entry.
    const emailish = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

    const offenders = schools
      .filter((school) => emailish.test(JSON.stringify(school)))
      .map((school) => school.slug);
    expect(offenders).toEqual([]);
  });

  it("contains no example.com or other placeholder URL", async () => {
    const schools = await getSchools();
    const offenders = schools
      .filter((school) => /example\.(com|org|net|test)|https?:\/\//.test(JSON.stringify(school)))
      .map((school) => school.slug);
    expect(offenders).toEqual([]);
  });

  it("carries only the fields we can stand behind", async () => {
    const schools = await getSchools();
    // An allowlist, not a denylist: a new invented field with a name nobody
    // predicted still fails this.
    const ALLOWED = new Set([
      "id",
      "slug",
      "name",
      "shortName",
      "city",
      "state",
      "conference",
      "division",
      "gender",
      "primaryColor",
      "secondaryColor",
      "textColor",
      "avgRosterUTR",
      "minCompetitiveUTR",
      "usNewsRanking",
    ]);

    const unexpected = Array.from(
      new Set(schools.flatMap((school) => Object.keys(school).filter((k) => !ALLOWED.has(k))))
    );
    expect(unexpected).toEqual([]);
  });
});

describe("staff directory link", () => {
  it("searches for the real program rather than guessing an athletics URL", () => {
    const query = staffDirectorySearchQuery({
      name: "Test University",
      gender: "women",
    });
    expect(query).toBe("Test University women's tennis staff directory");

    const mens = staffDirectorySearchQuery({ name: "Test University", gender: "men" });
    expect(mens).toBe("Test University men's tennis staff directory");
  });

  it("builds a URL-encoded search, never a per-school stored link", () => {
    const url = staffDirectorySearchUrl({ name: "Test University", gender: "men" });
    expect(url.startsWith("https://www.google.com/search?q=")).toBe(true);
    expect(url).not.toContain(" ");
    // The whole point: nothing here claims to be the school's own site.
    expect(url).not.toContain("example.com");
  });
});
