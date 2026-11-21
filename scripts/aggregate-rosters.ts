// Raw roster file (one row per player) -> the aggregated counts file the
// repo holds (one row per team, no names).
//
//   npx vite-node --config vitest.config.ts scripts/aggregate-rosters.ts -- \
//     [--in ~/seeded-private/official_rosters_2026-27.tsv] \
//     [--out docs/data/roster_counts_2026-27.tsv]
//
// The raw file names real students, so it is never committed: keep it in
// ~/seeded-private/ (chmod 600; `.gitignore` also blocks the pattern inside
// the repo). This script refuses to write unless (1) reading its own output
// back gives exactly the raw parse (with quoted cell text redacted from row
// errors and odd class labels folded), and (2) no personal value from the
// raw file — any non-team cell, or a word of a player's name — appears in it.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseRosterTsv, RosterFileError } from "../lib/catalog/roster-import";
import { parseRosterCountsTsv, personalValuesIn, redactForCounts, serializeRosterCounts } from "../lib/catalog/roster-counts";

const DEFAULT_RAW = join(homedir(), "seeded-private", "official_rosters_2026-27.tsv");
const DEFAULT_OUT = "docs/data/roster_counts_2026-27.tsv";

function fail(message: string): never {
  console.error(`aggregate-rosters: ${message}`);
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  let input = DEFAULT_RAW;
  let output = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--in") input = argv[++i] ?? fail("--in needs a path");
    else if (argv[i] === "--out") output = argv[++i] ?? fail("--out needs a path");
    else fail(`Unknown argument: ${argv[i]}`);
  }
  input = resolve(input.replace(/^~(?=\/)/, homedir()));
  if (!existsSync(input)) fail(`raw roster file not found: ${input}. Nothing was written.`);

  const rawText = readFileSync(input, "utf8");
  let parsed;
  try {
    parsed = parseRosterTsv(rawText);
  } catch (err) {
    if (err instanceof RosterFileError) fail(err.message);
    throw err;
  }
  const text = serializeRosterCounts(parsed, { sourceFile: basename(input) });

  const back = parseRosterCountsTsv(text);
  const expected = redactForCounts(parsed);
  for (const key of ["programs", "notRetrieved", "unknownLabels", "rowsRead", "rowsUsed", "errors", "errorRate", "failed"] as const) {
    if (!isDeepStrictEqual(back[key], expected[key])) fail(`round trip changed "${key}". Nothing was written.`);
  }

  const leaked = personalValuesIn(rawText, text);
  if (leaked.length) fail(`${leaked.length} personal value(s) would appear in the output. Nothing was written.`);

  writeFileSync(resolve(output), text);
  console.log(
    `aggregate-rosters: wrote ${output} — ${parsed.programs.length} teams, ${parsed.notRetrieved.length} not retrieved, ` +
      `from ${parsed.rowsRead} raw rows; round trip identical; 0 personal values in the output.`
  );
}

main();
