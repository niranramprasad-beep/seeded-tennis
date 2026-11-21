// S-10. What a write route may show the browser when a lib/db write fails.
//
// lib/db/{plan,events,outreach,family}.ts used to rethrow a PostgREST error
// as `new Error(error.message)`, and five API routes sent `err.message` to
// the browser. That message is Postgres's own text — `new row violates
// row-level security policy for table "matches"`, `violates check
// constraint "budget_expenses_amount_check"` — table, column and constraint
// names the client has no use for. The same catch also carried our own
// validation sentences ("Budget total can't be negative."), which the UI
// shows on purpose.
//
// The rule is FAIL-CLOSED: `clientWriteErrorMessage()` shows text only when
// it is known to be written for a person —
//   - a `UserFacingError` (our own validation sentences, thrown by the
//     lib/db write functions before any database call), or
//   - a `DatabaseWriteError` whose SQLSTATE is one of the two our
//     migrations raise for people, mapped BY CODE to a fixed sentence here
//     (the database's text is never forwarded).
// Everything else — a DatabaseWriteError with any other code, a raw
// PostgrestError (which extends Error), a TypeError, a string — gets the
// route's generic fallback. An earlier version passed any plain Error's
// message through, so a stray `throw error;` of a PostgrestError leaked
// Postgres's text (independent verifier, PR #28).
//
// lib/api-logging.test.ts fails the build if a route sends a caught value's
// message or a lib/db writer goes back to rethrowing raw errors.

/** A sentence written for the person using the app. Only throw this with
 * text we wrote — never with an upstream error's message. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export class DatabaseWriteError extends Error {
  /** Postgres SQLSTATE / PostgREST code, when there is one. */
  readonly code: string | null;

  constructor(error: { message?: string | null; code?: string | null }) {
    super(error.message || "Database write failed.");
    this.name = "DatabaseWriteError";
    this.code = typeof error.code === "string" && error.code ? error.code : null;
  }
}

/** SQLSTATEs our migrations raise with a sentence for people, mapped to that
 * sentence here so the database's text is never what gets shown.
 * 53400: 034's rate-limit trigger (reachable when two writes race past the
 * route's peek). 28000: "Sign in first." (028). */
const SENTENCE_BY_CODE: Record<string, string> = {
  "53400": "Too many changes at once. Try again later.",
  "28000": "Sign in first.",
};

/**
 * What a write route may send to the browser for an error caught around a
 * lib/db write. Fail-closed: see the header.
 */
export function clientWriteErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof UserFacingError && err.message) return err.message;
  if (err instanceof DatabaseWriteError && err.code && Object.prototype.hasOwnProperty.call(SENTENCE_BY_CODE, err.code)) {
    // The code AND the exact sentence: 53400 is also raised for "No
    // rate-limit bucket defined for table …", a configuration fault that
    // must not read as "you went too fast".
    const sentence = SENTENCE_BY_CODE[err.code];
    if (err.message === sentence) return sentence;
  }
  return fallback;
}
