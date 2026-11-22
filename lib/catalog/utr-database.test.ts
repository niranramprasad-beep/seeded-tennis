import { describe, expect, it } from "vitest";
import {
  buildUtrDatabaseSql,
  MIN_RATED_PLAYERS,
  onOfficialRoster,
  parseCsv,
  parseUtrDatabase,
  quantileInclusive,
  RANGE_RULE,
  rangeSource,
  rating,
  round2,
  UtrDatabaseError,
} from "./utr-database";

// Fake from top to bottom: "Test University", "Player N", example.com links.
// The real export names real students and never enters the repo.
const SEASON = { shown: "2026-27", startYear: 2026 };

const TEAMS_HEADER =
  "Division,Conference,School,Team UTR Link,Gender,Head Coach,Team Avg UTR (reliable only),Team Avg UTR (all)," +
  "# Players Excluded,Leaving by Spring 2027,Leaving by Spring 2028,Official Roster URL,Last Verified";
const PLAYERS_HEADER =
  "Division,Gender,School,Team UTR Link,Player Name,Player UTR Link,Class Year,UTR Rating,Reliable? (Y/N)," +
  "Exclusion Note,Roster Check,Grad Year,Doubles UTR,Doubles Reliable? (Y/N)";

function team(school: string, g: string, avg: string, l27: number, l28: number, date = "2026-11-02") {
  return `D1,Test Conf,${school},https://example.com/team/${school.length},${g},Coach ${school.length},${avg},${avg},0,${l27},${l28},https://example.com/${encodeURIComponent(school)}/roster,${date}`;
}
function player(school: string, g: string, n: number, utr: string, reliable: string, grad: string, check = "Matches official") {
  return `D1,${g},${school},https://example.com/team,Player ${n},https://example.com/profiles/${n},Junior,${utr},${reliable},"note, with comma",${check},${grad},${utr},Y`;
}

// Test University (M): 6 official players, 5 reliable numeric ratings
// (10, 11, 12, 13, 14 -> mean 12.00, lower quartile 11.00, median 12.00),
// one unreliable, plus one UTR-only player who must be ignored everywhere.
const ROSTER_A = [
  player("Test University", "M", 1, "10.00", "Y", "2027"),
  player("Test University", "M", 2, "11.00", "Y", "2027"),
  player("Test University", "M", 3, "12.00", "Y", "2028"),
  player("Test University", "M", 4, "13.00", "Y", "2029"),
  player("Test University", "M", 5, "14.00", "Y", "2030"),
  player("Test University", "M", 6, "15.90", "N", "2030"),
  player("Test University", "M", 7, "16.00", "Y", "2027", "UTR only"),
];

function parse(teams: string[], players: string[]) {
  return parseUtrDatabase([TEAMS_HEADER, ...teams].join("\n"), [PLAYERS_HEADER, ...players].join("\r\n"), SEASON);
}

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, embedded commas/newlines and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi""","x\ny"\r\n1,2,3,4\n\n')).toEqual([
      ["a", "b, c", 'say "hi"', "x\ny"],
      ["1", "2", "3", "4"],
    ]);
  });
  it("refuses a file that ends inside a quote", () => {
    expect(() => parseCsv('a,"b')).toThrow(UtrDatabaseError);
  });
});

describe("the range rule (owner's decision 2026-11-21: lower quartile / median / top)", () => {
  it("uses the inclusive quartile, the one Google Sheets' QUARTILE() uses", () => {
    // =QUARTILE({1,2,3,4}, 1) is 1.75 in Sheets; the exclusive method gives 1.25.
    expect(quantileInclusive([4, 1, 3, 2], 0.25)).toBe(1.75);
    expect(quantileInclusive([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(quantileInclusive([9.1, 7.58, 9.9, 10.67, 9.43, 9.69, 9.75, 9.55, 10.2], 0.25)).toBeCloseTo(9.43, 10);
    expect(quantileInclusive([5], 0.25)).toBe(5);
  });
  it("one low outlier no longer sets the floor", () => {
    const team = [7.58, 9.4, 9.5, 9.6, 9.7, 9.8, 10.0, 10.67];
    expect(Math.min(...team)).toBe(7.58);
    expect(quantileInclusive(team, 0.25)).toBeGreaterThan(9.4);
  });
  it("the floor never exceeds the middle, even when the mean would", () => {
    // A low outlier drags the MEAN below the lower quartile (the reason the
    // middle is the median): 13.41 > mean 13.36 on one real team.
    const team = [11.53, 13.41, 13.41, 13.6, 13.7, 13.94, 13.94];
    expect(quantileInclusive(team, 0.25)).toBeGreaterThan(team.reduce((a, b) => a + b) / team.length);
    expect(quantileInclusive(team, 0.25)).toBeLessThanOrEqual(quantileInclusive(team, 0.5));
  });
  it("rounds half a cent up, without float noise", () => {
    expect(round2(12.675)).toBe(12.68);
    expect(round2(9.4325)).toBe(9.43);
    expect(round2(1.005)).toBe(1.01);
  });
  it("names the rule where the script prints it", () => {
    expect(RANGE_RULE).toMatch(/lower quartile.*QUARTILE.*median.*highest/);
  });
});

describe("value rules", () => {
  it("reads only a single 1.00–16.50 rating", () => {
    expect(rating("13.52")).toBe(13.52);
    expect(rating("7.25-9.25")).toBeNull();
    expect(rating("")).toBeNull();
    expect(rating("0.5")).toBeNull();
    expect(rating("17")).toBeNull();
  });
  it("rule 1: UTR-only players and announced signings are not on the official roster", () => {
    expect(onOfficialRoster("Matches official")).toBe(true);
    expect(onOfficialRoster("UTR says Junior")).toBe(true);
    expect(onOfficialRoster("UTR only")).toBe(false);
    expect(onOfficialRoster("UTR only; may be a second profile")).toBe(false);
    expect(onOfficialRoster("Signing announced in local news, not on roster page yet")).toBe(false);
  });
});

describe("parseUtrDatabase", () => {
  it("counts official-roster players by grad year and builds the range by the written rule", () => {
    const r = parse([team("Test University", "M", "12.00", 2, 1)], ROSTER_A);
    expect(r.held).toEqual([]);
    expect(r.programs).toHaveLength(1);
    const p = r.programs[0];
    expect(p).toMatchObject({
      slug: "test-university-men",
      gender: "men",
      division: "D1",
      conference: "Test Conf",
      playersListed: 6,
      unknownClassCount: 0,
      classCounts: { 2027: 2, 2028: 1, 2029: 1, 2030: 2 },
      finalYearCount: 2,
      seasonShown: "2026-27",
      sourceDate: "2026-11-02",
    });
    expect(r.ranges).toEqual([
      {
        slug: "test-university-men",
        low: 11,
        middle: 12,
        high: 14,
        ratedPlayers: 5,
        sourceUrl: "https://example.com/team/15",
        sourceDate: "2026-11-02",
      },
    ]);
    expect(r.playerRowsRead).toBe(7);
    expect(r.playerRowsCounted).toBe(6);
  });

  it("rule 2: holds the whole team when the sheet's leaving count disagrees", () => {
    const r = parse([team("Test University", "M", "12.00", 3, 1)], ROSTER_A);
    expect(r.programs).toHaveLength(0);
    expect(r.ranges).toHaveLength(0);
    expect(r.held[0]).toMatchObject({ scope: "team" });
    expect(r.held[0].reason).toContain('"Leaving by Spring 2027" says 3, the player rows give 2');
  });

  it("rule 3: holds only the range when the sheet's average disagrees", () => {
    const r = parse([team("Test University", "M", "12.40", 2, 1)], ROSTER_A);
    expect(r.programs).toHaveLength(1);
    expect(r.ranges).toHaveLength(0);
    expect(r.held).toEqual([
      expect.objectContaining({ scope: "range", reason: expect.stringContaining("average 12.00") }),
    ]);
  });

  it(`rule 4: fewer than ${MIN_RATED_PLAYERS} reliable numeric ratings -> no range`, () => {
    const players = [
      player("Small U", "W", 1, "9.00", "Y", "2027"),
      player("Small U", "W", 2, "9.50", "Y", "2028"),
      player("Small U", "W", 3, "7.25-9.25", "N", "2029"),
      player("Small U", "W", 4, "", "N", "2029"),
    ];
    const r = parse([team("Small U", "W", "9.25", 1, 1)], players);
    expect(r.programs).toHaveLength(1);
    expect(r.ranges).toHaveLength(0);
    expect(r.held[0]).toMatchObject({ scope: "range", reason: expect.stringContaining("2 reliable rating(s)") });
  });

  it("rule 5: a team with no players is held whole", () => {
    const r = parse([team("Empty U", "W", "", 0, 0, "2026-11-08")], []);
    expect(r.programs).toHaveLength(0);
    expect(r.held).toEqual([expect.objectContaining({ scope: "team", reason: "no players entered yet" })]);
  });

  it("an unreadable grad year is counted as unknown, never guessed", () => {
    const r = parse(
      [team("Test University", "M", "12.00", 2, 1)],
      [...ROSTER_A, player("Test University", "M", 8, "8.00", "N", "")]
    );
    expect(r.programs[0].unknownClassCount).toBe(1);
    expect(r.programs[0].playersListed).toBe(7);
  });

  it("refuses a missing column, a duplicate team and an unknown division", () => {
    expect(() => parseUtrDatabase("School,Gender\nX,M", PLAYERS_HEADER, SEASON)).toThrow(/missing column/);
    expect(() => parse([team("Test University", "M", "12.00", 2, 1), team("Test University", "M", "12.00", 2, 1)], ROSTER_A)).toThrow(
      /appears twice/
    );
    expect(() => parse([team("Test University", "M", "12.00", 2, 1).replace(/^D1/, "D9")], ROSTER_A)).toThrow(/division/);
  });

  it("notes player rows that have no team row instead of dropping them silently", () => {
    const r = parse([team("Test University", "M", "12.00", 2, 1)], [...ROSTER_A, player("Other U", "W", 9, "9.00", "Y", "2027")]);
    expect(r.warnings.join("\n")).toContain("Other U (women)");
  });
});

describe("buildUtrDatabaseSql", () => {
  const data = parse([team("Test University", "M", "12.00", 2, 1)], ROSTER_A);
  const sql = buildUtrDatabaseSql(data);

  it("never carries a player's name, profile link or note", () => {
    const all = sql + JSON.stringify(data);
    expect(all).not.toMatch(/Player \d/);
    expect(all).not.toContain("/profiles/");
    expect(all).not.toContain("note, with comma");
  });

  it("refuses to run where programs is empty (production) and is one transaction", () => {
    expect(sql).toMatch(/^-- Generated by scripts\/import-utr-database\.ts\. STAGING ONLY/);
    expect(sql).toContain("if not exists (select 1 from public.programs) then");
    expect(sql.trim().startsWith("--")).toBe(true);
    expect(sql).toContain("begin;");
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });

  it("writes ranges as hand-curated, with the source line, insert-only and idempotent", () => {
    expect(sql).toContain("'hand_curated'");
    expect(sql).toContain(rangeSource("2026-27").replace(/'/g, "''"));
    expect(sql).toContain("where not exists (select 1 from public.team_ranges t");
    expect(sql).not.toMatch(/delete from public\.team_ranges|update public\.team_ranges/);
    expect(sql).not.toMatch(/delete from public\.programs\b/);
  });

  it("the production file drops only the empty-table seatbelt", () => {
    const prod = buildUtrDatabaseSql(data, "production");
    expect(prod).toMatch(/^-- Generated by scripts\/import-utr-database\.ts --target production/);
    expect(prod).not.toContain("STAGING ONLY");
    expect(prod).not.toContain("if not exists (select 1 from public.programs) then");
    expect(prod).toContain("migration 048 is not on this database");
    // Everything after the guard block is byte-identical to the staging file.
    const body = (s: string) => s.slice(s.indexOf("end $$;"));
    expect(body(prod)).toBe(body(sql));
    expect(prod.trim().endsWith("commit;")).toBe(true);
  });

  it("stamps each program with its own verified date", () => {
    expect(sql).toContain("'test-university-men'");
    expect(sql).toContain("'2026-11-02')");
  });
});
