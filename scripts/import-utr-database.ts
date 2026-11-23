// Catalog import from the "College Tennis UTR Database" spreadsheet -> STAGING.
//
//   npx vite-node --config vitest.config.ts scripts/import-utr-database.ts -- \
//     --teams ~/seeded-data/utr-db/Teams.csv --players ~/seeded-data/utr-db/Players.csv \
//     [--program-info "~/seeded-data/utr-db/Program Info.csv"] \
//     [--season 2026-27] [--emit-sql out.sql] [--summary out.json] [--target staging|production]
//
// --program-info (optional) is the sheet's "Program Info" tab: city/state,
// cost of attendance, acceptance rate, enrollment, coaches page and
// questionnaire link, each with its source (migration 053, program_details;
// lib/catalog/program-info.ts). A value with no source is left out.
//
// The two CSVs are the sheet's "Teams" and "Players" tabs (File → Download →
// CSV). The Players tab names real students, so both files stay OUTSIDE the
// repo; nothing this script writes contains a player's name, profile link or
// note (lib/catalog/utr-database.ts; the test checks it).
//
// Without --emit-sql it only reads and prints what it would import and what
// it holds back, and why. With --emit-sql it writes one SQL transaction for a
// STAGING SQL session: programs upserted by slug, their class counts
// replaced, and one hand-curated team range per rated team (skipped if the
// identical range is already stored). The SQL refuses to run on a database
// whose `programs` table is empty (production's started empty), unless
// `--target production` is given — the owner approved the production import
// on 2026-11-22. It never fetches anything and never deletes a program.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSeason } from "../lib/catalog/class-year";
import { buildUtrDatabaseSql, parseUtrDatabase, RANGE_RULE, UtrDatabaseError } from "../lib/catalog/utr-database";
import { buildProgramDetailsSql, parseProgramInfo, type ProgramInfoImport } from "../lib/catalog/program-info";

interface Args {
  teams: string | null;
  players: string | null;
  programInfo: string | null;
  season: string;
  emitSql: string | null;
  summary: string | null;
  target: "staging" | "production";
}

function fail(message: string): never {
  console.error(`import-utr-database: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { teams: null, players: null, programInfo: null, season: "2026-27", emitSql: null, summary: null, target: "staging" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? fail(`${a} needs a value.`);
    if (a === "--") continue;
    else if (a === "--teams") args.teams = next();
    else if (a === "--players") args.players = next();
    else if (a === "--program-info") args.programInfo = next();
    else if (a === "--season") args.season = next();
    else if (a === "--emit-sql") args.emitSql = next();
    else if (a === "--summary") args.summary = next();
    else if (a === "--target") {
      const t = next();
      if (t !== "staging" && t !== "production") fail(`--target must be staging or production, got "${t}".`);
      args.target = t;
    }
    else fail(`Unknown argument: ${a}`);
  }
  return args;
}

function readCsv(path: string | null, flag: string): string {
  if (!path) fail(`${flag} <file.csv> is required.`);
  const full = resolve(path.replace(/^~(?=\/)/, process.env.HOME ?? "~"));
  if (!existsSync(full)) fail(`${flag}: file not found: ${path}. Nothing was read or written.`);
  if (full.startsWith(resolve(process.cwd()) + "/") && !full.includes("/node_modules/")) {
    fail(`${flag}: ${path} is inside the repo. The Players tab names real students: keep both exports outside it.`);
  }
  return readFileSync(full, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const season = parseSeason(args.season);
  if (!season) fail(`--season must look like 2026-27, got "${args.season}".`);

  let data;
  try {
    data = parseUtrDatabase(readCsv(args.teams, "--teams"), readCsv(args.players, "--players"), {
      shown: season.label,
      startYear: season.startYear,
    });
  } catch (err) {
    if (err instanceof UtrDatabaseError) fail(err.message);
    throw err;
  }

  let info: ProgramInfoImport | null = null;
  if (args.programInfo) {
    try {
      info = parseProgramInfo(readCsv(args.programInfo, "--program-info"));
    } catch (err) {
      if (err instanceof UtrDatabaseError) fail(err.message);
      throw err;
    }
    // Details only for programs this run imports; the rest have no row to hang on.
    const imported = new Set(data.programs.map((p) => p.slug));
    const orphans = info.details.filter((d) => !imported.has(d.slug));
    info = { details: info.details.filter((d) => imported.has(d.slug)), dropped: info.dropped };
    for (const o of orphans) info.dropped.push(`${o.slug}: no imported program (team held or not on Teams) — details left out`);
  }

  const men = data.programs.filter((p) => p.gender === "men").length;
  console.log(`import-utr-database: season ${season.label}; range rule: ${RANGE_RULE}`);
  console.log(
    `  programs: ${data.programs.length} (${men} men, ${data.programs.length - men} women); ` +
      `ranges: ${data.ranges.length}; player rows read ${data.playerRowsRead}, counted ${data.playerRowsCounted} ` +
      `(the rest are not on the official roster or belong to a held team)`
  );
  for (const h of data.held) console.log(`  HELD (${h.scope}): ${h.school} (${h.gender}) — ${h.reason}`);
  for (const w of data.warnings) console.log(`  note: ${w}`);
  if (info) {
    const n = (f: (d: ProgramInfoImport["details"][number]) => unknown) => info!.details.filter((d) => f(d) !== null).length;
    console.log(
      `  program info: ${info.details.length} programs; cost of attendance ${n((d) => d.costOfAttendanceUsd)}, ` +
        `acceptance rate ${n((d) => d.acceptanceRate)}, enrollment ${n((d) => d.undergradEnrollment)}, ` +
        `city/state ${n((d) => d.state)}, questionnaire ${n((d) => d.questionnaireUrl)}`
    );
    for (const d of info.dropped) console.log(`  program info, left out: ${d}`);
  }

  if (args.summary) {
    const summary = {
      season: season.label,
      rangeRule: RANGE_RULE,
      programs: data.programs.map((p) => ({
        slug: p.slug,
        division: p.division,
        conference: p.conference,
        playersListed: p.playersListed,
        classCounts: p.classCounts,
        sourceDate: p.sourceDate,
      })),
      ranges: data.ranges,
      programDetails: info?.details ?? [],
      held: data.held,
      warnings: data.warnings,
    };
    writeFileSync(resolve(args.summary), JSON.stringify(summary, null, 2) + "\n");
    console.log(`import-utr-database: wrote ${args.summary}`);
  }

  if (args.emitSql) {
    writeFileSync(resolve(args.emitSql), buildUtrDatabaseSql(data, args.target, info ? buildProgramDetailsSql(info.details) : []));
    console.log(`import-utr-database: wrote ${args.emitSql} (target: ${args.target})`);
  }
}

main();
