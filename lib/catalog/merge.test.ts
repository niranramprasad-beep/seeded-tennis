import { describe, expect, it } from "vitest";
import { mergeCatalog, shortSchoolName } from "./merge";
import type { ImportedProgram, TeamRange } from "./programs";
import type { School } from "@/lib/types";
import { classifySchoolFit, fitBasis } from "@/lib/school-fit";
import { teamRangeNote, schoolRangeNote, utrSourceLabel, UTR_RANGE_SOURCE_LABEL } from "@/lib/db/schools";

const NOW = new Date(2026, 10, 22);

const legacy: School = {
  id: "vanderbilt-m",
  slug: "vanderbilt-m",
  name: "Vanderbilt University",
  shortName: "Vanderbilt",
  city: "Nashville",
  state: "TN",
  conference: "SEC",
  division: "D1",
  gender: "men",
  primaryColor: "#000",
  secondaryColor: "#000",
  textColor: "#fff",
  avgRosterUTR: 12.6,
  minCompetitiveUTR: 11.4,
  usNewsRanking: 18,
};

function range(over: Partial<TeamRange> = {}): TeamRange {
  return {
    low: 12.94,
    middle: 13.34,
    high: 13.86,
    sourceType: "hand_curated",
    source: "College Tennis UTR Database (official 2026-27 roster checked against each player's UTR profile; reliable singles ratings only)",
    sourceUrl: "https://app.utrsports.net/college/979",
    sourceDate: "2026-11-22",
    createdAt: "2026-11-22T23:50:00Z",
    ...over,
  };
}

function program(over: Partial<ImportedProgram> = {}): ImportedProgram {
  return {
    id: "p1",
    slug: "vanderbilt-university-men",
    school: "Vanderbilt University",
    gender: "men",
    division: "D1",
    conference: "SEC",
    rosterUrl: "https://vucommodores.com/sports/mten/roster?view=table",
    seasonShown: "2026-27",
    seasonStartYear: 2026,
    playersListed: 8,
    unknownClassCount: 0,
    sourceDate: "2026-11-22",
    sourceUrl: null,
    classCounts: [],
    ranges: [range()],
    details: null,
    ...over,
  };
}

describe("mergeCatalog — the spreadsheet sync", () => {
  it("rule 2: a legacy school takes the sheet's floor (Q1) and middle (median), keeping its slug and facts", () => {
    const { schools, mergedProgramSlugs } = mergeCatalog([legacy], [program()], NOW);
    expect(schools).toHaveLength(1);
    const s = schools[0];
    expect(s.slug).toBe("vanderbilt-m"); // saved targets keep working
    expect(s.usNewsRanking).toBe(18);
    expect(s.city).toBe("Nashville");
    expect(s.minCompetitiveUTR).toBe(12.94);
    expect(s.avgRosterUTR).toBe(13.34);
    expect(s.utrRange).toMatchObject({ low: 12.94, middle: 13.34, high: 13.86, sourceDate: "2026-11-22" });
    expect(s.utrRange!.source).toMatch(/^Hand-curated from public sources: College Tennis UTR Database/);
    expect(mergedProgramSlugs.has("vanderbilt-university-men")).toBe(true);
    // The legacy array itself is not mutated.
    expect(legacy.minCompetitiveUTR).toBe(11.4);
    expect(legacy.utrRange).toBeUndefined();
  });

  it("rule 3: any other rated program joins with its own slug, no invented US News rank, location only from Program Info", () => {
    const bama = program({
      id: "p2",
      slug: "university-of-alabama-men",
      school: "University of Alabama",
      ranges: [range({ low: 12.5, middle: 12.63, high: 13.26 })],
    });
    const { schools } = mergeCatalog([legacy], [bama], NOW);
    expect(schools).toHaveLength(2);
    const added = schools[1];
    expect(added.slug).toBe("university-of-alabama-men");
    expect(added.shortName).toBe("Alabama");
    expect(added.usNewsRanking).toBeNull();
    expect(added.city).toBeNull();
    expect(added.state).toBeNull();
    expect(added.minCompetitiveUTR).toBe(12.5);
    expect(added.avgRosterUTR).toBe(12.63);

    const withInfo = mergeCatalog(
      [legacy],
      [
        {
          ...bama,
          details: {
            city: "Tuscaloosa",
            state: "AL",
            costOfAttendanceUsd: 33924,
            coaYear: "2025-26",
            coaSourceUrl: "https://collegescorecard.ed.gov/school/?100751",
            acceptanceRate: 0.7665,
            undergradEnrollment: 33227,
            scorecardSourceUrl: "https://collegescorecard.ed.gov/school/?100751",
            coachesPageUrl: null,
            questionnaireUrl: null,
            readDate: "2026-11-22",
          },
        },
      ],
      NOW
    ).schools[1];
    expect(withInfo.city).toBe("Tuscaloosa");
    expect(withInfo.state).toBe("AL");
    expect(withInfo.details).toMatchObject({ costOfAttendanceUsd: 33924, acceptanceRate: 0.7665 });
    expect(withInfo.details).not.toHaveProperty("city");
  });

  it("rule 1: an unrated, invalid or stale range changes nothing and adds nothing", () => {
    for (const ranges of [
      [],
      [range({ low: 14, middle: 13 })], // low above middle
      [range({ sourceDate: "2025-01-01" })], // over a year old
      [range({ source: "x" })], // no real source
    ]) {
      const { schools, mergedProgramSlugs } = mergeCatalog([legacy], [program({ ranges }), program({ slug: "new-men", school: "New University", ranges })], NOW);
      expect(schools).toEqual([legacy]);
      expect(mergedProgramSlugs.size).toBe(0);
    }
  });

  it("rule 4: the band uses exactly the merged floor and middle (one fit-band path)", () => {
    const s = mergeCatalog([legacy], [program()], NOW).schools[0];
    const basis = (utr: number) =>
      fitBasis(utr, {
        utrHistory: [
          { date: new Date(2026, 0, 1), utr },
          { date: new Date(2026, 5, 1), utr },
          { date: new Date(2026, 10, 1), utr },
        ],
        graduationYear: 2027,
        now: NOW,
      });
    // Under the OLD estimate 12.0 was Target (floor 11.4); against the
    // checked roster's floor 12.94 it is not.
    expect(classifySchoolFit(basis(12.0), legacy)).toBe("target");
    expect(classifySchoolFit(basis(12.0), s)).not.toBe("target");
    expect(classifySchoolFit(basis(13.34), s)).toBe("likely");
    expect(classifySchoolFit(basis(13.0), s)).toBe("target");
  });

  it("never adds a program outside D1/D2/D3 or one whose slug would shadow a legacy page", () => {
    const naia = program({ slug: "x-men", school: "X College", division: "NAIA" });
    const clash = program({ slug: "vanderbilt-m", school: "Some Other School", conference: "Big Ten" });
    expect(mergeCatalog([legacy], [naia, clash], NOW).schools).toHaveLength(1);
  });
});

describe("shortSchoolName", () => {
  it.each([
    ["University of Alabama", "Alabama"],
    ["Auburn University", "Auburn"],
    ["University of Texas (Austin)", "Texas"],
    ["University of Miami (Florida)", "Miami"],
    ["Texas A&M University", "Texas A&M"],
    ["Georgia Tech", "Georgia Tech"],
    ["Boston College", "Boston College"],
  ])("%s -> %s", (name, short) => expect(shortSchoolName(name)).toBe(short));
});

describe("source labels follow each school", () => {
  const checked = mergeCatalog([legacy], [program()], NOW).schools[0];

  it("a checked school names its source and date; an estimate still says so", () => {
    expect(utrSourceLabel(legacy)).toBe(UTR_RANGE_SOURCE_LABEL);
    expect(utrSourceLabel(checked)).toMatch(/College Tennis UTR Database.*Nov 22, 2026$/);
    expect(schoolRangeNote(legacy)).toBe("The team range is our estimate, not a published roster.");
    expect(schoolRangeNote(checked)).toMatch(/lower quartile.*median/);
  });

  it("the list note is worded for the mix on screen", () => {
    expect(teamRangeNote([legacy])).toBe("Team UTR ranges are our estimates, not published rosters.");
    expect(teamRangeNote([checked])).toMatch(/^Team UTR ranges come from a hand check/);
    expect(teamRangeNote([checked, legacy])).toMatch(/marked “Checked”.*the rest are our estimates/);
  });
});
