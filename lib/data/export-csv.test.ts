import { describe, expect, it } from "vitest";
import { csvEscape, buildAccountDataCsv } from "./export-csv";
import { emptyPlayer } from "./user";

describe("csvEscape", () => {
  it("leaves plain values bare", () => {
    expect(csvEscape("Duke")).toBe("Duke");
    expect(csvEscape(9.5)).toBe("9.5");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("quotes and escapes values containing commas, quotes, or newlines", () => {
    expect(csvEscape("Smith, Jane")).toBe('"Smith, Jane"');
    expect(csvEscape('She said "hi"')).toBe('"She said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildAccountDataCsv", () => {
  const player = { ...emptyPlayer, name: "Maya Chen" };

  it("includes all 4 section headers even with no data", () => {
    const csv = buildAccountDataCsv({
      player,
      targetSchools: [],
      matches: [],
      utrEntries: [],
      outreach: {},
    });
    expect(csv).toContain("Schools");
    expect(csv).toContain("Results");
    expect(csv).toContain("UTR history");
    expect(csv).toContain("Outreach");
    expect(csv).toContain("Maya Chen");
  });

  it("renders a school row", () => {
    const csv = buildAccountDataCsv({
      player,
      targetSchools: [
        {
          id: "1",
          slug: "duke-w",
          name: "Duke",
          shortName: "Duke",
          city: "Durham",
          state: "NC",
          conference: "ACC",
          division: "D1",
          gender: "women",
          primaryColor: "#000",
          secondaryColor: "#fff",
          textColor: "#fff",
          avgRosterUTR: 12,
          minCompetitiveUTR: 10,
          usNewsRanking: 10,
        },
      ],
      matches: [],
      utrEntries: [],
      outreach: {},
    });
    expect(csv).toContain("Duke,duke-w,ACC,NC,D1");
  });
});
