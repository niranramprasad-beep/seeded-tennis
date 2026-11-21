// The aggregated roster file: one row per team, counts only. Pure; no I/O.
//
// Catalog phase 1 reads official rosters, but all it keeps is how many
// players each team listed per graduating class. The raw file
// (Conference … Player, Class, Hometown, Notes — one row per student) names
// about 1,900 real college students, so it does not live in this repo; it is
// kept on the owner's machine (~/seeded-private/, never committed). What the
// repo holds is this aggregate, produced from the raw file by
// `scripts/aggregate-rosters.ts`:
//
//   # comment lines: provenance (source row counts, row errors, unknown
//   #   class labels as label -> count). Never a name.
//   Conference  School  Gender  HeadCoach  RosterURL  SeasonShown  Status
//   Class of YYYY …  UnknownClass  Total  DuplicatesDropped
//   InconsistentFields  SeasonFromSpringYear
//
// PRIVACY RULE: no column of this format can hold a player's name, hometown
// or a Notes cell. The writer has no input for them (it takes the parser's
// output, which never carries them) and the reader rejects any file whose
// header has a Player, Hometown or Notes column.
//
// `parseRosterCountsTsv(serializeRosterCounts(parseRosterTsv(raw)))` returns
// the same programs, not-retrieved list, unknown labels, row counts and
// errors as `parseRosterTsv(raw)` — the round trip is what the tests check.

import { finalYearClass, parseRosterSeason } from "./class-year";
import {
  CONFERENCE_DIVISION,
  MAX_ERROR_RATE,
  parseRosterTsv,
  programSlug,
  RosterFileError,
  type CatalogGender,
  type NotRetrievedProgram,
  type ParseResult,
  type ProgramDraft,
  type RowError,
} from "./roster-import";

export const COUNTS_LEAD_COLUMNS = [
  "Conference",
  "School",
  "Gender",
  "HeadCoach",
  "RosterURL",
  "SeasonShown",
  "Status",
] as const;

export const COUNTS_TAIL_COLUMNS = [
  "UnknownClass",
  "Total",
  "DuplicatesDropped",
  "InconsistentFields",
  "SeasonFromSpringYear",
] as const;

/** Columns that would carry personal data. Their presence makes a file raw. */
export const PERSONAL_COLUMNS = ["Player", "Hometown", "Notes"] as const;

const CLASS_COLUMN = /^Class of (\d{4})$/;
const STATUS_IMPORTED = "imported";
const STATUS_NOT_RETRIEVED = "not retrieved";
const INCONSISTENT_FIELDS = new Set(["HeadCoach", "RosterURL", "SeasonShown"]);

export interface CountsSource {
  /** Basename of the raw file the counts came from (provenance only). */
  sourceFile: string;
}

function cell(text: string | null | undefined): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.includes("\t")) throw new RosterFileError("a value contains a tab");
  return t;
}

/**
 * Write the aggregate for a parsed raw file. Takes only the parser's output,
 * which never carries a name, hometown or note.
 */
export function serializeRosterCounts(parsed: ParseResult, source: CountsSource): string {
  const years = [...new Set(parsed.programs.flatMap((p) => Object.keys(p.classCounts).map(Number)))].sort(
    (a, b) => a - b
  );
  const header = [...COUNTS_LEAD_COLUMNS, ...years.map((y) => `Class of ${y}`), ...COUNTS_TAIL_COLUMNS];

  const out: string[] = [
    `# Seeded catalog phase 1 — team roster counts by graduating class. One row per team.`,
    `# Aggregated from ${cell(source.sourceFile)} by scripts/aggregate-rosters.ts. No player names, hometowns or notes.`,
    `# source-rows-read: ${parsed.rowsRead}`,
    `# source-rows-used: ${parsed.rowsUsed}`,
    `# unknown-class-labels: ${JSON.stringify(parsed.unknownLabels)}`,
    ...parsed.errors.map((e) => `# source-row-error: ${JSON.stringify({ line: e.line, reason: e.reason })}`),
    header.join("\t"),
  ];

  for (const p of parsed.programs) {
    out.push(
      [
        p.conference,
        p.school,
        p.gender,
        p.headCoach ?? "",
        p.rosterUrl ?? "",
        p.seasonShown,
        STATUS_IMPORTED,
        ...years.map((y) => String(p.classCounts[y] ?? 0)),
        String(p.unknownClassCount),
        String(p.playersListed),
        String(p.duplicatesDropped),
        p.inconsistentFields.join(","),
        p.seasonFromSpringYear ? "yes" : "no",
      ]
        .map(cell)
        .join("\t")
    );
  }
  for (const n of parsed.notRetrieved) {
    out.push(
      [n.conference, n.school, n.gender, "", "", "", STATUS_NOT_RETRIEVED, ...years.map(() => ""), "", "", "", "", ""]
        .map(cell)
        .join("\t")
    );
  }
  return out.join("\n") + "\n";
}

function count(text: string): number | null {
  return /^\d{1,4}$/.test(text) ? Number(text) : null;
}

function genderOf(text: string): CatalogGender | null {
  return text === "men" || text === "women" ? text : null;
}

/** Raw (one row per player) or aggregated? Decided by the header alone. */
export function isRawRosterHeader(headerLine: string): boolean {
  const cols = headerLine.split("\t").map((h) => h.trim().toLowerCase());
  return PERSONAL_COLUMNS.some((c) => cols.includes(c.toLowerCase()));
}

/**
 * Read the aggregate back into the same shape `parseRosterTsv` returns.
 * Strict: any malformed row fails the whole file (`failed: true`) — the
 * aggregate is machine-written, so a bad row means it was edited by hand or
 * truncated, and nothing partial should be imported.
 */
export function parseRosterCountsTsv(text: string): ParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const meta: { rowsRead?: number; rowsUsed?: number; labels?: Record<string, number>; errors: RowError[] } = {
    errors: [],
  };

  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim().length === 0) continue;
    if (l.startsWith("#")) {
      const m = l.match(/^#\s*([a-z-]+):\s*(.*)$/);
      if (!m) continue;
      const [, key, value] = m;
      if (key === "source-rows-read") meta.rowsRead = count(value.trim()) ?? undefined;
      else if (key === "source-rows-used") meta.rowsUsed = count(value.trim()) ?? undefined;
      else if (key === "unknown-class-labels") meta.labels = JSON.parse(value) as Record<string, number>;
      else if (key === "source-row-error") {
        const e = JSON.parse(value) as RowError;
        meta.errors.push({ line: Number(e.line), reason: String(e.reason) });
      }
      continue;
    }
    headerIndex = i;
    break;
  }
  if (headerIndex === -1) throw new RosterFileError("The roster counts file is empty.");

  const header = lines[headerIndex].split("\t").map((h) => h.trim());
  if (isRawRosterHeader(lines[headerIndex])) {
    throw new RosterFileError(
      "This is a raw roster file (it has a Player, Hometown or Notes column), not the aggregated counts file."
    );
  }
  const at = (c: string) => header.indexOf(c);
  const missing = [...COUNTS_LEAD_COLUMNS, ...COUNTS_TAIL_COLUMNS].filter((c) => at(c) === -1);
  if (missing.length) {
    throw new RosterFileError(`The roster counts file's header is missing column(s): ${missing.join(", ")}.`);
  }
  const yearCols = header
    .map((h, i) => [h.match(CLASS_COLUMN), i] as const)
    .filter(([m]) => m)
    .map(([m, i]) => ({ year: Number(m![1]), index: i }));
  const known = new Set<string>([...COUNTS_LEAD_COLUMNS, ...COUNTS_TAIL_COLUMNS]);
  const unknownCols = header.filter((h) => !known.has(h) && !CLASS_COLUMN.test(h));
  if (unknownCols.length) {
    throw new RosterFileError(`The roster counts file has unexpected column(s): ${unknownCols.join(", ")}.`);
  }

  const errors: RowError[] = [];
  const programs: ProgramDraft[] = [];
  const notRetrieved: NotRetrievedProgram[] = [];
  const slugs = new Set<string>();
  let dataRows = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim().length === 0 || raw.startsWith("#")) continue;
    dataRows++;
    const line = i + 1;
    const cells = raw.split("\t");
    if (cells.length !== header.length) {
      errors.push({ line, reason: `counts file: has ${cells.length} cells, expected ${header.length}` });
      continue;
    }
    const get = (c: string) => cells[at(c)].trim();
    const conference = get("Conference");
    const school = get("School");
    const gender = genderOf(get("Gender"));
    if (!conference || !school || !gender) {
      errors.push({ line, reason: "counts file: missing Conference or School, or Gender is not men/women" });
      continue;
    }
    if (!CONFERENCE_DIVISION[conference]) {
      errors.push({ line, reason: `counts file: unknown conference "${conference}"` });
      continue;
    }
    const slug = programSlug(school, gender);
    if (slugs.has(slug)) {
      errors.push({ line, reason: `counts file: "${school}" (${gender}) appears twice` });
      continue;
    }
    slugs.add(slug);

    const status = get("Status");
    if (status === STATUS_NOT_RETRIEVED) {
      notRetrieved.push({ slug, conference, school, gender });
      continue;
    }
    if (status !== STATUS_IMPORTED) {
      errors.push({ line, reason: `counts file: Status "${status}" is not "${STATUS_IMPORTED}" or "${STATUS_NOT_RETRIEVED}"` });
      continue;
    }

    const season = parseRosterSeason(get("SeasonShown"));
    if (!season || season.fromSpringYear) {
      errors.push({ line, reason: `counts file: SeasonShown "${get("SeasonShown")}" is not a season like 2026-27` });
      continue;
    }
    const url = get("RosterURL");
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      errors.push({ line, reason: "counts file: RosterURL is not an http(s) URL" });
      continue;
    }

    const classCounts: Record<number, number> = {};
    let bad = false;
    for (const { year, index } of yearCols) {
      const n = count(cells[index].trim());
      if (n === null) bad = true;
      else if (n > 0) classCounts[year] = n;
    }
    const unknown = count(get("UnknownClass"));
    const total = count(get("Total"));
    const dups = count(get("DuplicatesDropped"));
    const spring = get("SeasonFromSpringYear");
    const inconsistent = get("InconsistentFields") ? get("InconsistentFields").split(",") : [];
    if (bad || unknown === null || total === null || dups === null || (spring !== "yes" && spring !== "no")) {
      errors.push({ line, reason: "counts file: a count is not a whole number, or SeasonFromSpringYear is not yes/no" });
      continue;
    }
    if (inconsistent.some((f) => !INCONSISTENT_FIELDS.has(f))) {
      errors.push({ line, reason: "counts file: InconsistentFields names an unknown field" });
      continue;
    }
    const sum = Object.values(classCounts).reduce((a, b) => a + b, 0) + unknown;
    if (total !== sum || total === 0) {
      errors.push({ line, reason: `counts file: Total ${total} does not equal the class counts plus unknown (${sum})` });
      continue;
    }

    programs.push({
      slug,
      school,
      gender,
      division: CONFERENCE_DIVISION[conference],
      conference,
      headCoach: get("HeadCoach") || null,
      rosterUrl: url || null,
      seasonShown: season.label,
      seasonStartYear: season.startYear,
      playersListed: total,
      unknownClassCount: unknown,
      classCounts,
      finalYearCount: classCounts[finalYearClass(season.startYear)] ?? 0,
      duplicatesDropped: dups,
      inconsistentFields: inconsistent,
      seasonFromSpringYear: spring === "yes",
    });
  }

  const byName = (
    a: { conference: string; school: string; gender: string },
    b: { conference: string; school: string; gender: string }
  ) => a.conference.localeCompare(b.conference) || a.school.localeCompare(b.school) || a.gender.localeCompare(b.gender);
  programs.sort(byName);
  notRetrieved.sort(byName);

  const rowsRead = meta.rowsRead ?? dataRows;
  const sourceErrorRate = rowsRead === 0 ? 0 : meta.errors.filter((e) => e.line > 0).length / rowsRead;
  return {
    rowsRead,
    rowsUsed: meta.rowsUsed ?? dataRows,
    // Errors from the raw file keep its line numbers; a malformed row of
    // this file is reported with "counts file:" and fails the import.
    errors: [...meta.errors, ...errors].sort((a, b) => a.line - b.line),
    programs,
    unknownLabels: meta.labels ?? {},
    errorRate: sourceErrorRate,
    failed: errors.length > 0 || dataRows === 0 || sourceErrorRate > MAX_ERROR_RATE,
    notRetrieved,
  };
}

/** Parse either format, decided by the header: the raw per-player file or the aggregate. */
export function parseRosterFile(text: string): ParseResult {
  const firstReal = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .find((l) => l.trim().length > 0 && !l.startsWith("#"));
  if (firstReal === undefined) throw new RosterFileError("The roster file is empty.");
  return isRawRosterHeader(firstReal) ? parseRosterTsv(text) : parseRosterCountsTsv(text);
}
