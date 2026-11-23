import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { acceptanceRate, buildProgramDetailsSql, parseProgramInfo, PROGRAM_INFO_COLUMNS } from "./program-info";
import { assemblePrograms, toProgramDetails, type DetailRow } from "@/lib/db/programs";

// Invented test rows (no real school's numbers are needed to test the rules).
const HEADER = [
  "Division",
  "Gender",
  "School",
  "Conference",
  "City",
  "State",
  "Head Coach",
  "Published Staff Emails (name: email; …)",
  "Coaches Page URL",
  "Recruiting Questionnaire URL",
  "Cost of Attendance (USD)",
  "COA Year",
  "COA Source URL",
  "Acceptance Rate",
  "Undergrad Enrollment",
  "Scorecard Source URL",
  "School Data Read Date",
  "Notes",
];
const csv = (...rows: string[][]) => [HEADER, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
const row = (over: Partial<Record<(typeof HEADER)[number], string>> = {}): string[] => {
  const base: Record<string, string> = {
    Division: "D1",
    Gender: "W",
    School: "Example State University",
    Conference: "Example Conference",
    City: "Exampleville",
    State: "EX",
    "Head Coach": "Pat Example",
    "Published Staff Emails (name: email; …)": "Pat Example: pat@example.edu",
    "Coaches Page URL": "https://example.edu/coaches",
    "Recruiting Questionnaire URL": "",
    "Cost of Attendance (USD)": "30000",
    "COA Year": "2025-26",
    "COA Source URL": "https://example.gov/school/1",
    "Acceptance Rate": "0.5",
    "Undergrad Enrollment": "20000",
    "Scorecard Source URL": "https://example.gov/school/1",
    "School Data Read Date": "2026-11-22",
    Notes: "free text",
  };
  return HEADER.map((h) => over[h] ?? base[h]);
};

describe("parseProgramInfo — the sheet's Program Info tab", () => {
  it("reads a fully sourced row", () => {
    const { details, dropped } = parseProgramInfo(csv(row()));
    expect(dropped).toEqual([]);
    expect(details).toEqual([
      {
        slug: "example-state-university-women",
        city: "Exampleville",
        state: "EX",
        costOfAttendanceUsd: 30000,
        coaYear: "2025-26",
        coaSourceUrl: "https://example.gov/school/1",
        acceptanceRate: 0.5,
        undergradEnrollment: 20000,
        scorecardSourceUrl: "https://example.gov/school/1",
        coachesPageUrl: "https://example.edu/coaches",
        questionnaireUrl: null,
        readDate: "2026-11-22",
      },
    ]);
  });

  it("drops a number that has no source, and says so", () => {
    const { details, dropped } = parseProgramInfo(
      csv(row({ "COA Source URL": "" }), row({ School: "Other University", "Scorecard Source URL": "not a url" }))
    );
    expect(details[0].costOfAttendanceUsd).toBeNull();
    expect(details[0].coaYear).toBeNull();
    expect(details[1].acceptanceRate).toBeNull();
    expect(details[1].undergradEnrollment).toBeNull();
    expect(dropped.join("\n")).toMatch(/cost of attendance has no COA year or source URL/);
    expect(dropped.join("\n")).toMatch(/no Scorecard source URL/);
  });

  it("refuses a row with no read date, and a sheet missing a column", () => {
    expect(parseProgramInfo(csv(row({ "School Data Read Date": "" }))).details).toEqual([]);
    expect(parseProgramInfo(csv(row({ "School Data Read Date": "2026-11-22 00:00:00" }))).details[0].readDate).toBe("2026-11-22");
    expect(() => parseProgramInfo("Division,Gender,School\nD1,W,X")).toThrow(/missing column/);
  });

  it("reads rates as fractions or percents, and refuses nonsense", () => {
    expect(acceptanceRate("0.242")).toBe(0.242);
    expect(acceptanceRate("24.2%")).toBe(0.242);
    expect(acceptanceRate("1.5")).toBeNull();
    expect(acceptanceRate("0")).toBeNull();
    expect(acceptanceRate("n/a")).toBeNull();
  });

  it("never reads a coach name, a coach email or the notes (owner's open decision; 053)", () => {
    for (const c of PROGRAM_INFO_COLUMNS) expect(c).not.toMatch(/coach(?!es page)|email|notes/i);
    const sql = buildProgramDetailsSql(parseProgramInfo(csv(row())).details).join("\n");
    expect(sql).not.toMatch(/pat@example\.edu|Pat Example|free text/);
    const migration = readFileSync(join(__dirname, "..", "..", "supabase", "migrations", "053_program_details.sql"), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(migration).not.toMatch(/email|coach_name|head_coach|assistant/i);
  });

  it("emits SQL that refuses to run without 053 and upserts by program", () => {
    const sql = buildProgramDetailsSql(parseProgramInfo(csv(row())).details).join("\n");
    expect(sql).toMatch(/migration 053 is not on this database: refusing/);
    expect(sql).toMatch(/on conflict \(program_id\) do update/);
    expect(buildProgramDetailsSql([])).toEqual([]);
  });
});

describe("the loader's second wall", () => {
  const base: DetailRow = {
    program_id: "p1",
    city: "Exampleville",
    state: "EX",
    cost_of_attendance_usd: 30000,
    coa_year: "2025-26",
    coa_source_url: "https://example.gov/1",
    acceptance_rate: "0.5000",
    undergrad_enrollment: 20000,
    scorecard_source_url: "https://example.gov/1",
    coaches_page_url: "javascript:alert(1)",
    questionnaire_url: null,
    read_date: "2026-11-22",
  };

  it("keeps sourced numbers, drops unsourced ones and non-http links", () => {
    expect(toProgramDetails(base)).toMatchObject({ costOfAttendanceUsd: 30000, acceptanceRate: 0.5, coachesPageUrl: null });
    expect(toProgramDetails({ ...base, coa_source_url: null }).costOfAttendanceUsd).toBeNull();
    expect(toProgramDetails({ ...base, scorecard_source_url: null })).toMatchObject({ acceptanceRate: null, undergradEnrollment: null });
  });

  it("attaches details by program, and none when there is no row", () => {
    const program = {
      id: "p1",
      slug: "x-women",
      school: "X",
      gender: "women",
      division: "D1",
      conference: "C",
      roster_url: null,
      season_shown: "2026-27",
      season_start_year: 2026,
      players_listed: 8,
      unknown_class_count: 0,
      source_date: "2026-11-22",
      source_url: null,
    };
    expect(assemblePrograms([program], [], [], [base])[0].details?.city).toBe("Exampleville");
    expect(assemblePrograms([program], [], [])[0].details).toBeNull();
  });
});
