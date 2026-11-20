// Catalog phase 1 importer: official-roster TSV -> class counts -> STAGING.
//
//   npx vite-node --config vitest.config.ts scripts/import-rosters.ts -- \
//     --checked-on 2026-11-19 [--file docs/data/official_rosters_2026-27.tsv] \
//     [--expected expected-programs.tsv] [--upsert]
//
// Without --upsert it only reads: it writes the JSON summary and rewrites
// the generated block of docs/catalog/phase-1-import.md. With --upsert it
// also writes programs + program_class_counts to the database named by
// SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) using SUPABASE_SERVICE_ROLE_KEY
// — and refuses outright if that is production.
//
// What it never does: store or print a player's name or hometown, fetch
// anything from the web, touch team_ranges (ranges are entered by the owner,
// with a source, through /admin/team-ranges), or delete a program.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/database.types";
import { getSchools } from "../lib/db/schools";
import { parseExpectedTsv, parseRosterTsv, RosterFileError, type ProgramDraft } from "../lib/catalog/roster-import";
import { buildImportSummary, renderImportReport, spliceReport } from "../lib/catalog/import-report";
import { assertSafeImportTarget } from "../lib/catalog/import-target";
import { toTeamRange, TEAM_RANGE_COLUMNS } from "../lib/db/programs";
import type { TeamRange } from "../lib/catalog/programs";

const DEFAULT_FILE = "docs/data/official_rosters_2026-27.tsv";
const SUMMARY_FILE = "docs/catalog/phase-1-import.summary.json";
const REPORT_FILE = "docs/catalog/phase-1-import.md";

interface Args {
  file: string;
  checkedOn: string | null;
  expected: string | null;
  upsert: boolean;
  allowRef: string | null;
  summary: string;
  report: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    file: DEFAULT_FILE,
    checkedOn: null,
    expected: null,
    upsert: false,
    allowRef: null,
    summary: SUMMARY_FILE,
    report: REPORT_FILE,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (!v) fail(`${a} needs a value.`);
      return v;
    };
    if (a === "--") continue;
    else if (a === "--file") args.file = next();
    else if (a === "--checked-on") args.checkedOn = next();
    else if (a === "--expected") args.expected = next();
    else if (a === "--upsert") args.upsert = true;
    else if (a === "--allow-ref") args.allowRef = next();
    else if (a === "--summary") args.summary = next();
    else if (a === "--report") args.report = next();
    else if (a === "--no-report") args.report = null;
    else fail(`Unknown argument: ${a}`);
  }
  return args;
}

function fail(message: string): never {
  console.error(`import-rosters: ${message}`);
  process.exit(1);
}

async function upsertPrograms(
  client: ReturnType<typeof createClient<Database>>,
  drafts: ProgramDraft[],
  checkedOn: string
): Promise<Record<string, TeamRange[]>> {
  for (const d of drafts) {
    const { data, error } = await client
      .from("programs")
      .upsert(
        {
          slug: d.slug,
          school: d.school,
          gender: d.gender,
          division: d.division,
          conference: d.conference,
          head_coach: d.headCoach,
          roster_url: d.rosterUrl,
          season_shown: d.seasonShown,
          season_start_year: d.seasonStartYear,
          players_listed: d.playersListed,
          unknown_class_count: d.unknownClassCount,
          last_verified: checkedOn,
          source_url: d.rosterUrl,
          source_date: checkedOn,
        },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (error || !data) fail(`upsert of ${d.slug} failed: ${error?.message ?? "no row returned"}`);

    const rows = Object.entries(d.classCounts).map(([year, n]) => ({
      program_id: data.id,
      class_year: Number(year),
      players: n,
    }));
    // The counts are a snapshot of one roster: replace them wholesale.
    const del = await client.from("program_class_counts").delete().eq("program_id", data.id);
    if (del.error) fail(`clearing counts for ${d.slug} failed: ${del.error.message}`);
    if (rows.length) {
      const ins = await client.from("program_class_counts").insert(rows);
      if (ins.error) fail(`counts for ${d.slug} failed: ${ins.error.message}`);
    }
  }

  // Ranges already entered by the owner, for the coverage table.
  const { data: programs } = await client.from("programs").select("id, slug");
  const { data: ranges } = await client.from("team_ranges").select(TEAM_RANGE_COLUMNS);
  const slugById = new Map((programs ?? []).map((p) => [p.id, p.slug]));
  const out: Record<string, TeamRange[]> = {};
  for (const row of ranges ?? []) {
    const slug = slugById.get(row.program_id);
    const range = toTeamRange(row);
    if (slug && range) (out[slug] ??= []).push(range);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.checkedOn || !/^\d{4}-\d{2}-\d{2}$/.test(args.checkedOn)) {
    fail(
      "--checked-on YYYY-MM-DD is required: the date the rosters in the file were read. " +
        "It is shown beside every count in the app, so it cannot be defaulted."
    );
  }

  const file = resolve(args.file);
  if (!existsSync(file)) {
    fail(
      `roster file not found: ${args.file}\n` +
        `  The phase-1 input (${DEFAULT_FILE}) has not been added to the repo yet.\n` +
        `  Add the TSV (columns: Conference, School, Gender, HeadCoach, RosterURL, SeasonShown,\n` +
        `  Player, Class, Hometown, Notes), then re-run. Nothing was read or written.`
    );
  }

  let parsed;
  try {
    parsed = parseRosterTsv(readFileSync(file, "utf8"));
  } catch (err) {
    if (err instanceof RosterFileError) fail(err.message);
    throw err;
  }

  const expected = args.expected ? parseExpectedTsv(readFileSync(resolve(args.expected), "utf8")) : null;

  let rangesBySlug: Record<string, TeamRange[]> = {};
  if (args.upsert) {
    if (parsed.failed) {
      fail(
        `${(parsed.errorRate * 100).toFixed(1)}% of rows have errors (limit 5%). Nothing was upserted. ` +
          `Run without --upsert to see the error list in the summary.`
      );
    }
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    try {
      assertSafeImportTarget({ url, key, allowRef: args.allowRef });
    } catch (err) {
      fail((err as Error).message);
    }
    const client = createClient<Database>(url, key, { auth: { persistSession: false } });
    rangesBySlug = await upsertPrograms(client, parsed.programs, args.checkedOn);
    console.log(`import-rosters: upserted ${parsed.programs.length} program(s) to ${new URL(url).host}.`);
  }

  const summary = buildImportSummary({
    inputFile: basename(file),
    checkedOn: args.checkedOn,
    parsed,
    expected,
    rangesBySlug,
    legacySchools: await getSchools(),
  });
  writeFileSync(resolve(args.summary), JSON.stringify(summary, null, 2) + "\n");
  console.log(`import-rosters: wrote ${args.summary}`);

  if (args.report) {
    const doc = readFileSync(resolve(args.report), "utf8");
    writeFileSync(resolve(args.report), spliceReport(doc, renderImportReport(summary)));
    console.log(`import-rosters: updated the generated block of ${args.report}`);
  }

  console.log(
    `import-rosters: ${summary.totals.programs} programs (${summary.totals.men} men, ${summary.totals.women} women), ` +
      `${summary.rowsRead} rows, ${summary.errors.length} error(s)` +
      (parsed.failed ? " — OVER the 5% error limit" : "")
  );
  if (parsed.failed) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
