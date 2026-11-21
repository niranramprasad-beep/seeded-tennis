// P1-OPS-2. One way for server code to say "this went wrong" (or "this is
// worth knowing") in Vercel's runtime logs, in a shape a person can search.
//
// WHAT THIS IS: one JSON line per call, on stdout/stderr, which Vercel keeps
// as runtime logs (searchable in the dashboard; retention depends on the
// plan). Nothing is sent anywhere else. There is no Sentry, no log drain and
// no alerting behind this — see docs/TECHNICAL_ARCHITECTURE.md "Monitoring".
//
// WHAT IT NEVER WRITES: request bodies, user ids, emails, tokens, keys, or a
// stack trace. A Postgres error's DETAIL (which carries the offending row's
// values — `Key (email)=(someone@example.com) already exists`) is dropped.
// The message is cut to its first line and run through `sanitizeLogText`,
// and every string in `context` is run through it as well. Context keys that
// name a secret or a person (`email`, `token`, `userId`, ...) are redacted
// whatever their value, so a careless call site cannot log one by name.
//
// lib/server-log.test.ts pins every rule below and was mutation-tested;
// lib/api-logging.test.ts fails the build if an app/api route writes to the
// console directly instead of through here.

export type LogValue = string | number | boolean | null | undefined;
export type LogContext = Record<string, LogValue>;

export interface ServerErrorRecord {
  level: "error";
  event: string;
  route?: string;
  /** Sanitised first line of the error's message ("" when there is none). */
  message: string;
  /** Postgres SQLSTATE (or another short machine code), when the error has one. */
  code: string | null;
  context?: Record<string, string | number | boolean | null>;
  ts: string;
}

export interface ServerEventRecord {
  level: "info" | "warn";
  event: string;
  route?: string;
  context?: Record<string, string | number | boolean | null>;
  ts: string;
}

const MAX_MESSAGE_LENGTH = 300;
const MAX_CONTEXT_STRING_LENGTH = 200;

/** Keys whose VALUE is never written, whatever it looks like. Booleans are
 * exempt (`hasEmail: true` says nothing about anyone). */
const SENSITIVE_KEY = /(e-?mail|token|secret|passw(or)?d|authori[sz]ation|cookie|session|user_?id|jwt|api_?key|bearer|body|payload|phone|address)/i;

/**
 * Strips anything that identifies a person or authenticates a caller from a
 * piece of log text. Exported for the tests; call sites use the loggers.
 *
 * Order matters: Postgres row values first (they can contain anything), then
 * JWTs before the generic long-token rule (a JWT has dots, which the generic
 * rule would split), then everything else.
 */
export function sanitizeLogText(input: string): string {
  let text = input;

  // A multi-line error is a message plus DETAIL/HINT/CONTEXT or a stack
  // trace. Only the first line is the message.
  text = text.split(/\r?\n/, 1)[0] ?? "";

  // Some drivers inline the extra fields on one line. Everything from them on
  // is row data or query text.
  text = text.replace(/\s*\b(DETAIL|HINT|CONTEXT|QUERY|STATEMENT|WHERE):[\s\S]*$/, "");
  text = text.replace(/\s*Failing row contains[\s\S]*$/i, "");
  text = text.replace(/\s*\bat\s+\S+\s+\(\S+:\d+:\d+\)[\s\S]*$/, "");
  // `Key (email)=(someone@example.com) already exists` — keep the column,
  // drop the value.
  text = text.replace(/(Key \([^)]*\)=)\((?:[^()]|\([^()]*\))*\)/g, "$1([redacted])");

  // JWTs (Supabase access tokens, service-role keys, Whop/standard webhooks).
  text = text.replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[jwt]");
  text = text.replace(/\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, "[jwt]");

  // Authorization header values.
  text = text.replace(/\b([Bb]earer|BEARER|Basic)\s+[^\s,;"'`]+/g, "$1 [redacted]");

  // Prefixed provider keys: Stripe (sk_/pk_/rk_ live|test), webhook secrets
  // (whsec_), Whop (apik_), Supabase (sb_secret_/sb_publishable_), GitHub,
  // Slack, and the dash style (sk-...).
  text = text.replace(
    /\b(?:sk|pk|rk|whsec|apik|sb_secret|sb_publishable|ghp|gho|ghs|ghu|github_pat|xox[abprs])_[A-Za-z0-9_-]{6,}/g,
    "[key]"
  );
  text = text.replace(/\bsk-[A-Za-z0-9_-]{12,}/g, "[key]");

  // Secrets carried in a URL or form string (the GA4 Measurement Protocol
  // URL carries api_secret=...).
  text = text.replace(
    /([?&;\s]|^)((?:api_secret|apikey|api_key|key|token|access_token|refresh_token|id_token|secret|password|signature|sig|code|auth)=)[^&\s"'`]+/gi,
    "$1$2[redacted]"
  );

  // Email addresses, plain and URL-encoded.
  text = text.replace(/[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, "[email]");

  // UUIDs: Supabase user ids, row ids.
  text = text.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[uuid]");

  // Anything else long and random-looking: 32+ token characters containing
  // both a letter and a digit. (A long constraint name such as
  // `tournaments_planned_season_check` has no digit and is kept — it is the
  // useful part of a Postgres error, and it is ours, not the user's.)
  text = text.replace(/[A-Za-z0-9_+/-]{32,}={0,2}/g, (m) => (/\d/.test(m) && /[A-Za-z]/.test(m) ? "[token]" : m));

  text = text.trim();
  if (text.length > MAX_MESSAGE_LENGTH) text = `${text.slice(0, MAX_MESSAGE_LENGTH)}…`;
  return text;
}

/** The error's message, whatever shape it arrived in. Never its stack, and
 * never a Postgres error's `details` / `hint` fields. */
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

/** A Postgres SQLSTATE (5 characters) or another short machine code such as
 * our own `not_found`, if the error carries one. Anything longer or oddly
 * shaped is not a code and is not written. */
export function errorCodeOf(err: unknown): string | null {
  if (!err || typeof err !== "object" || !("code" in err)) return null;
  const code = (err as { code: unknown }).code;
  if (typeof code !== "string") return null;
  return /^[A-Za-z0-9_]{1,40}$/.test(code) ? code : null;
}

function cleanContext(context: LogContext | undefined): {
  route?: string;
  rest?: Record<string, string | number | boolean | null>;
} {
  if (!context) return {};
  let route: string | undefined;
  const rest: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(context)) {
    if (raw === undefined) continue;
    if (key === "route" && typeof raw === "string") {
      route = sanitizeLogText(raw).slice(0, MAX_CONTEXT_STRING_LENGTH);
      continue;
    }
    if (SENSITIVE_KEY.test(key) && typeof raw !== "boolean" && raw !== null) {
      rest[key] = "[redacted]";
      continue;
    }
    if (typeof raw === "string") {
      rest[key] = sanitizeLogText(raw).slice(0, MAX_CONTEXT_STRING_LENGTH);
    } else if (typeof raw === "number") {
      rest[key] = Number.isFinite(raw) ? raw : null;
    } else {
      rest[key] = raw;
    }
  }
  return { route, rest: Object.keys(rest).length > 0 ? rest : undefined };
}

/** Builds the record without writing it. Exported for the tests. */
export function serverErrorRecord(
  event: string,
  err: unknown,
  context?: LogContext,
  now: Date = new Date()
): ServerErrorRecord {
  const { route, rest } = cleanContext(context);
  const record: ServerErrorRecord = {
    level: "error",
    event: sanitizeLogText(event),
    message: sanitizeLogText(messageOf(err)),
    code: errorCodeOf(err),
    ts: now.toISOString(),
  };
  if (route) record.route = route;
  if (rest) record.context = rest;
  return record;
}

/** Builds the record without writing it. Exported for the tests. */
export function serverEventRecord(
  event: string,
  context?: LogContext,
  level: "info" | "warn" = "info",
  now: Date = new Date()
): ServerEventRecord {
  const { route, rest } = cleanContext(context);
  const record: ServerEventRecord = { level, event: sanitizeLogText(event), ts: now.toISOString() };
  if (route) record.route = route;
  if (rest) record.context = rest;
  return record;
}

/**
 * Something failed on the server. Writes exactly one JSON line to
 * console.error. `event` is a stable dotted name (`whop.webhook.sync_failed`)
 * — search Vercel's runtime logs for it. Never throws.
 */
export function logServerError(event: string, err: unknown, context?: LogContext): void {
  try {
    console.error(JSON.stringify(serverErrorRecord(event, err, context)));
  } catch {
    // Logging must never be the thing that breaks a request.
  }
}

/**
 * Something notable that is not an exception (a webhook event we ignore, a
 * payment we could not match to an account). `info` → console.log, `warn` →
 * console.warn. One JSON line. Never throws.
 */
export function logServerEvent(event: string, context?: LogContext, level: "info" | "warn" = "info"): void {
  try {
    const line = JSON.stringify(serverEventRecord(event, context, level));
    if (level === "warn") console.warn(line);
    else console.log(line);
  } catch {
    // As above.
  }
}
