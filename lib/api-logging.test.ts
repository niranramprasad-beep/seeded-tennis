import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { codeOnly } from "./testing/source-text";
import { DatabaseWriteError, clientWriteErrorMessage } from "./db/write-error";

// P1-OPS-2 + S-10, the build-failing half.
//
//  1. Every app/api route logs through lib/server-log.ts. A bare
//     console.error/log/warn there writes whatever it is handed — an error
//     object with a Postgres DETAIL, a request body — and is the shape the
//     logger exists to replace.
//  2. No write route sends an error's own message to the browser. The S-10
//     routes ask clientWriteErrorMessage(); lib/db's write paths throw
//     DatabaseWriteError so that function can tell the database's text from
//     our own validation sentences.
//  3. /api/health stays cheap, anonymous and uncached.
//  4. The uptime workflow stays hourly, secret-free and bounded.

const ROOT = join(__dirname, "..");

function routeFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(rel);
    }
  };
  walk("app/api");
  return out;
}

/** The body of every `} catch (...) { ... }` block, by brace matching. */
function catchBodies(src: string): string[] {
  const bodies: string[] = [];
  const re = /\}\s*catch\s*(?:\([^)]*\))?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    bodies.push(src.slice(start, i - 1));
  }
  return bodies;
}

/** The five routes S-10 named (profile's own fix predates this one). */
const S10_ROUTES = [
  "app/api/utr-entries/route.ts",
  "app/api/matches/route.ts",
  "app/api/outreach/route.ts",
  "app/api/family/budget/route.ts",
  "app/api/family/budget/expenses/route.ts",
];

/** The lib/db files those routes write through. */
const S10_WRITERS = ["lib/db/plan.ts", "lib/db/events.ts", "lib/db/outreach.ts", "lib/db/family.ts", "lib/db/settings.ts"];

describe("app/api logs only through lib/server-log.ts", () => {
  const files = routeFiles();

  it("finds the routes (the walk itself works)", () => {
    expect(files.length).toBeGreaterThanOrEqual(14);
    expect(files).toContain("app/api/health/route.ts");
  });

  for (const file of files) {
    it(`${file} has no console.* call`, () => {
      const src = codeOnly(join(ROOT, file));
      expect(src, `${file} writes to the console directly`).not.toMatch(/\bconsole\s*\.\s*(error|warn|log|info|debug|trace)\s*\(/);
    });
  }

  it("every catch block in app/api that answers or rethrows also logs", () => {
    // A catch that turns an exception into a response (or rethrows it)
    // without a log line is a failure nobody will ever see.
    let checked = 0;
    for (const file of files) {
      for (const body of catchBodies(codeOnly(join(ROOT, file)))) {
        if (/NextResponse\.json\(|return respond\(|\bthrow\b/.test(body)) {
          checked++;
          expect(body, `${file}: a catch that answers without logging`).toMatch(/logServer(Error|Event)\(/);
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(12);
  });
});

describe("S-10: no route sends the database's text", () => {
  for (const route of S10_ROUTES) {
    it(`${route} sends clientWriteErrorMessage(), never err.message`, () => {
      const src = codeOnly(join(ROOT, route));
      expect(src).not.toMatch(/\berr(or)?\s*\.\s*message\b/);
      expect(src).toMatch(/clientWriteErrorMessage\(err, "[^"]+"\)/);
      expect(src).toMatch(/logServerError\("api\.[a-z_]+\.write_failed", err/);
    });
  }

  it("no app/api route returns an error's message in a JSON body", () => {
    for (const file of routeFiles()) {
      const src = codeOnly(join(ROOT, file));
      expect(src, file).not.toMatch(/error:\s*err(or)?\s*(instanceof Error\s*\?\s*err(or)?)?\s*\.message/);
    }
  });

  for (const writer of S10_WRITERS) {
    it(`${writer} throws DatabaseWriteError, not a bare Error carrying the database's message`, () => {
      const src = codeOnly(join(ROOT, writer));
      expect(src).not.toMatch(/throw new Error\(\s*\w+\.message\s*\)/);
      expect(src).toMatch(/throw new DatabaseWriteError\(/);
    });
  }
});

describe("clientWriteErrorMessage", () => {
  const FALLBACK = "Could not save that match. Try again.";

  it("hides Postgres's text behind the route's sentence", () => {
    for (const [message, code] of [
      ['new row violates row-level security policy for table "matches"', "42501"],
      ['new row for relation "budget_expenses" violates check constraint "budget_expenses_amount_check"', "23514"],
      ['duplicate key value violates unique constraint "coach_outreach_pkey"', "23505"],
      ['column "x" does not exist', "42703"],
      ["No rate-limit bucket defined for table matches", "53400"],
      ["", null],
    ] as const) {
      expect(clientWriteErrorMessage(new DatabaseWriteError({ message, code }), FALLBACK)).toBe(FALLBACK);
    }
  });

  it("keeps the sentences our own migrations raise for people", () => {
    expect(
      clientWriteErrorMessage(new DatabaseWriteError({ message: "Too many changes at once. Try again later.", code: "53400" }), FALLBACK)
    ).toBe("Too many changes at once. Try again later.");
    expect(clientWriteErrorMessage(new DatabaseWriteError({ message: "Sign in first.", code: "28000" }), FALLBACK)).toBe(
      "Sign in first."
    );
  });

  it("keeps our own validation sentences (plain Errors) exactly as before", () => {
    expect(clientWriteErrorMessage(new Error("Budget total can't be negative."), FALLBACK)).toBe("Budget total can't be negative.");
    expect(clientWriteErrorMessage("not an error", FALLBACK)).toBe(FALLBACK);
    expect(clientWriteErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });

  it("DatabaseWriteError keeps the message and code for the server", () => {
    const e = new DatabaseWriteError({ message: "raw", code: "42501" });
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("raw");
    expect(e.code).toBe("42501");
  });
});

describe("/api/health stays cheap, anonymous and uncached", () => {
  const route = codeOnly(join(ROOT, "app/api/health/route.ts"));
  const lib = codeOnly(join(ROOT, "lib/health.ts"));

  it("is dynamic and no-store", () => {
    expect(route).toMatch(/export const dynamic = "force-dynamic"/);
    expect(route).toMatch(/"Cache-Control": "no-store/);
    expect(route).toMatch(/export async function GET\(\)/);
  });

  it("reads no table, no RPC, no service role, no user", () => {
    for (const src of [route, lib]) {
      expect(src).not.toMatch(/\.from\(|\.rpc\(|supabase\/admin|getSupabaseAdmin|SERVICE_ROLE|getRequestScopedSupabase|getAuthedUser/);
    }
    expect(lib).toMatch(/\/auth\/v1\/health/);
    expect(lib).toMatch(/AbortSignal\.timeout\(HEALTH_DB_TIMEOUT_MS\)/);
    expect(lib).toMatch(/HEALTH_DB_CACHE_MS = 30_000/);
  });

  it("never puts upstream text in the body", () => {
    // The response body is built only by healthResponseBody (pinned in
    // lib/health.test.ts); the route passes nothing else to NextResponse.
    expect(route).toMatch(/NextResponse\.json\(body,/);
    expect(lib).not.toMatch(/res\.(text|json)\(/);
  });
});

describe(".github/workflows/uptime.yml", () => {
  const yml = readFileSync(join(ROOT, ".github/workflows/uptime.yml"), "utf8");
  const code = yml.replace(/^\s*#.*$/gm, "");

  it("runs hourly (not more often) and on demand", () => {
    const crons = [...code.matchAll(/cron:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(crons).toEqual(["17 * * * *"]);
    expect(code).toMatch(/workflow_dispatch:/);
  });

  it("is bounded, uses no secrets and no third-party actions", () => {
    expect(code).toMatch(/timeout-minutes:\s*3\b/);
    expect(code).not.toMatch(/secrets\./);
    // Any `uses:` would have to be pinned by full commit SHA; today there is none.
    for (const m of code.matchAll(/uses:\s*(\S+)/g)) expect(m[1]).toMatch(/@[0-9a-f]{40}$/);
    expect(code).toMatch(/permissions:\s*\{\}/);
  });

  it("checks both URLs for 200, with a time limit and retries, and ok:true on health", () => {
    expect(code).toContain("https://seededtennis.com/)");
    expect(code).toContain("https://seededtennis.com/api/health)");
    expect(code.match(/--max-time 20 --retry 2/g)).toHaveLength(2);
    expect(code.match(/!= "200"/g)).toHaveLength(2);
    expect(code).toMatch(/jq -e '\.ok == true'/);
  });

  it("ci.yml is untouched by it (still the only required check, still `verify`)", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/jobs:\s*\n\s*verify:/);
    expect(ci).not.toMatch(/seededtennis\.com\/api\/health/);
  });
});
