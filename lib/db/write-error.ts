// S-10. A failed database write, kept distinguishable from our own
// validation sentences.
//
// lib/db/{plan,events,outreach,family}.ts used to rethrow a PostgREST error
// as `new Error(error.message)`, and five API routes sent `err.message` to
// the browser. That message is Postgres's own text — `new row violates
// row-level security policy for table "matches"`, `violates check
// constraint "budget_expenses_amount_check"` — table, column and constraint
// names the client has no use for. The same catch also carried our own
// validation sentences ("Budget total can't be negative."), which the UI
// shows on purpose, so the route could not just stop sending messages.
//
// DatabaseWriteError keeps `.message` exactly as before (so nothing that
// reads it on the server changes) and adds the SQLSTATE. The routes ask
// `clientWriteErrorMessage()` what to show: a database error becomes the
// route's generic sentence, except the two sentences our own migrations
// raise for people (028/034's rate limit, "Sign in first."); a plain Error
// — our validation — is shown as it always was.
//
// lib/api-logging.test.ts fails the build if one of those four files goes
// back to `throw new Error(x.message)` or a route goes back to sending
// `err.message`.

export class DatabaseWriteError extends Error {
  /** Postgres SQLSTATE / PostgREST code, when there is one. */
  readonly code: string | null;

  constructor(error: { message?: string | null; code?: string | null }) {
    super(error.message || "Database write failed.");
    this.name = "DatabaseWriteError";
    this.code = typeof error.code === "string" && error.code ? error.code : null;
  }
}

/** SQLSTATEs whose message, when it is not Postgres's own wording, is a
 * sentence one of our migrations raises for a person to read:
 * 53400 = "Too many changes at once. Try again later." (034's rate-limit
 * trigger, reachable when two writes race past the route's peek);
 * 28000 = "Sign in first." (028). */
const OUR_SENTENCE_CODES = new Set(["53400", "28000"]);

/** Postgres's own wording, which is never shown even under one of the codes
 * above. */
const POSTGRES_WORDING =
  /violates|row-level security|null value in column|invalid input|out of range|syntax|constraint|relation|column|permission denied|bucket|duplicate key|does not exist/i;

/**
 * What a write route may send to the browser for an error caught around a
 * lib/db write: our own validation sentence (a plain Error) as-is; a
 * database error as `fallback`, unless it is one of our migrations'
 * sentences; anything else as `fallback`.
 */
export function clientWriteErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof DatabaseWriteError) {
    if (err.code && OUR_SENTENCE_CODES.has(err.code) && err.message && !POSTGRES_WORDING.test(err.message)) {
      return err.message;
    }
    return fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
