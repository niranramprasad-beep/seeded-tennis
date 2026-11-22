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
//     (the database's text is never forwarded), or
//   - a `DatabaseWriteError` with SQLSTATE 42501 (insufficient_privilege:
//     an RLS refusal, or one of our triggers refusing a write), which gets
//     PERMISSION_DENIED_MESSAGE and HTTP 403 (final-check A5, 2026-11-21).
//     It read "Try again" with a 500 — advice that can never work. The
//     database's text is still never forwarded: the sentence is fixed.
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

/** SQLSTATE 42501, insufficient_privilege — what Postgres raises for a row
 * RLS refuses and what our own refusing triggers raise. */
const PERMISSION_DENIED_CODE = "42501";

/** The one sentence a permission refusal shows, whatever the database said. */
export const PERMISSION_DENIED_MESSAGE = "You don't have permission to do that.";

/** An under-13 account waiting for a parent's consent (030/051): every
 *  write but join_family is refused 42501 — say why, not "no permission". */
export const CONSENT_PENDING_MESSAGE = "Your account can't save changes until a parent in your family gives consent.";

/** coach_outreach's INSERT policy requires has_tier('player') (024). */
export const OUTREACH_NEEDS_PLAYER_PLAN_MESSAGE = "Tracking coach outreach is part of the Player plan.";

/**
 * 42501 is also what Postgres raises for a missing GRANT — "permission
 * denied for function / table / schema …". That is OUR configuration fault,
 * not the person's, so it gets the route's fallback and a 500. Read on the
 * server only; the text is never sent anywhere.
 */
const CONFIG_FAULT_RE = /^permission denied for (function|table|schema|sequence|view|relation|database|column|type|language)\b/i;

function isConfigFault(err: unknown): boolean {
  return err instanceof DatabaseWriteError && err.code === PERMISSION_DENIED_CODE && CONFIG_FAULT_RE.test(err.message.trim());
}

/** A 42501 that is a refusal of THIS person's write (RLS or one of our
 *  triggers) — not a configuration fault. Exported for the routes'
 *  refusal lookup (lib/db/write-refusal.ts), which only asks the database
 *  why when this is true. */
export function isPermissionRefusal(err: unknown): boolean {
  return err instanceof DatabaseWriteError && err.code === PERMISSION_DENIED_CODE && !isConfigFault(err);
}

/** Why the caller was refused, looked up from their OWN profile after a
 *  permission refusal (lib/db/write-refusal.ts). Never from the error text. */
export interface WriteRefusalContext {
  consentPending?: boolean;
  /** The route's write needs the Player plan and the caller is on Free. */
  needsPlayerPlan?: boolean;
}

/**
 * What a write route may send to the browser for an error caught around a
 * lib/db write. Fail-closed: see the header.
 */
export function clientWriteErrorMessage(err: unknown, fallback: string, refusal?: WriteRefusalContext | null): string {
  if (err instanceof UserFacingError && err.message) return err.message;
  if (isPermissionRefusal(err)) {
    if (refusal?.consentPending) return CONSENT_PENDING_MESSAGE;
    if (refusal?.needsPlayerPlan) return OUTREACH_NEEDS_PLAYER_PLAN_MESSAGE;
    return PERMISSION_DENIED_MESSAGE;
  }
  if (err instanceof DatabaseWriteError && err.code && Object.prototype.hasOwnProperty.call(SENTENCE_BY_CODE, err.code)) {
    // The code AND the exact sentence: 53400 is also raised for "No
    // rate-limit bucket defined for table …", a configuration fault that
    // must not read as "you went too fast".
    const sentence = SENTENCE_BY_CODE[err.code];
    if (err.message === sentence) return sentence;
  }
  return fallback;
}

/**
 * The HTTP status that goes with clientWriteErrorMessage()'s sentence:
 * 403 for a permission refusal (42501 that is not a GRANT/config fault),
 * 400 for our own validation sentence (the request, not the server, was
 * wrong), 500 for everything else. It reads the error's class and code, and
 * for 42501 only whether the server-side text is a config fault.
 */
export function clientWriteErrorStatus(err: unknown): 400 | 403 | 500 {
  if (isPermissionRefusal(err)) return 403;
  if (err instanceof UserFacingError && err.message) return 400;
  return 500;
}
