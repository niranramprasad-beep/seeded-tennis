// Catalog import from the owner's hand-checked spreadsheet, "College Tennis
// UTR Database" (two tabs, exported as CSV: Teams and Players). Pure; the
// runner is scripts/import-utr-database.ts.
//
// What the spreadsheet is: for each team, a person read the program's
// official roster page and each listed player's public UTR profile by hand,
// marked every rating reliable or not, and recorded the date. That is the
// "hand-curated from public rosters" source in docs/CATALOG_EXPANSION.md —
// done by a person, never by the app. Nothing here fetches anything.
//
// What it produces, per team:
//   * a ProgramDraft (programs + program_class_counts, migration 048): the
//     players on the OFFICIAL roster counted by graduating class. No player
//     name, profile link or note leaves this module.
//   * a RangeDraft (team_ranges, source_type 'hand_curated'), by one written
//     rule — RANGE_RULE below — over the reliable singles ratings of the
//     official-roster players. It is held (not imported) whenever the
//     spreadsheet disagrees with itself.
//
// Rules (each one tested in utr-database.test.ts):
//   1. A player counts only if they are on the official roster. The sheet
//      marks the others in "Roster Check": "UTR only" (on UTR's team page,
//      not on the official roster) and "not on roster page yet" (a signing
//      announced elsewhere). Its own team columns leave them out too.
//   2. The sheet's "Leaving by Spring <final year>" and "<final year + 1>"
//      must equal the counts this module computes, or the team is HELD
//      whole: two numbers for one fact means one of them is wrong.
//   3. The sheet's "Team Avg UTR (reliable only)" must equal the mean this
//      module computes from the reliable official-roster ratings (to the
//      cent), or the RANGE is held: it is a check that the ratings were read
//      the way the sheet's author read them. The program still imports: its
//      class counts do not depend on ratings.
//   4. Fewer than MIN_RATED_PLAYERS reliable ratings -> no range.
//   5. A team with no players -> held whole ("not started" in the sheet).

import { plausibleClassYear, finalYearClass } from "./class-year";
import { programSlug, type CatalogDivision, type CatalogGender, type ProgramDraft } from "./roster-import";

// The range rule, decided by the owner 2026-11-21 (of three compared: lowest
// player, this one, and the singles lineup). One low outlier — often a
// walk-on — set the floor under "lowest player": on average 0.9 below the
// team's mean, up to 2.1, and the floor is what makes a school "Target".
// Quartiles use the INCLUSIVE method, the one Google Sheets' QUARTILE() and
// Excel's QUARTILE.INC use, so any range can be checked in the sheet itself
// with =QUARTILE(ratings, 1), =MEDIAN(ratings) and =MAX(ratings).
export const RANGE_RULE =
  "floor = lower quartile of the reliable singles UTRs on the official roster (as Sheets' QUARTILE(…, 1)); middle = their median; top = highest";

/** Inclusive-method quantile (Sheets QUARTILE / Excel QUARTILE.INC):
 * position (n − 1)·p in the sorted list, linear between neighbours. */
export function quantileInclusive(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error("no values");
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Every range this importer writes starts with this. The catalog merge
 * (lib/catalog/merge.ts) accepts only such ranges, because its wording
 * ("Roster checked", lower quartile / median) describes THIS method. */
export const UTR_DATABASE_SOURCE_PREFIX = "College Tennis UTR Database";

/** The source line shown beside every range from this import. */
export function rangeSource(seasonShown: string): string {
  return `${UTR_DATABASE_SOURCE_PREFIX} (official ${seasonShown} roster checked against each player's UTR profile; reliable singles ratings only)`;
}

export const MIN_RATED_PLAYERS = 5;

const DIVISIONS: readonly CatalogDivision[] = ["D1", "D2", "D3", "NAIA", "JUCO"];

const TEAMS_COLUMNS = [
  "Division",
  "Conference",
  "School",
  "Team UTR Link",
  "Gender",
  "Head Coach",
  "Team Avg UTR (reliable only)",
  "Official Roster URL",
  "Last Verified",
] as const;

const PLAYERS_COLUMNS = [
  "Division",
  "Gender",
  "School",
  "UTR Rating",
  "Reliable? (Y/N)",
  "Roster Check",
  "Grad Year",
] as const;

export class UtrDatabaseError extends Error {}

/* ------------------------------------------------------------------ CSV */

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside
 * quotes, CRLF or LF. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (quoted) throw new UtrDatabaseError("CSV ends inside a quoted field.");
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function records(text: string, required: readonly string[], tab: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new UtrDatabaseError(`${tab}: the file is empty.`);
  const header = rows[0].map((h) => h.trim());
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length) {
    throw new UtrDatabaseError(
      `${tab}: missing column(s) ${missing.map((m) => `"${m}"`).join(", ")}. ` +
        `Export the "${tab}" tab of the spreadsheet as CSV (File → Download → CSV).`
    );
  }
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/* --------------------------------------------------------------- values */

function gender(raw: string): CatalogGender | null {
  const g = raw.trim().toUpperCase();
  if (g === "M" || g === "MEN") return "men";
  if (g === "W" || g === "WOMEN") return "women";
  return null;
}

/** A single rating 1.00–16.50, or null ("", "7.25-9.25", "n/a"). */
export function rating(raw: string): number | null {
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(raw.trim())) return null;
  const v = Number(raw);
  return v >= 1 && v <= 16.5 ? v : null;
}

/** Rule 1. */
export function onOfficialRoster(rosterCheck: string): boolean {
  const c = rosterCheck.trim().toLowerCase();
  return !c.startsWith("utr only") && !c.includes("not on roster page yet");
}

/** To the cent, half up, without float noise (12.675 -> 12.68, not 12.67). */
export const round2 = (v: number) => Math.round(Number((v * 100).toPrecision(12))) / 100;

function isoDate(raw: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

/* --------------------------------------------------------------- output */

export interface RangeDraft {
  slug: string;
  low: number;
  middle: number;
  high: number;
  ratedPlayers: number;
  sourceUrl: string | null;
  sourceDate: string;
}

export interface Held {
  school: string;
  gender: string;
  /** "whole team" or "range only". */
  scope: "team" | "range";
  reason: string;
}

export interface UtrDatabaseImport {
  programs: (ProgramDraft & { sourceDate: string })[];
  ranges: RangeDraft[];
  held: Held[];
  /** Plausibility flags (DATA_QUALITY.md): shown, not blocking. */
  warnings: string[];
  playerRowsRead: number;
  playerRowsCounted: number;
}

export function parseUtrDatabase(
  teamsCsv: string,
  playersCsv: string,
  season: { shown: string; startYear: number }
): UtrDatabaseImport {
  const teams = records(teamsCsv, TEAMS_COLUMNS, "Teams");
  const players = records(playersCsv, PLAYERS_COLUMNS, "Players");

  const finalYear = finalYearClass(season.startYear);
  const leavingCols = [finalYear, finalYear + 1].map((y) => ({ year: y, col: `Leaving by Spring ${y}` }));

  const key = (school: string, g: CatalogGender) => `${school.trim()}|${g}`;
  const rosterByTeam = new Map<string, Record<string, string>[]>();
  for (const p of players) {
    const g = gender(p["Gender"]);
    if (!g) throw new UtrDatabaseError(`Players: unknown gender "${p["Gender"]}" for a ${p["School"]} row.`);
    const k = key(p["School"], g);
    rosterByTeam.set(k, [...(rosterByTeam.get(k) ?? []), p]);
  }

  const out: UtrDatabaseImport = {
    programs: [],
    ranges: [],
    held: [],
    warnings: [],
    playerRowsRead: players.length,
    playerRowsCounted: 0,
  };
  const seen = new Set<string>();

  for (const t of teams) {
    const school = t["School"];
    const g = gender(t["Gender"]);
    const division = t["Division"] as CatalogDivision;
    if (!school) continue;
    if (!g) throw new UtrDatabaseError(`Teams: unknown gender "${t["Gender"]}" for ${school}.`);
    if (!DIVISIONS.includes(division)) throw new UtrDatabaseError(`Teams: unknown division "${t["Division"]}" for ${school}.`);
    const k = key(school, g);
    if (seen.has(k)) throw new UtrDatabaseError(`Teams: ${school} (${g}) appears twice.`);
    seen.add(k);
    const label = { school, gender: g };

    const roster = (rosterByTeam.get(k) ?? []).filter((p) => onOfficialRoster(p["Roster Check"]));
    rosterByTeam.delete(k);

    const verified = isoDate(t["Last Verified"]);
    if (!verified) {
      out.held.push({ ...label, scope: "team", reason: `no "Last Verified" date (got "${t["Last Verified"]}")` });
      continue;
    }
    if (roster.length === 0) {
      out.held.push({ ...label, scope: "team", reason: "no players entered yet" });
      continue;
    }

    // Class counts (rule 1 applied above).
    const classCounts: Record<number, number> = {};
    let unknown = 0;
    for (const p of roster) {
      const y = Number(p["Grad Year"]);
      if (p["Grad Year"] && plausibleClassYear(y, season.startYear)) classCounts[y] = (classCounts[y] ?? 0) + 1;
      else unknown++;
    }

    // Rule 2: the sheet's own leaving counts must agree.
    const disagreements = leavingCols
      .filter(({ col }) => t[col] !== undefined && t[col] !== "")
      .filter(({ year, col }) => Number(t[col]) !== (classCounts[year] ?? 0))
      .map(({ year, col }) => `"${col}" says ${t[col]}, the player rows give ${classCounts[year] ?? 0}`);
    if (disagreements.length) {
      out.held.push({ ...label, scope: "team", reason: disagreements.join("; ") });
      continue;
    }

    const slug = programSlug(school, g);
    const rosterUrl = /^https?:\/\//.test(t["Official Roster URL"]) ? t["Official Roster URL"] : null;
    out.programs.push({
      slug,
      school,
      gender: g,
      division,
      conference: t["Conference"],
      headCoach: t["Head Coach"] || null,
      rosterUrl,
      seasonShown: season.shown,
      seasonStartYear: season.startYear,
      playersListed: roster.length,
      unknownClassCount: unknown,
      classCounts,
      finalYearCount: classCounts[finalYear] ?? 0,
      duplicatesDropped: 0,
      inconsistentFields: [],
      seasonFromSpringYear: false,
      sourceDate: verified,
    });
    out.playerRowsCounted += roster.length;

    // Range (rules 3 and 4).
    const rated = roster
      .filter((p) => p["Reliable? (Y/N)"].toUpperCase() === "Y")
      .map((p) => rating(p["UTR Rating"]))
      .filter((v): v is number => v !== null);
    if (rated.length < MIN_RATED_PLAYERS) {
      out.held.push({
        ...label,
        scope: "range",
        reason: `${rated.length} reliable rating(s) on the official roster (need ${MIN_RATED_PLAYERS})`,
      });
      continue;
    }
    const mean = round2(rated.reduce((a, b) => a + b, 0) / rated.length);
    const sheetAvg = rating(t["Team Avg UTR (reliable only)"]);
    if (sheetAvg === null || Math.abs(sheetAvg - mean) > 0.005) {
      out.held.push({
        ...label,
        scope: "range",
        reason: `the sheet's team average is ${t["Team Avg UTR (reliable only)"] || "blank"}, the reliable player rows average ${mean.toFixed(2)}`,
      });
      continue;
    }
    const range: RangeDraft = {
      slug,
      low: round2(quantileInclusive(rated, 0.25)),
      middle: round2(quantileInclusive(rated, 0.5)),
      high: Math.max(...rated),
      ratedPlayers: rated.length,
      sourceUrl: /^https?:\/\//.test(t["Team UTR Link"]) ? t["Team UTR Link"] : rosterUrl,
      sourceDate: verified,
    };
    out.ranges.push(range);

    const [lo, hi] = g === "men" ? [6, 14] : [4, 12];
    if (range.low < lo || range.low > hi) {
      out.warnings.push(`${school} (${g}): floor ${range.low.toFixed(2)} is outside the usual ${lo}–${hi} for ${g}'s teams`);
    }
  }

  for (const [k, rows] of rosterByTeam) {
    out.warnings.push(`Players: ${rows.length} row(s) for ${k.replace("|", " (")}) have no row on the Teams tab and were not imported`);
  }
  return out;
}

/* ------------------------------------------------------------------ SQL */

function lit(v: string | number | null): string {
  if (v === null) return "null";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`not a finite number: ${v}`);
    return String(v);
  }
  return `'${v.replace(/'/g, "''")}'`;
}

/**
 * One transaction for a STAGING SQL session. Programs are upserted by slug
 * and their class counts replaced (a roster is a snapshot). Ranges are
 * insert-only (048: a correction is a new row), so a range identical to one
 * already stored for that program and date is skipped — re-running the file
 * adds nothing.
 *
 * Seatbelt, not the control: the default (staging) file raises unless
 * `programs` already holds rows — production's started empty. The owner
 * approved the production import on 2026-11-22; `target: "production"`
 * writes the same rows without that seatbelt.
 */
export type UtrSqlTarget = "staging" | "production";

export function buildUtrDatabaseSql(
  data: Pick<UtrDatabaseImport, "programs" | "ranges">,
  target: UtrSqlTarget = "staging",
  /** More statements for the same transaction, run after the programs and
   * ranges (lib/catalog/program-info.ts buildProgramDetailsSql). */
  extraStatements: readonly string[] = []
): string {
  if (data.programs.length === 0) throw new Error("no programs to import");
  const out: string[] =
    target === "production"
      ? [
          // Owner's go, 2026-11-22: the UTR database goes to production too.
          // Same rows, same insert-only ranges; only the empty-table seatbelt
          // is gone, because production's `programs` starts empty.
          "-- Generated by scripts/import-utr-database.ts --target production. No player names.",
          "begin;",
          "do $$ begin",
          "  if to_regclass('public.programs') is null or to_regclass('public.team_ranges') is null then",
          "    raise exception 'migration 048 is not on this database: refusing';",
          "  end if;",
          "end $$;",
        ]
      : [
          "-- Generated by scripts/import-utr-database.ts. STAGING ONLY. No player names.",
          "begin;",
          "do $$ begin",
          "  if to_regclass('public.programs') is null then",
          "    raise exception 'migration 048 is not on this database: refusing';",
          "  end if;",
          "  if not exists (select 1 from public.programs) then",
          "    raise exception 'programs is empty here (production has no imported programs): refusing, this file is for staging';",
          "  end if;",
          "end $$;",
        ];
  out.push(
    "insert into public.programs (slug, school, gender, division, conference, head_coach, roster_url, " +
      "season_shown, season_start_year, players_listed, unknown_class_count, last_verified, source_url, source_date)\n" +
      "select v.slug, v.school, v.gender, v.division, v.conference, v.head_coach, v.roster_url, v.season_shown, " +
      "v.season_start_year, v.players_listed, v.unknown_class_count, v.d::date, v.roster_url, v.d::date from (values\n" +
      data.programs
        .map(
          (d) =>
            "(" +
            [
              lit(d.slug),
              lit(d.school),
              lit(d.gender),
              lit(d.division),
              lit(d.conference),
              lit(d.headCoach) + "::text",
              lit(d.rosterUrl) + "::text",
              lit(d.seasonShown),
              lit(d.seasonStartYear),
              lit(d.playersListed),
              lit(d.unknownClassCount),
              lit(d.sourceDate),
            ].join(",") +
            ")"
        )
        .join(",\n") +
      "\n) as v(slug, school, gender, division, conference, head_coach, roster_url, season_shown, " +
      "season_start_year, players_listed, unknown_class_count, d)\n" +
      "on conflict (slug) do update set school = excluded.school, gender = excluded.gender, " +
      "division = excluded.division, conference = excluded.conference, head_coach = excluded.head_coach, " +
      "roster_url = excluded.roster_url, season_shown = excluded.season_shown, " +
      "season_start_year = excluded.season_start_year, players_listed = excluded.players_listed, " +
      "unknown_class_count = excluded.unknown_class_count, last_verified = excluded.last_verified, " +
      "source_url = excluded.source_url, source_date = excluded.source_date;"
  );
  out.push(
    "delete from public.program_class_counts c using public.programs p where c.program_id = p.id and p.slug in (" +
      data.programs.map((d) => lit(d.slug)).join(",") +
      ");"
  );
  const counts = data.programs.flatMap((d) =>
    Object.entries(d.classCounts).map(([y, n]) => `(${lit(d.slug)},${lit(Number(y))},${lit(n)})`)
  );
  if (counts.length) {
    out.push(
      "insert into public.program_class_counts (program_id, class_year, players)\n" +
        "select p.id, v.y, v.n from (values\n" +
        counts.join(",\n") +
        "\n) as v(slug, y, n) join public.programs p on p.slug = v.slug;"
    );
  }
  if (data.ranges.length) {
    out.push(
      "insert into public.team_ranges (program_id, low, middle, high, source_type, source, source_url, source_date, entered_by)\n" +
        "select p.id, v.low, v.middle, v.high, 'hand_curated', " +
        lit(rangeSource(data.programs[0].seasonShown)) +
        ", v.url, v.d::date, null from (values\n" +
        data.ranges
          .map(
            (r) =>
              `(${lit(r.slug)},${lit(r.low)}::numeric,${lit(r.middle)}::numeric,${lit(r.high)}::numeric,${lit(r.sourceUrl)}::text,${lit(r.sourceDate)})`
          )
          .join(",\n") +
        "\n) as v(slug, low, middle, high, url, d) join public.programs p on p.slug = v.slug\n" +
        "where not exists (select 1 from public.team_ranges t where t.program_id = p.id and t.low = v.low " +
        "and t.middle = v.middle and t.high = v.high and t.source_date = v.d::date);"
    );
  }
  out.push(...extraStatements);
  out.push("commit;");
  return out.join("\n") + "\n";
}
