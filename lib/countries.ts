// The countries every profile form offers (/signup, /parent-signup,
// /auth/complete, Settings → Profile). One list, so the forms cannot
// disagree — /auth/complete used to offer four of these and /signup sixteen.
// Stored as the display name in `profiles.country` (free text column).
export const COUNTRY_OPTIONS = [
  "United States",
  "Canada",
  "United Kingdom",
  "Spain",
  "Germany",
  "France",
  "Italy",
  "Australia",
  "Mexico",
  "Brazil",
  "Argentina",
  "India",
  "China",
  "Japan",
  "South Korea",
  "Other",
] as const;

/** The options for a country <select> that already holds `current`: a
 * stored value outside the list is kept as the first option, so the
 * <select> never silently shows (and then saves) a different country. */
export function countryOptionsIncluding(current: string | null | undefined): string[] {
  const list: string[] = [...COUNTRY_OPTIONS];
  const value = (current ?? "").trim();
  if (value && !list.includes(value)) list.unshift(value);
  return list;
}
