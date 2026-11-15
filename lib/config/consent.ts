// P0-8. The under-13 rule, in one place, mirroring
// supabase/migrations/030_under13_parent_consent.sql.
//
// The DATABASE is the enforcement point: an account whose
// profiles.consent_status is 'pending' can read and write nothing but its own
// profile row, via restrictive RLS policies on every table. This module is
// not that gate — it exists so the signup form can tell someone what is
// about to happen BEFORE it happens, instead of creating an account and then
// showing them a locked door.
//
// lib/config/consent.test.ts asserts this matches the SQL, because two copies
// of an age rule that disagree is the kind of bug that locks a 14-year-old
// out or lets a 12-year-old straight in.

/** Birth years within this many years of today are treated as under 13.
 *
 * Reads oddly — 13, for "under 13" — and is deliberate. Only the YEAR is
 * stored (030 explains why: a full date of birth is a precise permanent
 * identifier for a child, and the whole of P0-8 is about holding less of
 * that). Year alone cannot settle someone who turns 13 this calendar year,
 * so the comparison is `<=` and the uncertainty rounds toward asking for
 * consent. Someone born in 2013 is 12 or 13 during 2026; they are treated as
 * 12. Some 13-year-olds are therefore asked for a parent's consent they do
 * not legally need, which is the error worth making. */
export const CONSENT_REQUIRED_WITHIN_YEARS = 13;

/** The lowest birth year a person could plausibly enter, to keep a typo
 * ("19" or "216") from quietly reading as a child. */
export const EARLIEST_BIRTH_YEAR = 1900;

export function parentConsentRequired(
  birthYear: number | null | undefined,
  now: Date = new Date()
): boolean {
  // Unknown birth year means no requirement — the same answer the SQL
  // gives. Every account created before migration 030 has no birth year
  // recorded, and locking out the whole existing user base over a field they
  // were never asked for would be a worse failure than the one P0-8 fixes.
  // Signup collects it from here on.
  if (birthYear == null || !Number.isFinite(birthYear)) return false;
  return now.getFullYear() - birthYear <= CONSENT_REQUIRED_WITHIN_YEARS;
}

/** Whether a typed birth year is usable at all. Separate from the age rule:
 * "you haven't told us yet" and "you are under 13" are different states and
 * must not share a code path. */
export function isPlausibleBirthYear(
  birthYear: number | null | undefined,
  now: Date = new Date()
): boolean {
  if (birthYear == null || !Number.isInteger(birthYear)) return false;
  return birthYear >= EARLIEST_BIRTH_YEAR && birthYear <= now.getFullYear();
}

/** The oldest and newest years a signup form should offer. Caps the top at
 * this year so nobody can claim to be born in the future, and the bottom at
 * a range that covers a parent signing up for themselves. */
export function birthYearOptions(now: Date = new Date()): number[] {
  const current = now.getFullYear();
  const years: number[] = [];
  for (let y = current; y >= current - 90; y--) years.push(y);
  return years;
}
