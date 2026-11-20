// Reads imported programs (migration 048) and writes team ranges.
//
// Reads are public catalog data, so the server loader uses the publishable
// key with no session — the same thing a signed-out visitor's browser could
// read. Writes to team_ranges go through the signed-in browser client and
// RLS decides (team_ranges_insert_admin: app admins only, as themselves,
// with a source and a date). The form being admin-only is cosmetic; the
// policy is the gate.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { narrowOptionalLiteral } from "./narrow";
import type { ImportedProgram, RangeSourceType, TeamRange } from "@/lib/catalog/programs";
import { RANGE_SOURCE_TYPES } from "@/lib/catalog/programs";

const GENDERS = ["men", "women"] as const;
const DIVISIONS = ["D1", "D2", "D3", "NAIA", "JUCO"] as const;

/** Named, never `*`: entered_by is not readable by clients (048's column
 * grant), and `select *` would fail on it. */
export const TEAM_RANGE_COLUMNS =
  "program_id, low, middle, high, source_type, source, source_url, source_date, created_at";

const PROGRAM_COLUMNS =
  "id, slug, school, gender, division, conference, roster_url, season_shown, season_start_year, players_listed, unknown_class_count, source_date, source_url";

type Client = SupabaseClient<Database>;

function publicClient(): Client | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Catalog data changes when the owner imports or enters a range; an
    // hour's staleness on a public page is fine and keeps it cacheable.
    global: { fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 3600 } }) },
  });
}

type ProgramRow = Pick<
  Database["public"]["Tables"]["programs"]["Row"],
  | "id"
  | "slug"
  | "school"
  | "gender"
  | "division"
  | "conference"
  | "roster_url"
  | "season_shown"
  | "season_start_year"
  | "players_listed"
  | "unknown_class_count"
  | "source_date"
  | "source_url"
>;
type RangeRow = Omit<Database["public"]["Tables"]["team_ranges"]["Row"], "id" | "entered_by">;
type CountRow = Database["public"]["Tables"]["program_class_counts"]["Row"];

export function toTeamRange(row: RangeRow): TeamRange | null {
  const sourceType = narrowOptionalLiteral(row.source_type, RANGE_SOURCE_TYPES);
  if (!sourceType) return null;
  return {
    low: Number(row.low),
    middle: Number(row.middle),
    high: Number(row.high),
    sourceType,
    source: row.source,
    sourceUrl: row.source_url,
    sourceDate: row.source_date,
    createdAt: row.created_at,
  };
}

/** Joins the three tables into the UI shape. Exported for tests. Rows with
 * a value outside the schema's enums are dropped, not coerced. */
export function assemblePrograms(programs: ProgramRow[], counts: CountRow[], ranges: RangeRow[]): ImportedProgram[] {
  const out: ImportedProgram[] = [];
  for (const p of programs) {
    const gender = narrowOptionalLiteral(p.gender, GENDERS);
    const division = narrowOptionalLiteral(p.division, DIVISIONS);
    if (!gender || !division) continue;
    out.push({
      id: p.id,
      slug: p.slug,
      school: p.school,
      gender,
      division,
      conference: p.conference,
      rosterUrl: p.roster_url,
      seasonShown: p.season_shown,
      seasonStartYear: p.season_start_year,
      playersListed: p.players_listed,
      unknownClassCount: p.unknown_class_count,
      sourceDate: p.source_date,
      sourceUrl: p.source_url,
      classCounts: counts
        .filter((c) => c.program_id === p.id)
        .map((c) => ({ classYear: c.class_year, players: c.players })),
      ranges: ranges
        .filter((r) => r.program_id === p.id)
        .map(toTeamRange)
        .filter((r): r is TeamRange => r !== null),
    });
  }
  return out;
}

/**
 * Every imported program with its class counts and ranges, for the
 * flag-gated /schools section and the admin form. Empty (never throws) when
 * Supabase is not configured or a read fails — the section then shows
 * nothing rather than breaking /schools.
 */
export async function loadImportedPrograms(client: Client | null = publicClient()): Promise<ImportedProgram[]> {
  if (!client) return [];
  const [programs, counts, ranges] = await Promise.all([
    client.from("programs").select(PROGRAM_COLUMNS).order("school"),
    client.from("program_class_counts").select("program_id, class_year, players"),
    client.from("team_ranges").select(TEAM_RANGE_COLUMNS),
  ]);
  if (programs.error || counts.error || ranges.error) return [];
  return assemblePrograms(
    (programs.data ?? []) as ProgramRow[],
    (counts.data ?? []) as CountRow[],
    (ranges.data ?? []) as RangeRow[]
  );
}

export interface NewTeamRange {
  programId: string;
  low: number;
  middle: number;
  high: number;
  sourceType: RangeSourceType;
  source: string;
  sourceUrl: string | null;
  sourceDate: string;
}

/** Client-side shape check, so the admin sees a sentence instead of a
 * Postgres constraint name. The database re-checks every one of these. */
export function teamRangeInputError(r: NewTeamRange, todayIso: string): string | null {
  const nums = [r.low, r.middle, r.high];
  if (!r.programId) return "Pick a program.";
  if (nums.some((v) => !Number.isFinite(v))) return "Enter all three numbers.";
  if (nums.some((v) => v < 1 || v > 16.5)) return "UTR values run from 1.00 to 16.50.";
  if (!(r.low <= r.middle && r.middle <= r.high)) return "Low must be at or below middle, and middle at or below high.";
  if (!RANGE_SOURCE_TYPES.includes(r.sourceType)) return "Pick where the range came from.";
  if (r.source.trim().length < 3) return "Say where the range came from (at least a few words).";
  if (r.sourceUrl && !/^https?:\/\/\S+$/i.test(r.sourceUrl)) return "The source link must start with http:// or https://.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.sourceDate)) return "Enter the date the source was read.";
  if (r.sourceDate > todayIso) return "The source date can't be in the future.";
  return null;
}

/** Insert one range as the signed-in user. RLS refuses anyone who is not an
 * app admin (42501), and refuses entered_by for anyone else. */
export async function insertTeamRange(client: Client, r: NewTeamRange): Promise<{ error: string | null }> {
  const { error } = await client.from("team_ranges").insert({
    program_id: r.programId,
    low: r.low,
    middle: r.middle,
    high: r.high,
    source_type: r.sourceType,
    source: r.source.trim(),
    source_url: r.sourceUrl?.trim() || null,
    source_date: r.sourceDate,
  });
  if (!error) return { error: null };
  if (error.code === "42501") return { error: "Only an app admin can add a range." };
  return { error: "Could not save the range. Check the values and try again." };
}

/** Whether the signed-in user is an app admin. False on any error. */
export async function isAppAdmin(client: Client): Promise<boolean> {
  const { data, error } = await client.rpc("is_app_admin");
  return !error && data === true;
}
