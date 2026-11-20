// Official-roster TSV -> per-program class counts. Pure; no I/O.
//
// Catalog phase 1 (migration 048). Input: the owner's compiled roster file
// (docs/data/official_rosters_2026-27.tsv when it exists), one row per
// listed player, columns:
//
//   Conference  School  Gender  HeadCoach  RosterURL  SeasonShown
//   Player  Class  Hometown  Notes
//
// Output: one draft per (school, gender) with how many players the roster
// listed in each graduating class. That is ALL that leaves this module.
//
// PRIVACY RULE: Player and Hometown are read for exactly one purpose — to
// drop a row that is an exact duplicate of another on the same roster — and
// never leave this function. No name or hometown appears in a draft, in an
// error, or in the summary. Errors cite line numbers only. A test feeds a
// fixture through and asserts that no player name appears anywhere in the
// serialised output.
//
// KNOWN CAVEATS OF THE INPUT (from the owner's brief), and what happens:
//   * Some rosters are 2025-26 (SeasonShown). Kept, labelled with that
//     season, and listed as stale in the report. Never relabelled.
//   * Some teams are missing. A team with no rows cannot be detected from
//     this file alone; pass an expected-programs list to the CLI
//     (--expected) to have them listed. A row with a school but no player
//     marks a program whose roster listed nobody.
//   * Class labels vary by school. lib/catalog/class-year.ts; anything it
//     cannot read is counted as unknown, per program and in a tally.
//   * Spellings were not hand-checked. School names are stored as written;
//     the report lists every distinct school so a person can read it over.

import { finalYearClass, graduationClassYear, parseSeason } from "./class-year";

export type CatalogDivision = "D1" | "D2" | "D3" | "NAIA" | "JUCO";
export type CatalogGender = "men" | "women";

export const ROSTER_COLUMNS = [
  "Conference",
  "School",
  "Gender",
  "HeadCoach",
  "RosterURL",
  "SeasonShown",
  "Player",
  "Class",
  "Hometown",
  "Notes",
] as const;
type Column = (typeof ROSTER_COLUMNS)[number];

/**
 * NCAA division of each conference the phase-1 file covers. Public
 * membership facts (each conference's own site / the NCAA directory), not
 * data about any program's level. A conference not listed here is a row
 * error — it is never assigned a division by guess. Extend this map, with
 * the conference's own name exactly as the file spells it, when a new
 * conference arrives.
 */
export const CONFERENCE_DIVISION: Readonly<Record<string, CatalogDivision>> = {
  NESCAC: "D3",
  Centennial: "D3",
  ODAC: "D3",
  UAA: "D3",
  SCIAC: "D3",
  "Liberty League": "D3",
  "Patriot League": "D1",
  CAA: "D1",
  "Ivy League": "D1",
  "Atlantic 10": "D1",
};

/** DATA_QUALITY.md "Import procedure": the run fails if more than 5% of
 * rows error. Nothing partial is published. */
export const MAX_ERROR_RATE = 0.05;

export interface RowError {
  /** 1-based line number in the file (the header is line 1). */
  line: number;
  reason: string;
}

export interface ProgramDraft {
  slug: string;
  school: string;
  gender: CatalogGender;
  division: CatalogDivision;
  conference: string;
  headCoach: string | null;
  rosterUrl: string | null;
  seasonShown: string;
  seasonStartYear: number;
  playersListed: number;
  unknownClassCount: number;
  /** class year -> players. Only readable labels; unknowns are counted above. */
  classCounts: Record<number, number>;
  /** Players in the final season on this roster (seniors, grad, 5th-year). */
  finalYearCount: number;
  /** Rows dropped as exact duplicates of another row on this roster. */
  duplicatesDropped: number;
  /** Program-level fields that differed between this program's rows. */
  inconsistentFields: string[];
}

export interface ParseResult {
  rowsRead: number;
  rowsUsed: number;
  errors: RowError[];
  programs: ProgramDraft[];
  /** Distinct unreadable Class labels and how often each occurred. Labels,
   * never names. */
  unknownLabels: Record<string, number>;
  errorRate: number;
  /** True when errorRate > MAX_ERROR_RATE: the CLI must not upsert. */
  failed: boolean;
}

export class RosterFileError extends Error {}

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function programSlug(school: string, gender: CatalogGender): string {
  return `${slugify(school)}-${gender}`;
}

function normalizeGender(raw: string): CatalogGender | null {
  const g = raw.trim().toLowerCase().replace(/[’']/g, "");
  if (["men", "mens", "m", "male", "man"].includes(g)) return "men";
  if (["women", "womens", "w", "female", "woman"].includes(g)) return "women";
  return null;
}

function cleanCell(raw: string | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

function isHttpUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text);
}

interface Group {
  key: string;
  conference: string;
  school: string;
  gender: CatalogGender;
  values: Record<"HeadCoach" | "RosterURL" | "SeasonShown", Map<string, number>>;
  /** class labels of de-duplicated player rows. */
  labels: string[];
  seen: Set<string>;
  duplicates: number;
}

function tally(map: Map<string, number>, value: string) {
  map.set(value, (map.get(value) ?? 0) + 1);
}

/** Most common non-empty value; ties go to the one seen first. */
function mostCommon(map: Map<string, number>): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const [value, n] of map) {
    if (value && n > bestN) {
      best = value;
      bestN = n;
    }
  }
  return best;
}

/**
 * Parse and aggregate the roster TSV. Throws RosterFileError when the file
 * as a whole is unusable (empty, or the header lacks a required column);
 * per-row problems are returned as errors with line numbers.
 */
export function parseRosterTsv(text: string): ParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => l.trim().length > 0);
  if (headerIndex === -1) throw new RosterFileError("The roster file is empty.");

  const header = lines[headerIndex].split("\t").map((h) => h.trim().toLowerCase());
  const index = {} as Record<Column, number>;
  const missing: string[] = [];
  for (const col of ROSTER_COLUMNS) {
    const at = header.indexOf(col.toLowerCase());
    if (at === -1) missing.push(col);
    index[col] = at;
  }
  if (missing.length) {
    throw new RosterFileError(
      `The roster file's header is missing column(s): ${missing.join(", ")}. ` +
        `Expected tab-separated columns: ${ROSTER_COLUMNS.join(", ")}.`
    );
  }

  const errors: RowError[] = [];
  const groups = new Map<string, Group>();
  const unknownLabels: Record<string, number> = {};
  let rowsRead = 0;
  let rowsUsed = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim().length === 0) continue;
    rowsRead++;
    const line = i + 1;
    const cells = raw.split("\t");
    if (cells.length < header.length) {
      // Trailing empty cells are often trimmed by editors; pad them.
      while (cells.length < header.length) cells.push("");
    }
    if (cells.length > header.length) {
      errors.push({ line, reason: `has ${cells.length} cells, expected ${header.length} (a tab inside a cell?)` });
      continue;
    }
    const cell = (c: Column) => cleanCell(cells[index[c]]);

    const conference = cell("Conference");
    const school = cell("School");
    const genderRaw = cell("Gender");
    if (!conference || !school || !genderRaw) {
      errors.push({ line, reason: "missing Conference, School or Gender" });
      continue;
    }
    if (!CONFERENCE_DIVISION[conference]) {
      errors.push({ line, reason: `unknown conference "${conference}" (no division on record for it)` });
      continue;
    }
    const gender = normalizeGender(genderRaw);
    if (!gender) {
      errors.push({ line, reason: `Gender "${genderRaw}" is not men or women` });
      continue;
    }
    const seasonRaw = cell("SeasonShown");
    if (!parseSeason(seasonRaw)) {
      errors.push({ line, reason: `SeasonShown "${seasonRaw}" is not a season like 2026-27` });
      continue;
    }
    const url = cell("RosterURL");
    if (url && !isHttpUrl(url)) {
      errors.push({ line, reason: "RosterURL is not an http(s) URL" });
      continue;
    }

    const key = `${conference}\u0000${school.toLowerCase()}\u0000${gender}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        conference,
        school,
        gender,
        values: { HeadCoach: new Map(), RosterURL: new Map(), SeasonShown: new Map() },
        labels: [],
        seen: new Set(),
        duplicates: 0,
      };
      groups.set(key, group);
    }
    tally(group.values.HeadCoach, cell("HeadCoach"));
    tally(group.values.RosterURL, url);
    tally(group.values.SeasonShown, parseSeason(seasonRaw)!.label);
    rowsUsed++;

    const player = cell("Player");
    if (!player) continue; // program row with no player listed
    // In-memory only: identifies an exact duplicate row. Never stored.
    const identity = `${player.toLowerCase()}\u0000${cell("Class").toLowerCase()}\u0000${cell("Hometown").toLowerCase()}`;
    if (group.seen.has(identity)) {
      group.duplicates++;
      continue;
    }
    group.seen.add(identity);
    group.labels.push(cell("Class"));
  }

  // Two conferences claiming the same school+gender would produce one slug
  // for two programs. Refuse both rather than pick one.
  const bySlug = new Map<string, Group[]>();
  for (const g of groups.values()) {
    const slug = programSlug(g.school, g.gender);
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), g]);
  }

  const programs: ProgramDraft[] = [];
  for (const [slug, gs] of bySlug) {
    if (gs.length > 1) {
      errors.push({
        line: 0,
        reason: `"${gs[0].school}" (${gs[0].gender}) appears under ${gs.length} conferences or spellings: ${gs
          .map((g) => g.conference)
          .join(", ")} — fix the file; neither was imported`,
      });
      continue;
    }
    const g = gs[0];
    const seasonLabel = mostCommon(g.values.SeasonShown)!;
    const season = parseSeason(seasonLabel)!;
    const inconsistentFields = (["HeadCoach", "RosterURL", "SeasonShown"] as const).filter(
      (f) => [...g.values[f].keys()].filter(Boolean).length > 1
    );

    const classCounts: Record<number, number> = {};
    let unknown = 0;
    for (const label of g.labels) {
      const year = graduationClassYear(label, season.startYear);
      if (year === null) {
        unknown++;
        const shown = label || "(blank)";
        unknownLabels[shown] = (unknownLabels[shown] ?? 0) + 1;
      } else {
        classCounts[year] = (classCounts[year] ?? 0) + 1;
      }
    }

    programs.push({
      slug,
      school: g.school,
      gender: g.gender,
      division: CONFERENCE_DIVISION[g.conference],
      conference: g.conference,
      headCoach: mostCommon(g.values.HeadCoach),
      rosterUrl: mostCommon(g.values.RosterURL),
      seasonShown: season.label,
      seasonStartYear: season.startYear,
      playersListed: g.labels.length,
      unknownClassCount: unknown,
      classCounts,
      finalYearCount: classCounts[finalYearClass(season.startYear)] ?? 0,
      duplicatesDropped: g.duplicates,
      inconsistentFields,
    });
  }

  programs.sort(
    (a, b) =>
      a.conference.localeCompare(b.conference) ||
      a.school.localeCompare(b.school) ||
      a.gender.localeCompare(b.gender)
  );
  errors.sort((a, b) => a.line - b.line);

  const errorRate = rowsRead === 0 ? 0 : errors.filter((e) => e.line > 0).length / rowsRead;
  return {
    rowsRead,
    rowsUsed,
    errors,
    programs,
    unknownLabels,
    errorRate,
    failed: rowsRead === 0 || errorRate > MAX_ERROR_RATE,
  };
}

/* ------------------------------------------------------------- expected */

export interface ExpectedProgram {
  conference: string;
  school: string;
  gender: CatalogGender;
}

/**
 * Optional list of programs the owner expects (Conference, School, Gender;
 * tab-separated, header row). Lets the report name teams that are missing
 * from the roster file — which the roster file alone cannot show.
 */
export function parseExpectedTsv(text: string): ExpectedProgram[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const header = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const at = (c: string) => header.indexOf(c);
  if (at("conference") < 0 || at("school") < 0 || at("gender") < 0) {
    throw new RosterFileError("The expected-programs file needs Conference, School and Gender columns.");
  }
  const out: ExpectedProgram[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const gender = normalizeGender(cells[at("gender")] ?? "");
    const school = cleanCell(cells[at("school")]);
    const conference = cleanCell(cells[at("conference")]);
    if (gender && school && conference) out.push({ conference, school, gender });
  }
  return out;
}

export function missingPrograms(expected: ExpectedProgram[], programs: ProgramDraft[]): ExpectedProgram[] {
  const have = new Set(programs.map((p) => p.slug));
  return expected.filter((e) => !have.has(programSlug(e.school, e.gender)));
}
