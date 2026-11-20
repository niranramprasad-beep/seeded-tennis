// Builds the phase-1 import summary (JSON) and the report tables (markdown)
// from a parsed roster file. Pure; scripts/import-rosters.ts does the I/O.
//
// Nothing here can carry a player's name: it only ever sees ProgramDraft,
// which has none (lib/catalog/roster-import.ts).

import type { SchoolLite } from "@/lib/types";
import { seasonStartYearForIsoDate } from "./class-year";
import { coverageTable, legacyCoverageTable, type CoverageRow } from "./coverage";
import { bandableRange, type ImportedProgram, type TeamRange } from "./programs";
import {
  missingPrograms,
  type ExpectedProgram,
  type ParseResult,
  type ProgramDraft,
  type RowError,
} from "./roster-import";

export const REPORT_BEGIN = "<!-- import-report:begin -->";
export const REPORT_END = "<!-- import-report:end -->";

export interface ImportSummary {
  inputFile: string;
  checkedOn: string;
  currentSeason: string;
  rowsRead: number;
  rowsUsed: number;
  errorRate: number;
  failed: boolean;
  totals: { programs: number; men: number; women: number; playersListed: number; unknownClass: number };
  byConference: { conference: string; division: string; men: number; women: number; playersListed: number }[];
  programs: (Omit<ProgramDraft, "headCoach"> & { earlierSeason: boolean; hasRange: boolean })[];
  noPlayersListed: string[];
  /** null when no expected-programs list was supplied: unknown, not "none". */
  missing: ExpectedProgram[] | null;
  earlierSeasonRosters: { slug: string; school: string; gender: string; seasonShown: string }[];
  unknownLabels: Record<string, number>;
  errors: RowError[];
  ranges: { withRange: number; withoutRange: number };
  coverage: CoverageRow[];
  legacyCoverage: ReturnType<typeof legacyCoverageTable>;
}

function seasonLabel(start: number): string {
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** A local Date for a yyyy-mm-dd string, at noon so no zone moves the day. */
export function localDateFromIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Not a yyyy-mm-dd date: ${iso}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

export function draftToProgram(d: ProgramDraft, checkedOn: string, ranges: TeamRange[] = []): ImportedProgram {
  return {
    id: d.slug,
    slug: d.slug,
    school: d.school,
    gender: d.gender,
    division: d.division,
    conference: d.conference,
    rosterUrl: d.rosterUrl,
    seasonShown: d.seasonShown,
    seasonStartYear: d.seasonStartYear,
    playersListed: d.playersListed,
    unknownClassCount: d.unknownClassCount,
    sourceDate: checkedOn,
    sourceUrl: d.rosterUrl,
    classCounts: Object.entries(d.classCounts).map(([y, n]) => ({ classYear: Number(y), players: n })),
    ranges,
  };
}

export function buildImportSummary(input: {
  inputFile: string;
  checkedOn: string;
  parsed: ParseResult;
  expected?: ExpectedProgram[] | null;
  rangesBySlug?: Record<string, TeamRange[]>;
  legacySchools: Pick<SchoolLite, "gender" | "minCompetitiveUTR" | "avgRosterUTR">[];
}): ImportSummary {
  const { parsed, checkedOn } = input;
  const current = seasonStartYearForIsoDate(checkedOn);
  if (current === null) throw new Error(`checkedOn must be yyyy-mm-dd, got ${checkedOn}`);
  const now = localDateFromIso(checkedOn);
  const ranges = input.rangesBySlug ?? {};
  const programs = parsed.programs.map((d) => draftToProgram(d, checkedOn, ranges[d.slug] ?? []));

  const conferences = new Map<string, ImportSummary["byConference"][number]>();
  for (const d of parsed.programs) {
    const row = conferences.get(d.conference) ?? {
      conference: d.conference,
      division: d.division,
      men: 0,
      women: 0,
      playersListed: 0,
    };
    row[d.gender]++;
    row.playersListed += d.playersListed;
    conferences.set(d.conference, row);
  }

  const withRange = programs.filter((p) => bandableRange(p, now) !== null).length;

  return {
    inputFile: input.inputFile,
    checkedOn,
    currentSeason: seasonLabel(current),
    rowsRead: parsed.rowsRead,
    rowsUsed: parsed.rowsUsed,
    errorRate: Number(parsed.errorRate.toFixed(4)),
    failed: parsed.failed,
    totals: {
      programs: parsed.programs.length,
      men: parsed.programs.filter((p) => p.gender === "men").length,
      women: parsed.programs.filter((p) => p.gender === "women").length,
      playersListed: parsed.programs.reduce((n, p) => n + p.playersListed, 0),
      unknownClass: parsed.programs.reduce((n, p) => n + p.unknownClassCount, 0),
    },
    byConference: [...conferences.values()].sort((a, b) => a.conference.localeCompare(b.conference)),
    // headCoach is stored in the database (it is printed on the official
    // roster page) but kept out of the summary file, which is about counts.
    programs: parsed.programs.map(({ headCoach: _omit, ...d }) => ({
      ...d,
      earlierSeason: d.seasonStartYear < current,
      hasRange: bandableRange({ ranges: ranges[d.slug] ?? [] }, now) !== null,
    })),
    noPlayersListed: parsed.programs.filter((p) => p.playersListed === 0).map((p) => p.slug),
    missing: input.expected ? missingPrograms(input.expected, parsed.programs) : null,
    earlierSeasonRosters: parsed.programs
      .filter((p) => p.seasonStartYear < current)
      .map((p) => ({ slug: p.slug, school: p.school, gender: p.gender, seasonShown: p.seasonShown })),
    unknownLabels: parsed.unknownLabels,
    errors: parsed.errors,
    ranges: { withRange, withoutRange: programs.length - withRange },
    coverage: coverageTable(programs, now),
    legacyCoverage: legacyCoverageTable(input.legacySchools),
  };
}

/* ------------------------------------------------------------ markdown */

function table(head: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.map((c) => String(c).replace(/\|/g, "\\|")).join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...rows.map(line)].join("\n");
}

/** The generated block that replaces everything between REPORT_BEGIN and
 * REPORT_END in docs/catalog/phase-1-import.md. */
export function renderImportReport(s: ImportSummary): string {
  const out: string[] = [];
  out.push(
    `_Generated by \`scripts/import-rosters.ts\` from \`${s.inputFile}\`, rosters read ${s.checkedOn} ` +
      `(current season ${s.currentSeason}). ${s.rowsRead} rows read, ${s.rowsUsed} used, ` +
      `${s.errors.length} error(s), error rate ${(s.errorRate * 100).toFixed(1)}%` +
      `${s.failed ? " — **over the 5% limit: nothing was upserted**" : ""}._`
  );

  out.push("\n### Programs by conference and gender\n");
  out.push(
    table(
      ["Conference", "Division", "Men", "Women", "Players listed"],
      [
        ...s.byConference.map((c) => [c.conference, c.division, c.men, c.women, c.playersListed]),
        ["**Total**", "", s.totals.men, s.totals.women, s.totals.playersListed],
      ]
    )
  );
  out.push(
    `\n${s.totals.unknownClass} listed player(s) had a class label the importer could not read; ` +
      `they count toward "players listed" and toward no class.`
  );

  out.push("\n### Programs missing\n");
  if (s.missing === null) {
    out.push(
      "No expected-programs list was supplied (`--expected`), so teams absent from the roster file " +
        "cannot be named from the file alone."
    );
  } else if (s.missing.length === 0) {
    out.push("Every program on the expected list is in the roster file.");
  } else {
    out.push(table(["Conference", "School", "Gender"], s.missing.map((m) => [m.conference, m.school, m.gender])));
  }
  if (s.noPlayersListed.length) {
    out.push(`\nIn the file but with no players listed: ${s.noPlayersListed.map((x) => `\`${x}\``).join(", ")}.`);
  }

  out.push("\n### Rosters from an earlier season\n");
  if (s.earlierSeasonRosters.length === 0) {
    out.push(`None: every roster shows the ${s.currentSeason} season.`);
  } else {
    out.push(
      table(
        ["School", "Gender", "Season shown"],
        s.earlierSeasonRosters.map((r) => [r.school, r.gender, r.seasonShown])
      )
    );
    out.push(
      `\nThese show as "the ${s.earlierSeasonRosters[0].seasonShown} roster" in the app, with a note that ` +
        "its seniors have already finished."
    );
  }

  out.push("\n### Unreadable class labels\n");
  const labels = Object.entries(s.unknownLabels).sort((a, b) => b[1] - a[1]);
  out.push(labels.length === 0 ? "None." : table(["Label as written", "Rows"], labels));

  out.push("\n### Row errors\n");
  out.push(
    s.errors.length === 0
      ? "None."
      : table(["Line", "Problem"], s.errors.map((e) => [e.line || "—", e.reason]))
  );

  out.push("\n### Team ranges\n");
  out.push(
    `${s.ranges.withRange} of ${s.totals.programs} imported programs have a current, sourced team range; ` +
      `${s.ranges.withoutRange} show "Level not rated yet" and are excluded from every band.`
  );

  out.push("\n### Coverage for sample players (today's rating, no projection)\n");
  out.push(
    table(
      ["Player", "Imported programs rated", "Imported not rated", "Target (imported)", "Likely (imported)", "Target (legacy catalog, unverified)", "Likely (legacy catalog, unverified)"],
      s.coverage.map((c) => {
        const legacy = s.legacyCoverage.find((l) => l.utr === c.utr && l.gender === c.gender)!;
        return [
          `${c.gender === "men" ? "Men's" : "Women's"} UTR ${c.utr}`,
          c.ratedPrograms,
          c.unratedPrograms,
          c.target,
          c.likely,
          legacy.target,
          legacy.likely,
        ];
      })
    )
  );
  out.push(
    "\nImported programs count only once the owner enters a sourced range for them. The legacy columns " +
      "are the existing catalog, whose ranges are all labelled \"Unverified estimate\"."
  );
  return out.join("\n");
}

/** Replace the generated block in the doc, leaving the hand-written text. */
export function spliceReport(doc: string, generated: string): string {
  const a = doc.indexOf(REPORT_BEGIN);
  const b = doc.indexOf(REPORT_END);
  if (a === -1 || b === -1 || b < a) {
    throw new Error(`The report doc must contain ${REPORT_BEGIN} and ${REPORT_END}.`);
  }
  return doc.slice(0, a + REPORT_BEGIN.length) + "\n" + generated + "\n" + doc.slice(b);
}
