// Which imported programs are the SAME team as one already in the legacy
// 68-program catalog (lib/db/schools*), so /schools never lists Middlebury
// women or Johns Hopkins men twice. Pure.
//
// The roster file uses the short names conferences print ("Penn",
// "Chicago", "Johns Hopkins"); the legacy catalog uses full names
// ("University of Pennsylvania", "University of Chicago"). A match needs
// all three of: the same gender, the same conference, and the same school
// name once filler words are dropped (or an alias below). The conference
// requirement is what keeps "Washington College" (Centennial),
// "Washington and Lee" (ODAC) and "Washington St. Louis" (UAA) apart.
//
// A match never moves data between the two: the imported program keeps its
// own class counts and the legacy entry its own (unverified) range. It only
// decides that the imported row is not shown a second time.

import { slugify, type CatalogGender } from "./roster-import";

/** Short name in the roster file -> the distinctive part of the full name.
 * Only names the filler-word rule cannot reach. */
const SCHOOL_NAME_ALIASES: Readonly<Record<string, string>> = {
  penn: "pennsylvania",
  nyu: "new-york",
  wustl: "washington-st-louis",
  usc: "southern-california",
  ucla: "california-los-angeles",
  unc: "north-carolina-chapel-hill",
  tcu: "texas-christian",
  // Conference sites' own abbreviations (expected-programs list).
  conn: "connecticut",
  uncw: "unc-wilmington",
  // The UTR database (ACC) says "University of North Carolina"; the legacy
  // catalog says "... at Chapel Hill". The conference requirement keeps
  // UNC Wilmington (CAA) and other UNC campuses apart.
  "north-carolina": "north-carolina-chapel-hill",
};

const FILLER = new Set(["university", "college", "the", "of", "at", "in"]);

/** "University of Chicago" -> "chicago"; "Penn" -> "pennsylvania". */
export function schoolNameKey(name: string): string {
  const slug = slugify(name);
  if (SCHOOL_NAME_ALIASES[slug]) return SCHOOL_NAME_ALIASES[slug];
  const stripped = slug
    .split("-")
    .filter((w) => w && !FILLER.has(w))
    .join("-");
  return SCHOOL_NAME_ALIASES[stripped] ?? stripped;
}

export interface LegacyLike {
  slug: string;
  name: string;
  gender: CatalogGender;
  conference: string;
}

export interface ImportedLike {
  school: string;
  gender: CatalogGender;
  conference: string;
}

/** The legacy entry this imported program duplicates, or null. Refuses to
 * pick when two legacy entries would match (none should). */
export function legacyMatchFor<L extends LegacyLike>(program: ImportedLike, legacy: readonly L[]): L | null {
  const key = schoolNameKey(program.school);
  const hits = legacy.filter(
    (s) => s.gender === program.gender && s.conference === program.conference && schoolNameKey(s.name) === key
  );
  return hits.length === 1 ? hits[0] : null;
}

/** Imported programs NOT already in the legacy catalog, in input order. */
export function withoutLegacyDuplicates<P extends ImportedLike>(programs: readonly P[], legacy: readonly LegacyLike[]): P[] {
  return programs.filter((p) => legacyMatchFor(p, legacy) === null);
}
