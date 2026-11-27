import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSchools } from "@/lib/db/schools";
import {
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
  SCHOOL_PAGE_PITCH,
  SCHOOL_PAGE_PITCH_SHORT,
  schoolPageDescription,
  schoolPageTitle,
} from "./school-meta";

// Bug hunt 2026-11-26, BUG-011 (the school pages): search results cut a title
// at about 60 characters and a description at about 155. A school page's
// description was the place line plus a 106-character closing sentence, 156
// to 189 characters on 67 of the 68 pages built without the imported
// programs, and long school names made titles of 61 to 67 characters. The
// template now drops words it already had and writes nothing new: the brand
// suffix from a title that would be cut anyway, and, from a description that
// would be cut anyway, the closing sentence's second half. (The other pages'
// descriptions need rewording, which is Niran's: see the fix handoff.)

const ROOT = join(__dirname, "..", "..");

describe("schoolPageTitle", () => {
  it("is '<school> <men's|women's> tennis — Seeded' while that fits", () => {
    expect(schoolPageTitle("Duke University", "Women's")).toBe("Duke University women's tennis — Seeded");
  });

  it("drops the ' — Seeded' suffix when the full title would be cut", () => {
    const long = "University of North Carolina at Chapel Hill";
    expect(`${long} men's tennis — Seeded`.length).toBeGreaterThan(META_TITLE_MAX);
    expect(schoolPageTitle(long, "Men's")).toBe("University of North Carolina at Chapel Hill men's tennis");
  });

  it("keeps a title of exactly the limit whole, and drops the suffix from one character more", () => {
    const suffix = " men's tennis — Seeded";
    const name = "X".repeat(META_TITLE_MAX - suffix.length);
    expect(schoolPageTitle(name, "Men's")).toBe(`${name}${suffix}`);
    expect(schoolPageTitle(`${name}X`, "Men's")).toBe(`${name}X men's tennis`);
  });
});

describe("schoolPageDescription", () => {
  it("the short closing sentence is the first clause of the full one, word for word", () => {
    expect(SCHOOL_PAGE_PITCH.startsWith(SCHOOL_PAGE_PITCH_SHORT.slice(0, -1))).toBe(true);
    expect(SCHOOL_PAGE_PITCH_SHORT.endsWith(".")).toBe(true);
  });

  it("keeps the whole closing sentence while the description fits", () => {
    const d = schoolPageDescription({ name: "Duke", programType: "Women's", place: ["D1", "ACC", "Durham", "NC"] });
    expect(d).toBe(`Duke women's tennis: D1, ACC, Durham, NC. ${SCHOOL_PAGE_PITCH}`);
    expect(d.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it("cuts the closing sentence to its first clause when the whole would be cut by search results", () => {
    const input = { name: "Duke University", programType: "Women's", place: ["D1", "ACC", "Durham", "NC"] };
    expect(`Duke University women's tennis: D1, ACC, Durham, NC. ${SCHOOL_PAGE_PITCH}`.length).toBeGreaterThan(META_DESCRIPTION_MAX);
    const d = schoolPageDescription(input);
    expect(d).toBe(`Duke University women's tennis: D1, ACC, Durham, NC. ${SCHOOL_PAGE_PITCH_SHORT}`);
    expect(d.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it("keeps only the place line when even the short sentence would not fit", () => {
    const tail = " men's tennis: D1, ACC, Chapel Hill, NC.";
    const input = { name: "N".repeat(120 - tail.length), programType: "Men's", place: ["D1", "ACC", "Chapel Hill", "NC"] };
    const first = `${input.name}${tail}`;
    expect(first.length).toBe(120);
    expect(`${first} ${SCHOOL_PAGE_PITCH_SHORT}`.length).toBeGreaterThan(META_DESCRIPTION_MAX);
    expect(schoolPageDescription(input)).toBe(first);
  });
});

describe("every school page in the catalogue", () => {
  it("has a title and a description inside the search limits", async () => {
    const schools = await getSchools();
    expect(schools.length).toBeGreaterThan(10);
    const over: string[] = [];
    for (const s of schools) {
      const programType = s.gender === "women" ? "Women's" : "Men's";
      const place = [s.division, s.conference, s.city, s.state].filter(Boolean) as string[];
      const title = schoolPageTitle(s.name, programType);
      const description = schoolPageDescription({ name: s.name, programType, place });
      if (title.length > META_TITLE_MAX) over.push(`${s.slug}: title ${title.length}`);
      if (description.length > META_DESCRIPTION_MAX) over.push(`${s.slug}: description ${description.length}`);
    }
    expect(over).toEqual([]);
  });
});

describe("the school page template", () => {
  it("builds its metadata through the helpers, not by hand", () => {
    const src = readFileSync(join(ROOT, "app", "schools", "[slug]", "page.tsx"), "utf8");
    expect(src).toMatch(/schoolPageTitle\(/);
    expect(src).toMatch(/schoolPageDescription\(/);
    expect(src).not.toMatch(/See how your UTR compares to the team's range/);
  });
});
