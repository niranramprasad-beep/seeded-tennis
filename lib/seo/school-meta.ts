// A school page's <title> and meta description, kept inside what search
// results show (bug hunt 2026-11-26, BUG-011): a title is cut at about 60
// characters and a description at about 155. This only ever drops words the
// page already had — it writes nothing new. UTR numbers stay out of the
// description deliberately: they are unsourced estimates (P0-3), and a search
// snippet is the last place to present one as fact.

export const META_TITLE_MAX = 60;
export const META_DESCRIPTION_MAX = 155;

/** The sentence that follows the place line. */
export const SCHOOL_PAGE_PITCH =
  "See how your UTR compares to the team's range and whether the program is a Likely, Target or Reach fit.";
/** Its first clause, word for word, for the schools whose place line leaves no room for the rest. */
export const SCHOOL_PAGE_PITCH_SHORT = "See how your UTR compares to the team's range.";

const BRAND_SUFFIX = " — Seeded";

/** "<school> <men's|women's> tennis — Seeded"; without the brand when that
 *  would be cut by search results anyway. `programType` is "Women's" or "Men's". */
export function schoolPageTitle(schoolName: string, programType: string): string {
  const named = `${schoolName} ${programType.toLowerCase()} tennis`;
  const full = `${named}${BRAND_SUFFIX}`;
  return full.length <= META_TITLE_MAX ? full : named;
}

/** "<school> <men's|women's> tennis: <division>, <conference>, <city>, <state>." plus the
 *  closing sentence — whole if it fits, its first clause if that fits, otherwise
 *  the place line alone. `place` is the parts that exist, in that order. */
export function schoolPageDescription({
  name,
  programType,
  place,
}: {
  name: string;
  programType: string;
  place: string[];
}): string {
  const first = `${name} ${programType.toLowerCase()} tennis: ${place.join(", ")}.`;
  for (const pitch of [SCHOOL_PAGE_PITCH, SCHOOL_PAGE_PITCH_SHORT]) {
    const description = `${first} ${pitch}`;
    if (description.length <= META_DESCRIPTION_MAX) return description;
  }
  return first;
}
