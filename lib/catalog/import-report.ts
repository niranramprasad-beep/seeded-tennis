// Builds the phase-1 import summary (JSON) and the report tables (markdown)
// from a parsed roster file. Pure; scripts/import-rosters.ts does the I/O.
//
// Nothing here can carry a player's name: it only ever sees ProgramDraft,
// which has none (lib/catalog/roster-import.ts).

import type { SchoolLite } from "@/lib/types";
import { seasonStartYearForIsoDate } from "./class-year";
import { coverageTable, legacyCoverageTable, type CoverageRow } from "./coverage";
import { legacyMatchFor, schoolNameKey } from "./legacy-match";
import { bandableRange, finalYearDisplay, finalYearCountFor, type ImportedProgram, type TeamRange } from "./programs";
import {
  CONFERENCE_DIVISION,
  type ExpectedProgram,
  type NotRetrievedProgram,
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
  /** In the file, but no roster was retrieved: not imported. */
  notRetrieved: NotRetrievedProgram[];
  /** Imported programs that are the same team as a legacy catalog entry. */
  legacyMatches: { slug: string; legacySlug: string }[];
  /** Rosters that printed a single spring year, read as the season before. */
  springYearRosters: string[];
  perConference: ConferenceRow[];
  /** Seniors (final-year players) on CURRENT-season rosters whose classes
   * could be read. Earlier-season rosters are left out: theirs have gone. */
  finalYearOnCurrentRosters: { gender: "men" | "women"; programs: number; seniors: number; untracked: number }[];
  /** Where entering a team range helps a UTR 5–8 junior soonest. */
  startHere: StartHereRow[];
  /** null when no expected-programs list was supplied: unknown, not "none". */
  missing: ExpectedProgram[] | null;
  earlierSeasonRosters: { slug: string; school: string; gender: string; seasonShown: string }[];
  unknownLabels: Record<string, number>;
  errors: RowError[];
  ranges: { withRange: number; withoutRange: number };
  coverage: CoverageRow[];
  legacyCoverage: ReturnType<typeof legacyCoverageTable>;
}

export interface ConferenceRow {
  conference: string;
  division: string;
  /** Programs imported with a roster. */
  imported: number;
  /** In the file, roster not retrieved. */
  notRetrieved: number;
  /** On the expected list but not in the file at all; null = no list given. */
  absent: number | null;
  /** Imported rosters from an earlier season. */
  stale: number;
  players: number;
}

export interface StartHereRow {
  slug: string;
  school: string;
  gender: "men" | "women";
  division: string;
  conference: string;
  seniors: number;
  playersListed: number;
  unknownClass: number;
}

/** "D3 and lower-level D1 first": the order the owner asked for. In this
 * file's ten conferences, "lower-level D1" is read as every D1 conference
 * except the Ivy League. A sort order, not a claim about any team's level. */
function startHereTier(p: { division: string; conference: string }): number {
  if (p.division === "D3") return 0;
  if (p.division === "D1" && p.conference !== "Ivy League") return 1;
  return 2;
}

const START_HERE_COUNT = 20;

function seasonLabel(start: number): string {
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** A local Date for a yyyy-mm-dd string, at noon so no zone moves the day. */
function localDateFromIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Not a yyyy-mm-dd date: ${iso}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

function draftToProgram(d: ProgramDraft, checkedOn: string, ranges: TeamRange[] = []): ImportedProgram {
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
  legacySchools: Pick<SchoolLite, "slug" | "name" | "gender" | "conference" | "minCompetitiveUTR" | "avgRosterUTR">[];
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

  const legacyMatches = parsed.programs.flatMap((d) => {
    const hit = legacyMatchFor(d, input.legacySchools);
    return hit ? [{ slug: d.slug, legacySlug: hit.slug }] : [];
  });
  const duplicated = new Set(legacyMatches.map((m) => m.slug));
  // Expected programs the file does not mention at all (neither imported
  // nor a not-retrieved placeholder). Matched on conference + gender + the
  // school's name key, so "Washington St. Louis" and "WashU" agree.
  const key = (p: { conference: string; school: string; gender: string }) =>
    `${p.conference}\u0000${p.gender}\u0000${schoolNameKey(p.school)}`;
  const inFile = new Set([...parsed.programs, ...parsed.notRetrieved].map(key));
  const absent = input.expected ? input.expected.filter((e) => !inFile.has(key(e))) : null;

  const confNames = new Set<string>([
    ...parsed.programs.map((p) => p.conference),
    ...parsed.notRetrieved.map((p) => p.conference),
    ...(absent ?? []).map((p) => p.conference),
  ]);
  const perConference: ConferenceRow[] = [...confNames].sort().map((conference) => {
    const ps = parsed.programs.filter((p) => p.conference === conference);
    return {
      conference,
      division: ps[0]?.division ?? CONFERENCE_DIVISION[conference] ?? "",
      imported: ps.length,
      notRetrieved: parsed.notRetrieved.filter((p) => p.conference === conference).length,
      absent: absent ? absent.filter((p) => p.conference === conference).length : null,
      stale: ps.filter((p) => p.seasonStartYear < current).length,
      players: ps.reduce((n, p) => n + p.playersListed, 0),
    };
  });

  const currentTracked = programs.filter((p) => p.seasonStartYear === current && finalYearDisplay(p, now).tracked);
  const finalYearOnCurrentRosters = (["men", "women"] as const).map((gender) => {
    const ofGender = programs.filter((p) => p.gender === gender && p.seasonStartYear === current);
    const tracked = currentTracked.filter((p) => p.gender === gender);
    return {
      gender,
      programs: tracked.length,
      seniors: tracked.reduce((n, p) => n + finalYearCountFor(p), 0),
      untracked: ofGender.length - tracked.length,
    };
  });

  const startHere: StartHereRow[] = currentTracked
    .filter((p) => !duplicated.has(p.slug) && startHereTier(p) < 2)
    .map((p) => ({
      slug: p.slug,
      school: p.school,
      gender: p.gender,
      division: p.division,
      conference: p.conference,
      seniors: finalYearCountFor(p),
      playersListed: p.playersListed,
      unknownClass: p.unknownClassCount,
    }))
    .sort(
      (a, b) =>
        b.seniors - a.seniors ||
        startHereTier(a) - startHereTier(b) ||
        a.unknownClass - b.unknownClass ||
        a.school.localeCompare(b.school) ||
        a.gender.localeCompare(b.gender)
    )
    .slice(0, START_HERE_COUNT);

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
    notRetrieved: parsed.notRetrieved,
    legacyMatches,
    springYearRosters: parsed.programs.filter((p) => p.seasonFromSpringYear).map((p) => p.slug),
    perConference,
    finalYearOnCurrentRosters,
    startHere,
    missing: absent,
    earlierSeasonRosters: parsed.programs
      .filter((p) => p.seasonStartYear < current)
      .map((p) => ({ slug: p.slug, school: p.school, gender: p.gender, seasonShown: p.seasonShown })),
    unknownLabels: parsed.unknownLabels,
    errors: parsed.errors,
    ranges: { withRange, withoutRange: programs.length - withRange },
    coverage: coverageTable(programs.filter((p) => !duplicated.has(p.slug)), now),
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

  out.push("\n### Per conference: imported, missing, stale\n");
  out.push(
    table(
      ["Conference", "Division", "Teams imported", "Roster not retrieved", "Not in the file", "Stale rosters", "Players listed"],
      [
        ...s.perConference.map((c) => [
          c.conference,
          c.division,
          c.imported,
          c.notRetrieved,
          c.absent === null ? "unknown" : c.absent,
          c.stale,
          c.players,
        ]),
        [
          "**Total**",
          "",
          s.perConference.reduce((n, c) => n + c.imported, 0),
          s.perConference.reduce((n, c) => n + c.notRetrieved, 0),
          s.missing === null ? "unknown" : s.missing.length,
          s.perConference.reduce((n, c) => n + c.stale, 0),
          s.perConference.reduce((n, c) => n + c.players, 0),
        ],
      ]
    )
  );
  out.push(
    "\n\"Teams missing\" = \"Roster not retrieved\" (the file names the team but has no roster for it) " +
      "plus \"Not in the file\" (on the expected list, absent from the file)."
  );

  out.push("\n### Teams missing\n");
  const missingRows: (string | number)[][] = [
    ...s.notRetrieved.map((m) => [m.conference, m.school, m.gender, "Roster not retrieved when the file was compiled"]),
    ...(s.missing ?? []).map((m) => [m.conference, m.school, m.gender, "Not in the file"]),
  ];
  out.push(missingRows.length === 0 ? "None found." : table(["Conference", "School", "Gender", "Why"], missingRows));
  if (s.missing === null) {
    out.push(
      "\nNo expected-programs list was supplied (`--expected`), so teams absent from the file entirely " +
        "cannot be named; only the ones the file itself marks as not retrieved are listed."
    );
  }

  out.push("\n### Already in the main catalog\n");
  out.push(
    s.legacyMatches.length === 0
      ? "None of the imported teams is already in the 68-program catalog."
      : `${s.legacyMatches.length} imported teams are the same team as an entry in the existing catalog. ` +
          "They are stored, but /schools does not list them a second time:\n\n" +
          table(["Imported", "Existing catalog entry"], s.legacyMatches.map((m) => [`\`${m.slug}\``, `\`${m.legacySlug}\``]))
  );

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

  if (s.springYearRosters.length) {
    out.push(
      `\n${s.springYearRosters.length} roster(s) printed a single year (e.g. "2026") rather than a season. ` +
        "College tennis plays its championship season in the spring, so these are read as the season that " +
        `spring ends (2026 -> 2025-26): ${s.springYearRosters.map((x) => `\`${x}\``).join(", ")}.`
    );
  }

  out.push("\n### Seniors leaving (current-season rosters only)\n");
  out.push(
    table(
      ["Gender", "Programs counted", "Seniors leaving", "Current-season rosters with no readable class years"],
      s.finalYearOnCurrentRosters.map((r) => [r.gender === "men" ? "Men" : "Women", r.programs, r.seniors, r.untracked])
    )
  );
  out.push(
    "\n\"Seniors\" = every player in their final season on that roster (seniors, graduate students, 5th-years). " +
      "Earlier-season rosters are left out: their seniors have already finished."
  );

  out.push(`\n### Where to enter team ranges first (${s.startHere.length})\n`);
  out.push(
    s.startHere.length === 0
      ? "None."
      : table(
          ["#", "Program", "Division", "Conference", "Seniors leaving", "Players listed"],
          s.startHere.map((r, i) => [
            i + 1,
            `${r.school} (${r.gender === "men" ? "Men" : "Women"})`,
            r.division,
            r.conference,
            r.seniors,
            r.unknownClass ? `${r.playersListed} (${r.unknownClass} class unreadable)` : r.playersListed,
          ])
        )
  );
  out.push(
    "\nOrder: most seniors leaving first; D3 and the non-Ivy D1 conferences only; ties go to D3. Current-season " +
      "rosters only, and not the teams already in the main catalog. This is where a range helps a UTR 5–8 junior " +
      "soonest; it says nothing about any team's level."
  );

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
      `${s.ranges.withoutRange} show "Level not rated yet" and are left out of every fit.`
  );

  out.push("\n### Coverage for sample players (today's rating, no projection)\n");
  out.push(
    table(
      ["Player", "Imported programs rated", "Imported not rated", "Good match (imported)", "Safe bet (imported)", "Good match (legacy catalog, unverified)", "Safe bet (legacy catalog, unverified)"],
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
