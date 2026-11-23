// The "Program Info" tab of the owner's sheet "College Tennis UTR Database"
// (added 2026-11-22, docs/data/LAUNCH_DATA_SPEC.md) -> program_details
// (migration 053). Pure; the runner is scripts/import-utr-database.ts
// --program-info.
//
// One rule above the rest: a value is kept only with the page it was read
// from. A cost with no COA year or no COA source URL is dropped; an
// acceptance rate or enrollment with no Scorecard URL is dropped. Dropped
// values are reported, never guessed or carried unsourced.
//
// Deliberately NOT read: Head Coach, Head Coach Title, Assistant Coaches,
// Published Staff Emails, Staff Email Source URL (owner's open decision —
// see 053), ITA columns (none published yet), and Notes (free text).

import { parseCsv, UtrDatabaseError } from "./utr-database";
import { programSlug, type CatalogGender } from "./roster-import";

export const PROGRAM_INFO_COLUMNS = [
  "Division",
  "Gender",
  "School",
  "City",
  "State",
  "Coaches Page URL",
  "Recruiting Questionnaire URL",
  "Cost of Attendance (USD)",
  "COA Year",
  "COA Source URL",
  "Acceptance Rate",
  "Undergrad Enrollment",
  "Scorecard Source URL",
  "School Data Read Date",
] as const;

export interface ProgramDetailDraft {
  slug: string;
  city: string | null;
  state: string | null;
  costOfAttendanceUsd: number | null;
  coaYear: string | null;
  coaSourceUrl: string | null;
  acceptanceRate: number | null;
  undergradEnrollment: number | null;
  scorecardSourceUrl: string | null;
  coachesPageUrl: string | null;
  questionnaireUrl: string | null;
  /** yyyy-mm-dd */
  readDate: string;
}

export interface ProgramInfoImport {
  details: ProgramDetailDraft[];
  /** Rows or values left out, and why. */
  dropped: string[];
}

function gender(raw: string): CatalogGender | null {
  const g = raw.trim().toUpperCase();
  if (g === "M" || g === "MEN") return "men";
  if (g === "W" || g === "WOMEN") return "women";
  return null;
}

const url = (raw: string): string | null => (/^https?:\/\/\S+$/i.test(raw.trim()) ? raw.trim() : null);

function wholeNumber(raw: string): number | null {
  const s = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.0+)?$/.test(s)) return null;
  return Number(s);
}

/** "0.242", "24.2%" -> 0.242. Null when not a rate in (0, 1]. */
export function acceptanceRate(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const pct = s.endsWith("%");
  const n = Number(pct ? s.slice(0, -1) : s);
  if (!Number.isFinite(n)) return null;
  const v = pct ? n / 100 : n;
  if (!(v > 0 && v <= 1)) return null;
  return Math.round(v * 10_000) / 10_000;
}

function isoDate(raw: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T]00:00(?::00)?)?$/.exec(raw.trim());
  return m ? m[1] : null;
}

export function parseProgramInfo(csv: string): ProgramInfoImport {
  const rows = parseCsv(csv);
  if (rows.length === 0) throw new UtrDatabaseError("Program Info: the file is empty.");
  const header = rows[0].map((h) => h.trim());
  const missing = PROGRAM_INFO_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    throw new UtrDatabaseError(
      `Program Info: missing column(s) ${missing.map((m) => `"${m}"`).join(", ")}. ` +
        `Export the "Program Info" tab of the spreadsheet as CSV.`
    );
  }
  const records = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));

  const out: ProgramInfoImport = { details: [], dropped: [] };
  const seen = new Set<string>();
  for (const r of records) {
    const school = r["School"];
    if (!school) continue;
    const g = gender(r["Gender"]);
    if (!g) throw new UtrDatabaseError(`Program Info: unknown gender "${r["Gender"]}" for ${school}.`);
    const slug = programSlug(school, g);
    const who = `${school} (${g})`;
    if (seen.has(slug)) throw new UtrDatabaseError(`Program Info: ${who} appears twice.`);
    seen.add(slug);

    const readDate = isoDate(r["School Data Read Date"]);
    if (!readDate) {
      out.dropped.push(`${who}: no "School Data Read Date" (got "${r["School Data Read Date"]}") — row left out`);
      continue;
    }

    const state = /^[A-Z]{2}$/.test(r["State"]) ? r["State"] : null;
    if (r["State"] && !state) out.dropped.push(`${who}: state "${r["State"]}" is not a two-letter code — left out`);

    let cost = wholeNumber(r["Cost of Attendance (USD)"]);
    const coaYear = /^\d{4}-\d{2}$/.test(r["COA Year"]) ? r["COA Year"] : null;
    const coaSourceUrl = url(r["COA Source URL"]);
    if (cost !== null && (cost < 1000 || cost > 200_000)) {
      out.dropped.push(`${who}: cost of attendance ${cost} is outside 1,000–200,000 — left out`);
      cost = null;
    }
    if (cost !== null && (!coaYear || !coaSourceUrl)) {
      out.dropped.push(`${who}: cost of attendance has no COA year or source URL — left out`);
      cost = null;
    }

    const scorecardSourceUrl = url(r["Scorecard Source URL"]);
    let rate = acceptanceRate(r["Acceptance Rate"]);
    let enrollment = wholeNumber(r["Undergrad Enrollment"]);
    if (r["Acceptance Rate"] && rate === null) out.dropped.push(`${who}: acceptance rate "${r["Acceptance Rate"]}" unreadable — left out`);
    if ((rate !== null || enrollment !== null) && !scorecardSourceUrl) {
      out.dropped.push(`${who}: acceptance rate / enrollment have no Scorecard source URL — left out`);
      rate = null;
      enrollment = null;
    }
    if (enrollment !== null && enrollment <= 0) enrollment = null;

    out.details.push({
      slug,
      city: r["City"] || null,
      state,
      costOfAttendanceUsd: cost,
      coaYear: cost !== null ? coaYear : null,
      coaSourceUrl: cost !== null ? coaSourceUrl : null,
      acceptanceRate: rate,
      undergradEnrollment: enrollment,
      scorecardSourceUrl: rate !== null || enrollment !== null ? scorecardSourceUrl : null,
      coachesPageUrl: url(r["Coaches Page URL"]),
      questionnaireUrl: url(r["Recruiting Questionnaire URL"]),
      readDate,
    });
  }
  return out;
}

function lit(v: string | number | null): string {
  if (v === null) return "null";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`not a finite number: ${v}`);
    return String(v);
  }
  return `'${v.replace(/'/g, "''")}'`;
}

/**
 * SQL statements (no begin/commit: buildUtrDatabaseSql wraps them) that
 * upsert one program_details row per detail whose program exists. A detail
 * for a program that is not in `programs` matches no row and is skipped.
 */
export function buildProgramDetailsSql(details: readonly ProgramDetailDraft[]): string[] {
  if (details.length === 0) return [];
  return [
    "do $$ begin\n" +
      "  if to_regclass('public.program_details') is null then\n" +
      "    raise exception 'migration 053 is not on this database: refusing';\n" +
      "  end if;\n" +
      "end $$;",
    "insert into public.program_details (program_id, city, state, cost_of_attendance_usd, coa_year, coa_source_url, " +
      "acceptance_rate, undergrad_enrollment, scorecard_source_url, coaches_page_url, questionnaire_url, read_date)\n" +
      "select p.id, v.city, v.state, v.coa, v.coa_year, v.coa_url, v.rate, v.enroll, v.sc_url, v.coaches, v.quest, v.d::date from (values\n" +
      details
        .map(
          (d) =>
            "(" +
            [
              lit(d.slug),
              lit(d.city) + "::text",
              lit(d.state) + "::text",
              lit(d.costOfAttendanceUsd) + "::int",
              lit(d.coaYear) + "::text",
              lit(d.coaSourceUrl) + "::text",
              lit(d.acceptanceRate) + "::numeric",
              lit(d.undergradEnrollment) + "::int",
              lit(d.scorecardSourceUrl) + "::text",
              lit(d.coachesPageUrl) + "::text",
              lit(d.questionnaireUrl) + "::text",
              lit(d.readDate),
            ].join(",") +
            ")"
        )
        .join(",\n") +
      "\n) as v(slug, city, state, coa, coa_year, coa_url, rate, enroll, sc_url, coaches, quest, d)\n" +
      "join public.programs p on p.slug = v.slug\n" +
      "on conflict (program_id) do update set city = excluded.city, state = excluded.state, " +
      "cost_of_attendance_usd = excluded.cost_of_attendance_usd, coa_year = excluded.coa_year, " +
      "coa_source_url = excluded.coa_source_url, acceptance_rate = excluded.acceptance_rate, " +
      "undergrad_enrollment = excluded.undergrad_enrollment, scorecard_source_url = excluded.scorecard_source_url, " +
      "coaches_page_url = excluded.coaches_page_url, questionnaire_url = excluded.questionnaire_url, " +
      "read_date = excluded.read_date;",
  ];
}
