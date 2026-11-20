// Roster class labels -> graduating class year. Pure; no I/O.
//
// Catalog phase 1 (migration 048). Official roster pages print a player's
// year in a dozen house styles: "Fr.", "FY", "First-Year", "1st", "R-Fr",
// "Gr.", "5th", "'30", "2030"... The product needs one number per player:
// the graduation class year, so "final-year players" can be counted the same
// way for every school.
//
// THE RULE: the class year is relative to the SEASON THE ROSTER SHOWS, not
// to today. On a 2026-27 roster a senior is class 2027; on a 2025-26 roster
// a senior is class 2026 (and has already finished by the time a 2026-27
// season is under way — lib/catalog/programs.ts says so on screen).
//
//   first-year   -> season start + 4
//   sophomore    -> season start + 3
//   junior       -> season start + 2
//   senior       -> season start + 1
//   graduate / 5th-year / 6th-year -> season start + 1 (final season)
//   explicit "'30" / "2030" / "Class of 2030" -> that year, if it is a
//     plausible class for this roster (start + 1 ... start + 4)
//
// Redshirt prefixes ("R-Fr", "RS So", "Redshirt Junior") map by the
// ELIGIBILITY year printed: a redshirt freshman has four seasons left, the
// same as a freshman, so R-Fr = Fr. This is a counting rule, documented
// here, not a guess about any individual.
//
// ANYTHING ELSE IS UNKNOWN. "Fr/So", "—", "1", "Senior?", a blank cell, a
// year outside the plausible window: returned as null and counted as
// "unknown" by the importer. Never rounded to the nearest guess.

/** Upper bound on a sane season start year; anything outside is a typo. */
const MIN_SEASON = 2000;
const MAX_SEASON = 2100;

type YearOfStudy = 1 | 2 | 3 | 4 | "final";

const YEAR_TOKENS: Record<string, YearOfStudy> = {
  // first year
  fr: 1,
  fy: 1,
  frosh: 1,
  freshman: 1,
  freshmen: 1,
  "first-year": 1,
  "first year": 1,
  firstyear: 1,
  "1st": 1,
  "1st year": 1,
  "1st-year": 1,
  // second year
  so: 2,
  soph: 2,
  sophomore: 2,
  "second-year": 2,
  "second year": 2,
  "2nd": 2,
  "2nd year": 2,
  "2nd-year": 2,
  // third year
  jr: 3,
  junior: 3,
  "third-year": 3,
  "third year": 3,
  "3rd": 3,
  "3rd year": 3,
  "3rd-year": 3,
  // fourth year
  sr: 4,
  senior: 4,
  "fourth-year": 4,
  "fourth year": 4,
  "4th": 4,
  "4th year": 4,
  "4th-year": 4,
  // final season beyond the fourth: graduate students and extra-year seniors
  gr: "final",
  gs: "final",
  grad: "final",
  graduate: "final",
  "graduate student": "final",
  "grad student": "final",
  "5th": "final",
  "5th year": "final",
  "5th-year": "final",
  "fifth-year": "final",
  "fifth year": "final",
  "5th-year senior": "final",
  "6th": "final",
  "6th year": "final",
  "6th-year": "final",
  "sixth-year": "final",
  "sixth year": "final",
};

/** "R-Fr", "RS-So", "RS Jr", "Redshirt Senior", "R Fr". */
const REDSHIRT_PREFIX = /^(?:redshirt|r-?s|r)[\s-]+|^rs?(?=(?:fr|so|jr|sr)$)/;
/** "Fr (RS)", "So RS" — the same marker written after the year. */
const REDSHIRT_SUFFIX = /\s*\(r-?s\)$|\s+r-?s$/;

function cleanLabel(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐-―]/g, "-") // en/em dashes and friends
    .replace(/[‘’ʼ`]/g, "'") // curly apostrophes
    .replace(/\./g, "") // "Fr." -> "fr"
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The graduating class year for a roster label, or null when the label is
 * not one this function can read with certainty.
 *
 * @param label             the Class cell exactly as the roster printed it
 * @param seasonStartYear   2026 for a "2026-27" roster
 */
export function graduationClassYear(label: string | null | undefined, seasonStartYear: number): number | null {
  if (!Number.isInteger(seasonStartYear) || seasonStartYear < MIN_SEASON || seasonStartYear > MAX_SEASON) {
    return null;
  }
  if (typeof label !== "string") return null;
  let text = cleanLabel(label);
  if (!text) return null;

  // Explicit year forms first: "'30", "2030", "class of 2030", "c/o 2030".
  const explicit = text.match(/^(?:class of |c\/o )?(?:'(\d{2})|(\d{4}))$/);
  if (explicit) {
    const year = explicit[1] ? 2000 + Number(explicit[1]) : Number(explicit[2]);
    return plausibleClassYear(year, seasonStartYear) ? year : null;
  }

  // Redshirt: strip the prefix, map by the eligibility year that follows.
  // A trailing "(rs)" / " rs" is the same marker written after.
  const token = text.replace(REDSHIRT_SUFFIX, "").replace(REDSHIRT_PREFIX, "").trim();
  const redshirt = token !== text;

  const year = YEAR_TOKENS[token];
  if (year === undefined) return null;
  // "Redshirt graduate" is not a thing a roster means anything precise by.
  if (redshirt && year === "final") return null;

  if (year === "final") return seasonStartYear + 1;
  return seasonStartYear + (5 - year);
}

/** A class year a player on this season's roster can actually hold. */
export function plausibleClassYear(classYear: number, seasonStartYear: number): boolean {
  return (
    Number.isInteger(classYear) &&
    classYear >= seasonStartYear + 1 &&
    classYear <= seasonStartYear + 4
  );
}

/** The class whose players are in their final season on this roster. */
export function finalYearClass(seasonStartYear: number): number {
  return seasonStartYear + 1;
}

export interface Season {
  /** 2026 for "2026-27". */
  startYear: number;
  /** Canonical "2026-27". */
  label: string;
}

/**
 * "2026-27", "2026–27", "2026-2027", "2026/27" -> { startYear: 2026,
 * label: "2026-27" }. A bare "2026" is ambiguous (spring 2026 is the
 * 2025-26 season) and returns null, as does any pair that is not
 * consecutive years.
 */
export function parseSeason(raw: string | null | undefined): Season | null {
  if (typeof raw !== "string") return null;
  const text = raw.normalize("NFKC").replace(/[‐-―]/g, "-").trim();
  const m = text.match(/^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  const start = Number(m[1]);
  if (start < MIN_SEASON || start > MAX_SEASON) return null;
  const endRaw = m[2];
  const end = endRaw.length === 2 ? Math.floor(start / 100) * 100 + Number(endRaw) : Number(endRaw);
  // "2099-00" wraps a century; accept it the one way it can be right.
  const endFixed = endRaw.length === 2 && end <= start ? end + 100 : end;
  if (endFixed !== start + 1) return null;
  return { startYear: start, label: `${start}-${String((start + 1) % 100).padStart(2, "0")}` };
}

/**
 * The college season under way on a given day. A season runs August
 * through July: on 2026-11-19 it is the 2026-27 season. Reads LOCAL date
 * parts of `now`, so callers pass a date built from local parts (or a
 * yyyy-mm-dd string via seasonStartYearForIsoDate) and the answer does not
 * move with the machine's time zone.
 */
export function currentSeasonStartYear(now: Date): number {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

/** Same rule for a calendar date written "yyyy-mm-dd" — no Date parsing,
 * so no time-zone shift. Returns null for anything else. */
export function seasonStartYearForIsoDate(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return month >= 8 ? year : year - 1;
}
