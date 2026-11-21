// Settings → Profile field rules, in one place so the form, the /api/profile
// body schema and the tests agree.
//
// QA sweep 2026-11-20 (H2/H3): an EMPTY name saved as "Saved" and the next
// load showed the login email as the name (lib/auth.ts falls back to it), so
// the coach email read "I'm someone@example.com". A GPA of 5.7 got a raw 500
// from the profiles_gpa_check constraint and the field silently reverted.

export const PROFILE_NAME_REQUIRED = "Enter your name.";

/** profiles_gpa_check (migration 014): `gpa is null or (gpa >= 0 and gpa <= 5)`.
 * 5, not 4: weighted GPAs exist. lib/profile-fields.test.ts pins these to
 * the SQL. */
export const GPA_MIN = 0;
export const GPA_MAX = 5;
export const GPA_RANGE_ERROR = `Enter a GPA between ${GPA_MIN.toFixed(1)} and ${GPA_MAX.toFixed(1)}, or leave it blank.`;

/** Null when the name is usable, else the sentence to show. */
export function profileNameError(name: string): string | null {
  return name.trim().length === 0 ? PROFILE_NAME_REQUIRED : null;
}

/** Typed GPA text → the value. Blank is not an error: it is "Not set". */
export function parseGpaText(text: string): { value: number | null; error: string | null } {
  const t = text.trim();
  if (!t) return { value: null, error: null };
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return { value: null, error: GPA_RANGE_ERROR };
  const v = Number(t);
  if (!Number.isFinite(v) || v < GPA_MIN || v > GPA_MAX) return { value: null, error: GPA_RANGE_ERROR };
  return { value: v, error: null };
}

export const PROFILE_VALUE_REJECTED =
  "One of these profile values isn't allowed. Check the fields and try again.";
export const PROFILE_SAVE_FAILED = "Could not save your profile. Try again.";

/** A profile write error as the route should answer it. A CHECK / NOT NULL
 * violation (23514 / 23502) or a bad value (class 22, e.g. 22P02 / 22003) is
 * the caller's input: 400 with a plain sentence, never raw Postgres text.
 * Anything else keeps the route's old 500 and its message — the 42501
 * trigger refusals (022/032/041) raise sentences written for people. */
export function profileWriteFailure(err: unknown): { status: number; error: string } {
  const code =
    err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
      ? (err as { code: string }).code
      : null;
  if (code && (code === "23514" || code === "23502" || code.startsWith("22"))) {
    return { status: 400, error: PROFILE_VALUE_REJECTED };
  }
  return { status: 500, error: err instanceof Error && err.message ? err.message : PROFILE_SAVE_FAILED };
}
