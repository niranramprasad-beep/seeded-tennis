import { describe, expect, it } from "vitest";
import { buildRosterPagesSql, classLabel, parseEmails, parseNameTitles, parseRosterPages } from "./roster-pages";
import { rosterUtrWhole, sortRoster, toRosterPlayer, type RosterRow } from "@/lib/db/roster";

// Invented people and schools only: the repo is public.
const csv = (rows: string[][]) => rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
const TEAMS = csv([
  ["Division", "Conference", "School", "Gender", "Head Coach", "Official Roster URL", "Last Verified"],
  ["D1", "X", "Example State University", "M", "Pat Example", "https://example.edu/roster", "2026-11-02"],
  ["D1", "X", "Other College", "W", "Sam Other", "https://other.example/roster", "2026-11-03"],
]);
const PLAYERS = csv([
  ["Division", "Gender", "School", "Player Name", "Player UTR Link", "Class Year", "UTR Rating", "Reliable? (Y/N)", "Roster Check", "Grad Year", "Hometown", "UTR Read Date"],
  ["D1", "M", "Example State University", "Alex Alpha", "https://utr.example/p/1", "Fr.", "12.50", "Y", "Matches official", "2030", "Town, ST", "2026-11-22"],
  ["D1", "M", "Example State University", "Bo Beta", "https://utr.example/p/2", "Senior", "13.10", "N", "UTR says Junior", "2027", "", ""],
  ["D1", "M", "Example State University", "Cy Gamma", "https://utr.example/p/3", "Junior", "12.00", "Y", "UTR only", "2028", "", "2026-11-22"],
  ["D1", "M", "Example State University", "Di Delta", "", "Sophomore", "11.00", "Y", "Matches official", "2029", "", "2026-11-22"],
  ["D1", "M", "Not Imported University", "Ed Eps", "https://utr.example/p/5", "Junior", "10.00", "Y", "Matches official", "2028", "", "2026-11-22"],
]);
const INFO = csv([
  ["Gender", "School", "Head Coach", "Head Coach Title", "Assistant Coaches (name — title; …)", "Published Staff Emails (name: email; …)", "Staff Email Source URL", "Coaches Page URL", "School Data Read Date"],
  ["M", "Example State University", "Pat Example", "Director of Tennis", "Robin Two — Assistant Coach; Kim Three – Volunteer Assistant", "Pat Example: pat@example.edu; Robin Two: not-an-email", "https://example.edu/staff", "https://example.edu/coaches", "2026-11-22"],
]);
const IMPORTED = new Set(["example-state-university-men", "other-college-women"]);
const parsed = () => parseRosterPages({ teamsCsv: TEAMS, playersCsv: PLAYERS, programInfoCsv: INFO, importedSlugs: IMPORTED });

describe("parseRosterPages — the roster by name (054, Niran 2026-11-22)", () => {
  it("lists only official-roster players of imported programs", () => {
    const names = parsed().players.map((p) => p.playerName);
    expect(names).toEqual(["Alex Alpha", "Bo Beta", "Di Delta"]); // "UTR only" and the non-imported team are out
  });

  it("keeps a rating only with its profile link, reliable only when the sheet says Y, and dates every row", () => {
    const [a, b, d] = parsed().players;
    expect(a).toMatchObject({ classLabel: "Freshman", gradYear: 2030, utr: 12.5, utrReliable: true, readDate: "2026-11-22" });
    expect(a).not.toHaveProperty("hometown");
    expect(b).toMatchObject({ utr: 13.1, utrReliable: false, readDate: "2026-11-02" }); // team's Last Verified
    expect(d).toMatchObject({ utr: null, utrReliable: false, utrProfileUrl: null });
  });

  it("staff: head + assistants with titles, an email only when well-formed and sourced, every row with its page", () => {
    const staff = parsed().staff.filter((s) => s.slug === "example-state-university-men");
    expect(staff.map((s) => [s.name, s.title, s.email, s.isHead])).toEqual([
      ["Pat Example", "Director of Tennis", "pat@example.edu", true],
      ["Robin Two", "Assistant Coach", null, false],
      ["Kim Three", "Volunteer Assistant", null, false],
    ]);
    expect(staff[0].sourceUrl).toBe("https://example.edu/staff");
    expect(staff[1].sourceUrl).toBe("https://example.edu/coaches");
  });

  it("a team with no Program Info row gets its head coach from Teams, sourced to its roster page", () => {
    const other = parsed().staff.filter((s) => s.slug === "other-college-women");
    expect(other).toEqual([
      { slug: "other-college-women", name: "Sam Other", title: "Head Coach", email: null, isHead: true, sourceUrl: "https://other.example/roster", readDate: "2026-11-03" },
    ]);
  });

  it("emits SQL that replaces each program's rows and refuses without 054", () => {
    const sql = buildRosterPagesSql(parsed(), [...IMPORTED]).join("\n");
    expect(sql).toMatch(/migration 054 is not on this database: refusing/);
    expect(sql).toMatch(/delete from public\.program_roster/);
    expect(sql).toMatch(/delete from public\.program_staff/);
    expect(sql).not.toMatch(/Cy Gamma|Ed Eps/);
    expect(buildRosterPagesSql({ players: [], staff: [] }, [])).toEqual([]);
  });
});

describe("small parsers", () => {
  it("class labels", () => {
    expect(classLabel("Fr.")).toBe("Freshman");
    expect(classLabel("GR")).toBe("Graduate");
    expect(classLabel("RS-Jr")).toBe("RS-Jr");
    expect(classLabel("")).toBeNull();
  });
  it("name — title lists and email lists", () => {
    expect(parseNameTitles("A B — Coach; C D - Volunteer")).toEqual([
      { name: "A B", title: "Coach" },
      { name: "C D", title: "Volunteer" },
    ]);
    expect([...parseEmails("A B: a@x.edu; C: nope")]).toEqual([["A B", "a@x.edu"]]);
  });
  it("roster order: reliable by rating, then unreliable, then unrated", () => {
    const p = (name: string, utr: number | null, utrReliable: boolean): RosterRow => ({
      name, utr, utrReliable, classLabel: null, gradYear: null, utrProfileUrl: utr ? "https://u" : null, readDate: "2026-11-22",
    });
    expect(sortRoster([p("u", null, false), p("lo", 11, true), p("nr", 14, false), p("hi", 13, true)]).map((x) => x.name)).toEqual(["hi", "lo", "nr", "u"]);
  });
  it("within a whole number the order is by name, never by the exact rating", () => {
    const p = (name: string, utr: number): RosterRow => ({
      name, utr, utrReliable: true, classLabel: null, gradYear: null, utrProfileUrl: "https://u", readDate: "2026-11-22",
    });
    // 13.9 and 13.1 share "13.xx": alphabetical, so the top row is not the top rating.
    expect(sortRoster([p("Zed", 13.9), p("Amy", 13.1), p("Bo", 12.2)]).map((x) => x.name)).toEqual(["Amy", "Zed", "Bo"]);
  });
  // Niran, 2026-11-27: a college player's exact UTR never reaches a page or
  // its source — only the whole-number band does.
  it("a roster player's rating leaves the server as a whole-number band only", () => {
    expect(rosterUtrWhole(12.37)).toBe(12);
    expect(rosterUtrWhole(12)).toBe(12);
    expect(rosterUtrWhole(9.99)).toBe(9);
    expect(rosterUtrWhole(null)).toBeNull();
    const out = toRosterPlayer({
      name: "A B", utr: 12.37, utrReliable: true, classLabel: "Sophomore", gradYear: 2028, utrProfileUrl: "https://app.utrsports.net/profiles/1", readDate: "2026-11-22",
    });
    expect(out.utrWhole).toBe(12);
    expect(out).not.toHaveProperty("utr");
    expect(out).not.toHaveProperty("hometown");
    expect(JSON.stringify(out)).not.toContain("12.37");
  });
});
