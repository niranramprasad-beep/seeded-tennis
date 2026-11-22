import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getSchoolsLite } from "@/lib/db/schools";
import { legacyMatchFor, schoolNameKey, withoutLegacyDuplicates, type LegacyLike } from "./legacy-match";
import { parseRosterFile } from "./roster-counts";

const legacy = (slug: string, name: string, gender: "men" | "women", conference: string): LegacyLike => ({
  slug,
  name,
  gender,
  conference,
});

describe("schoolNameKey", () => {
  it("drops filler words so short and full names agree", () => {
    expect(schoolNameKey("University of Chicago")).toBe(schoolNameKey("Chicago"));
    expect(schoolNameKey("Johns Hopkins University")).toBe(schoolNameKey("Johns Hopkins"));
    expect(schoolNameKey("Middlebury College")).toBe(schoolNameKey("Middlebury"));
    expect(schoolNameKey("Dartmouth College")).toBe(schoolNameKey("Dartmouth"));
  });
  it("needs an alias only where the short name is not a substring", () => {
    expect(schoolNameKey("Penn")).toBe(schoolNameKey("University of Pennsylvania"));
    // The conference sites' own abbreviations, from the expected-programs list.
    expect(schoolNameKey("Conn. College")).toBe(schoolNameKey("Connecticut College"));
    expect(schoolNameKey("UNCW")).toBe(schoolNameKey("UNC Wilmington"));
    // The UTR database's ACC name vs the legacy catalog's.
    expect(schoolNameKey("University of North Carolina")).toBe(
      schoolNameKey("University of North Carolina at Chapel Hill")
    );
    expect(schoolNameKey("University of North Carolina")).not.toBe(schoolNameKey("UNC Wilmington"));
  });
  it("keeps different schools different", () => {
    const keys = ["Washington College", "Washington and Lee", "Washington St. Louis", "Penn State", "Penn"].map(
      schoolNameKey
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("legacyMatchFor", () => {
  const catalog = [
    legacy("middlebury-w", "Middlebury College", "women", "NESCAC"),
    legacy("penn-m", "University of Pennsylvania", "men", "Ivy League"),
  ];
  it("matches the same school, gender and conference", () => {
    expect(legacyMatchFor({ school: "Middlebury", gender: "women", conference: "NESCAC" }, catalog)?.slug).toBe(
      "middlebury-w"
    );
    expect(legacyMatchFor({ school: "Penn", gender: "men", conference: "Ivy League" }, catalog)?.slug).toBe("penn-m");
  });
  it("does not match the other gender or another conference", () => {
    expect(legacyMatchFor({ school: "Middlebury", gender: "men", conference: "NESCAC" }, catalog)).toBeNull();
    expect(legacyMatchFor({ school: "Penn", gender: "women", conference: "Ivy League" }, catalog)).toBeNull();
    expect(legacyMatchFor({ school: "Middlebury", gender: "women", conference: "UAA" }, catalog)).toBeNull();
  });
  it("refuses to pick when two catalog entries would match", () => {
    const twice = [...catalog, legacy("middlebury-w-2", "Middlebury", "women", "NESCAC")];
    expect(legacyMatchFor({ school: "Middlebury", gender: "women", conference: "NESCAC" }, twice)).toBeNull();
  });
});

describe("the real roster file against the real 68-program catalog", async () => {
  const real = parseRosterFile(
    readFileSync(join(__dirname, "..", "..", "docs", "data", "roster_counts_2026-27.tsv"), "utf8")
  );
  const catalog = await getSchoolsLite();

  it("finds exactly the 18 teams that are in both, so none is listed twice", () => {
    const matches = real.programs
      .map((p) => [p.slug, legacyMatchFor(p, catalog)?.slug ?? null] as const)
      .filter(([, l]) => l !== null);
    expect(Object.fromEntries(matches)).toEqual({
      "chicago-men": "chicago-m",
      "chicago-women": "chicago-w",
      "columbia-men": "columbia-m",
      "columbia-women": "columbia-w",
      "cornell-men": "cornell-m",
      "cornell-women": "cornell-w",
      "emory-men": "emory-m",
      "emory-women": "emory-w",
      "harvard-men": "harvard-m",
      "harvard-women": "harvard-w",
      "johns-hopkins-men": "johns-hopkins-m",
      "johns-hopkins-women": "johns-hopkins-w",
      "middlebury-men": "middlebury-m",
      "middlebury-women": "middlebury-w",
      "penn-men": "penn-m",
      "princeton-men": "princeton-m",
      "yale-men": "yale-m",
      "yale-women": "yale-w",
    });
    expect(withoutLegacyDuplicates(real.programs, catalog)).toHaveLength(real.programs.length - 18);
  });

  it("every catalog team in these ten conferences is either matched or not in the file", () => {
    const inFile = new Set([...real.programs, ...real.notRetrieved].map((p) => `${p.gender}|${schoolNameKey(p.school)}`));
    const conferences = new Set(real.programs.map((p) => p.conference));
    const unmatched = catalog
      .filter((s) => conferences.has(s.conference))
      .filter((s) => !real.programs.some((p) => legacyMatchFor(p, catalog)?.slug === s.slug))
      .map((s) => ({ slug: s.slug, inFile: inFile.has(`${s.gender}|${schoolNameKey(s.name)}`) }));
    // Brown men, Dartmouth men and Princeton women are in the file, but
    // their rosters were not retrieved, so nothing was imported for them.
    expect(unmatched).toEqual([
      { slug: "brown-m", inFile: true },
      { slug: "dartmouth-m", inFile: true },
      { slug: "princeton-w", inFile: true },
    ]);
  });

  it("no imported team shares a name with a catalog team under a different conference (a typo)", () => {
    const clashes = real.programs.filter((p) =>
      catalog.some(
        (s) => s.gender === p.gender && schoolNameKey(s.name) === schoolNameKey(p.school) && s.conference !== p.conference
      )
    );
    expect(clashes.map((p) => p.slug)).toEqual([]);
  });
});
