import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { codeOnly } from "./testing/source-text";
import { PostgrestError } from "@supabase/supabase-js";
import {
  DatabaseWriteError,
  CONSENT_PENDING_MESSAGE,
  OUTREACH_NEEDS_PLAYER_PLAN_MESSAGE,
  PERMISSION_DENIED_MESSAGE,
  UserFacingError,
  clientWriteErrorMessage,
  clientWriteErrorStatus,
} from "./db/write-error";
import { saveBudgetExpense, saveSeasonBudget } from "./db/family";
import { refusalFromProfile, writeRefusalContext } from "./db/write-refusal";
import { createUtrEntry } from "./db/plan";

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

/**
 * Every way found so far for a route to hand a caught value's text to the
 * browser, by any variable name. Returns one reason per hit. Pure, so the
 * probes an independent verifier used against the first version of this
 * guard (PR #28) are test cases below.
 */
function caughtValueLeaks(src: string): string[] {
  const reasons: string[] = [];
  const names = new Set<string>();
  for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\.catch\(\s*(?:async\s*)?\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>/g)) names.add(m[1]);
  if (/catch\s*\(\s*[{[]/.test(src)) reasons.push("destructures a caught value");
  for (const n of names) {
    const N = n.replace(/\$/g, "\\$");
    const checks: [RegExp, string][] = [
      [new RegExp(`\\b${N}\\s*(?:\\?\\.|\\.)\\s*(message|stack|details|hint|cause)\\b`), `${n}.$1`],
      [new RegExp(`\\b${N}\\s*\\[\\s*["'\`](message|stack|details|hint)`), `${n}["…"]`],
      [new RegExp(`\\bString\\(\\s*${N}\\b`), `String(${n})`],
      [new RegExp(`\\$\\{\\s*${N}\\b`), `\${${n}} in a template`],
      [new RegExp(`JSON\\.stringify\\(\\s*${N}\\b`), `JSON.stringify(${n})`],
      [new RegExp(`\\b${N}\\s*\\.\\s*toString\\(`), `${n}.toString()`],
      [new RegExp(`\\b${N}\\s*\\+\\s*["'\`]|["'\`]\\s*\\+\\s*${N}\\b`), `string + ${n}`],
      [new RegExp(`:\\s*${N}\\s*[,}]`), `${n} itself as a JSON value`],
      // Round 2 (PR #28): a cast or an alias moves the caught value out of
      // sight of every check above. Neither is needed to log or to call
      // clientWriteErrorMessage(err, …), so both are refused outright.
      [new RegExp(`\\(\\s*${N}\\s+as\\b`), `(${n} as …) cast`],
      [new RegExp(`=\\s*${N}\\s*[;,)\\n]`), `alias of ${n}`],
    ];
    for (const [re, why] of checks) {
      const hit = src.match(re);
      if (hit) reasons.push(why.replace("$1", hit[1] ?? ""));
    }
  }
  if (/instanceof Error\s*\?\s*[\w$.?]+\s*\.\s*message/.test(src)) reasons.push("`x instanceof Error ? x.message`");
  // Inside any NextResponse.json(...) argument list, the only `.message`
  // allowed is zod's own issue text.
  for (const args of callArgs(src, "NextResponse.json(")) {
    const stripped = args.replace(/\.issues\[0\]\?\.message/g, "");
    if (/\.\s*message\b|\[\s*["'`]message["'`]\s*\]/.test(stripped)) reasons.push("`.message` inside NextResponse.json(...)");
  }
  return reasons;
}

/** The argument text of every `fn(` call in src, by paren matching. */
function callArgs(src: string, fn: string): string[] {
  const out: string[] = [];
  let at = src.indexOf(fn);
  while (at > -1) {
    let depth = 1;
    let i = at + fn.length;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
    }
    out.push(src.slice(start, i - 1));
    at = src.indexOf(fn, i);
  }
  return out;
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
      expect(src).toMatch(/clientWriteErrorMessage\(err, "[^"]+", refusal\)/);
      expect(src).toMatch(/logServerError\("api\.[a-z_]+\.write_failed", err/);
    });
  }

  for (const file of routeFiles()) {
    it(`${file} hands no caught value's text to anything`, () => {
      expect(caughtValueLeaks(codeOnly(join(ROOT, file))), file).toEqual([]);
    });
  }

  it("the detector catches every probe that beat the first version (PR #28) and more", () => {
    const probes: Record<string, string> = {
      "e.message, any name": `} catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "x" }, { status: 500 }); }`,
      "String(err)": `} catch (err) { return NextResponse.json({ error: clientWriteErrorMessage(err, "x"), detail: String(err) }, { status: 500 }); }`,
      "optional chain": `} catch (boom) { return NextResponse.json({ error: boom?.message ?? "x" }); }`,
      "template": "} catch (err) { return NextResponse.json({ error: `failed: ${err}` }); }",
      "object itself": `} catch (err) { return NextResponse.json({ error: err }, { status: 500 }); }`,
      "concatenation": `} catch (x) { return NextResponse.json({ error: "failed: " + x }); }`,
      "toString": `} catch (x) { return NextResponse.json({ error: x.toString() }); }`,
      "stringify": `} catch (x) { return NextResponse.json({ error: JSON.stringify(x) }); }`,
      "bracket access": `} catch (x) { return NextResponse.json({ error: x["message"] }); }`,
      "destructured": `} catch ({ message }) { return NextResponse.json({ error: message }); }`,
      "promise .catch": `const r = await go().catch((problem) => ({ msg: problem.message }));`,
      "message via a local": `} catch (err) { const m = (err as Error); return NextResponse.json({ error: m.message }); }`,
      "round 2: cast then local": `} catch (err) { const raw = (err as Error).message; return NextResponse.json({ error: raw ?? clientWriteErrorMessage(err, "x") }); }`,
      "round 2: details via a cast": `} catch (err) { return NextResponse.json({ error: clientWriteErrorMessage(err, "x"), detail: (err as { details?: string }).details }); }`,
      "round 2: plain alias": `} catch (err) { const e = err; return NextResponse.json({ error: e.message }); }`,
    };
    for (const [name, src] of Object.entries(probes)) {
      expect(caughtValueLeaks(src), name).not.toEqual([]);
    }
    // ...and stays quiet on what the real routes legitimately do.
    expect(
      caughtValueLeaks(
        `const json = await req.json().catch(() => null);
         if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
         } catch (err) { logServerError("e", err, { route: "/x" }); return NextResponse.json({ error: clientWriteErrorMessage(err, "x") }, { status: 500 }); }`
      )
    ).toEqual([]);
  });

  for (const writer of S10_WRITERS) {
    it(`${writer} throws DatabaseWriteError, never a raw or rewrapped database error`, () => {
      const src = codeOnly(join(ROOT, writer));
      expect(src).not.toMatch(/throw new Error\(\s*\w+\.message\s*\)/);
      // `throw error;` of a PostgrestError (which extends Error) was the
      // third probe that beat the first version.
      expect(src).not.toMatch(/throw\s+[A-Za-z_$][\w$]*\s*;/);
      expect(src).toMatch(/throw new DatabaseWriteError\(/);
    });
  }

  it("UserFacingError only ever carries our own sentence: a string literal or a validator's result", () => {
    // Round 2 (PR #28): `new UserFacingError(error.message)` passed every
    // other test and would have sent Postgres's text to the browser.
    for (const writer of S10_WRITERS) {
      const src = codeOnly(join(ROOT, writer));
      for (const m of src.matchAll(/new UserFacingError\(\s*([^)]*)\)/g)) {
        expect(m[1].trim(), `${writer}: new UserFacingError(${m[1]})`).toMatch(/^("[^"]*"|'[^']*'|`[^`$]*`|validationError)$/);
      }
    }
  });

  it("the write paths behind the S-10 routes throw validation as UserFacingError and nothing as a bare Error", () => {
    for (const writer of S10_WRITERS.filter((w) => w !== "lib/db/settings.ts")) {
      expect(codeOnly(join(ROOT, writer)), writer).not.toMatch(/throw new Error\(/);
    }
  });
});

describe("clientWriteErrorMessage", () => {
  const FALLBACK = "Could not save that match. Try again.";

  it("fails closed: anything not known to be written for a person gets the fallback", () => {
    // A raw PostgrestError extends Error — the first version showed its text.
    const raw = new PostgrestError({
      message: 'new row violates row-level security policy for table "utr_entries"',
      details: "",
      hint: "",
      code: "42501",
    });
    expect(raw).toBeInstanceOf(Error);
    expect(clientWriteErrorMessage(raw, FALLBACK)).toBe(FALLBACK);
    expect(clientWriteErrorMessage(new Error("Budget total can't be negative."), FALLBACK)).toBe(FALLBACK);
    expect(clientWriteErrorMessage(new TypeError("fetch failed"), FALLBACK)).toBe(FALLBACK);
    expect(clientWriteErrorMessage({ message: "plain object" }, FALLBACK)).toBe(FALLBACK);
    // A migration's code with some OTHER text is not that sentence.
    expect(
      clientWriteErrorMessage(new DatabaseWriteError({ message: "Too many changes at once. Try again later. extra", code: "53400" }), FALLBACK)
    ).toBe(FALLBACK);
    // 42501 with a sentence of our own in it still gets the FIXED
    // permission sentence — the database's text is never what is shown.
    expect(clientWriteErrorMessage(new DatabaseWriteError({ message: "Sign in first.", code: "42501" }), FALLBACK)).toBe(
      PERMISSION_DENIED_MESSAGE
    );
    expect(clientWriteErrorStatus(raw)).toBe(500);
  });

  it("hides Postgres's text behind the route's sentence", () => {
    for (const [message, code] of [
      ['new row for relation "budget_expenses" violates check constraint "budget_expenses_amount_check"', "23514"],
      ['duplicate key value violates unique constraint "coach_outreach_pkey"', "23505"],
      ['column "x" does not exist', "42703"],
      ["No rate-limit bucket defined for table matches", "53400"],
      ["", null],
    ] as const) {
      expect(clientWriteErrorMessage(new DatabaseWriteError({ message, code }), FALLBACK)).toBe(FALLBACK);
    }
  });

  it("A5: a permission refusal (42501) is a 403 with exactly one fixed sentence, never Postgres's text", () => {
    expect(PERMISSION_DENIED_MESSAGE).toBe("You don't have permission to do that.");
    for (const message of [
      'new row violates row-level security policy for table "matches"',
      'new row violates row-level security policy for table "season_budgets"',
      "",
    ]) {
      const err = new DatabaseWriteError({ message, code: "42501" });
      expect(clientWriteErrorMessage(err, FALLBACK)).toBe(PERMISSION_DENIED_MESSAGE);
      expect(clientWriteErrorStatus(err)).toBe(403);
    }
    // Fail-closed stays: only a DatabaseWriteError carrying the code counts.
    // A raw PostgrestError with 42501 is not trusted to be what it says.
    const raw = new PostgrestError({ message: "x", details: "", hint: "", code: "42501" });
    expect(clientWriteErrorMessage(raw, FALLBACK)).toBe(FALLBACK);
    expect(clientWriteErrorStatus(raw)).toBe(500);
    expect(clientWriteErrorStatus({ code: "42501" })).toBe(500);
  });

  it("the status goes with the sentence: 400 for our validation, 500 for anything else", () => {
    expect(clientWriteErrorStatus(new UserFacingError("A season budget can be at most $250,000."))).toBe(400);
    expect(clientWriteErrorStatus(new DatabaseWriteError({ message: "x", code: "23514" }))).toBe(500);
    expect(clientWriteErrorStatus(new DatabaseWriteError({ message: "Too many changes at once. Try again later.", code: "53400" }))).toBe(500);
    expect(clientWriteErrorStatus(new TypeError("fetch failed"))).toBe(500);
    expect(clientWriteErrorStatus(null)).toBe(500);
  });

  it("every S-10 route answers with clientWriteErrorStatus(err), not a fixed 500", () => {
    for (const route of S10_ROUTES) {
      const src = codeOnly(join(ROOT, route));
      expect(src, route).toMatch(/clientWriteErrorMessage\(err, "[^"]+", refusal\) \},\s*\{ status: clientWriteErrorStatus\(err\) \}/);
      expect(src, route).not.toMatch(/\{ status: 500 \}/);
      // The reason comes from the caller's own profile, looked up after the
      // refusal (lib/db/write-refusal.ts) — outreach also checks the plan.
      const lookup = route.includes("outreach")
        ? /const refusal = await writeRefusalContext\(ctx\.supabase, ctx\.user\.id, err, \{ needsPlayerPlan: true \}\);/
        : /const refusal = await writeRefusalContext\(ctx\.supabase, ctx\.user\.id, err\);/;
      expect(src, route).toMatch(lookup);
    }
  });

  it("verifier M2: a GRANT/config fault (42501 'permission denied for …') is OUR fault — fallback and 500", () => {
    for (const message of [
      "permission denied for function has_tier",
      "permission denied for table season_budgets",
      "permission denied for schema private",
      "Permission denied for sequence matches_id_seq",
    ]) {
      const err = new DatabaseWriteError({ message, code: "42501" });
      expect(clientWriteErrorMessage(err, FALLBACK), message).toBe(FALLBACK);
      expect(clientWriteErrorStatus(err), message).toBe(500);
      expect(clientWriteErrorMessage(err, FALLBACK, { consentPending: true }), message).toBe(FALLBACK);
    }
    // An RLS refusal is still the person's: 403.
    const rls = new DatabaseWriteError({ message: 'new row violates row-level security policy for table "matches"', code: "42501" });
    expect(clientWriteErrorStatus(rls)).toBe(403);
  });

  it("verifier M2: consent-pending and Free-plan refusals say why (from the caller's own profile)", () => {
    const rls = new DatabaseWriteError({ message: 'new row violates row-level security policy for table "utr_entries"', code: "42501" });
    expect(clientWriteErrorMessage(rls, FALLBACK, { consentPending: true })).toBe(CONSENT_PENDING_MESSAGE);
    expect(clientWriteErrorMessage(rls, FALLBACK, { needsPlayerPlan: true })).toBe(OUTREACH_NEEDS_PLAYER_PLAN_MESSAGE);
    // Consent wins: a pending under-13 is refused everything, whatever the plan.
    expect(clientWriteErrorMessage(rls, FALLBACK, { consentPending: true, needsPlayerPlan: true })).toBe(CONSENT_PENDING_MESSAGE);
    expect(clientWriteErrorMessage(rls, FALLBACK, { consentPending: false, needsPlayerPlan: false })).toBe(PERMISSION_DENIED_MESSAGE);
    expect(clientWriteErrorMessage(rls, FALLBACK, null)).toBe(PERMISSION_DENIED_MESSAGE);
    // The refusal context never turns a non-refusal into one.
    const other = new DatabaseWriteError({ message: "x", code: "23514" });
    expect(clientWriteErrorMessage(other, FALLBACK, { consentPending: true })).toBe(FALLBACK);
    expect(clientWriteErrorMessage(new UserFacingError("Cost can't be negative."), FALLBACK, { consentPending: true })).toBe(
      "Cost can't be negative."
    );
    // Pure profile → reason.
    expect(refusalFromProfile({ consent_status: "pending", subscription_tier: "player" })).toEqual({ consentPending: true, needsPlayerPlan: false });
    expect(refusalFromProfile({ consent_status: "not_required", subscription_tier: "free" }, { needsPlayerPlan: true })).toEqual({
      consentPending: false,
      needsPlayerPlan: true,
    });
    expect(refusalFromProfile({ consent_status: "not_required", subscription_tier: "family" }, { needsPlayerPlan: true }).needsPlayerPlan).toBe(false);
    expect(refusalFromProfile({ consent_status: "not_required", subscription_tier: "free" }).needsPlayerPlan).toBe(false);
  });

  it("verifier M2: the refusal lookup asks nothing unless it was a refusal, and reads only the caller's own row", async () => {
    const calls: string[] = [];
    const fake = {
      from: (t: string) => {
        calls.push(t);
        const q = {
          select: (cols: string) => (calls.push(cols), q),
          eq: (c: string, v: string) => (calls.push(`${c}=${v}`), q),
          maybeSingle: async () => ({ data: { consent_status: "pending", subscription_tier: "free" }, error: null }),
        };
        return q;
      },
    } as never;
    expect(await writeRefusalContext(fake, "u1", new DatabaseWriteError({ message: "x", code: "23514" }))).toBeNull();
    expect(await writeRefusalContext(fake, "u1", new DatabaseWriteError({ message: "permission denied for function f", code: "42501" }))).toBeNull();
    expect(calls).toEqual([]);
    const ctx = await writeRefusalContext(fake, "u1", new DatabaseWriteError({ message: "rls", code: "42501" }), { needsPlayerPlan: true });
    expect(ctx).toEqual({ consentPending: true, needsPlayerPlan: true });
    expect(calls).toEqual(["profiles", "consent_status, subscription_tier", "id=u1"]);
  });

  it("keeps the sentences our own migrations raise for people", () => {
    expect(
      clientWriteErrorMessage(new DatabaseWriteError({ message: "Too many changes at once. Try again later.", code: "53400" }), FALLBACK)
    ).toBe("Too many changes at once. Try again later.");
    expect(clientWriteErrorMessage(new DatabaseWriteError({ message: "Sign in first.", code: "28000" }), FALLBACK)).toBe(
      "Sign in first."
    );
  });

  it("keeps our own validation sentences (UserFacingError) exactly as before", () => {
    expect(clientWriteErrorMessage(new UserFacingError("Budget total can't be negative."), FALLBACK)).toBe(
      "Budget total can't be negative."
    );
    expect(clientWriteErrorMessage("not an error", FALLBACK)).toBe(FALLBACK);
    expect(clientWriteErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });

  it("the real validation paths throw UserFacingError, before any database call", async () => {
    const ctx = { supabase: null as never, userId: "u", familyCode: "F" };
    await expect(saveSeasonBudget({ seasonLabel: "Fall", totalBudget: -1 }, ctx)).rejects.toBeInstanceOf(UserFacingError);
    await expect(saveSeasonBudget({ seasonLabel: "  ", totalBudget: 10 }, ctx)).rejects.toBeInstanceOf(UserFacingError);
    await expect(
      saveBudgetExpense({ category: "travel", label: "", amount: 5, expenseDate: "2026-11-01" }, ctx)
    ).rejects.toBeInstanceOf(UserFacingError);
    await expect(createUtrEntry({ utr: 99, recordedAt: "2026-11-01" }, ctx)).rejects.toBeInstanceOf(UserFacingError);
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
    // :23 since 2026-11-21 (the :17 schedule never registered); one line,
    // a fixed minute, every hour.
    expect(crons).toEqual(["23 * * * *"]);
    expect(code).toMatch(/workflow_dispatch:/);
  });

  it("is bounded, uses no secrets and no third-party actions", () => {
    expect(code).toMatch(/timeout-minutes:\s*4\b/);
    expect(code).not.toMatch(/secrets\./);
    // Any `uses:` would have to be pinned by full commit SHA; today there is none.
    for (const m of code.matchAll(/uses:\s*(\S+)/g)) expect(m[1]).toMatch(/@[0-9a-f]{40}$/);
    expect(code).toMatch(/permissions:\s*\{\}/);
  });

  it("checks both URLs for 200, with a time limit and retries, and ok:true on health", () => {
    expect(code).toContain("https://seededtennis.com/)");
    expect(code).toContain("https://seededtennis.com/api/health)");
    expect(code.match(/--max-time 20 --retry 2 --retry-delay 10/g)).toHaveLength(2);
    expect(code.match(/!= "200"/g)).toHaveLength(2);
    expect(code).toMatch(/jq -e '\.ok == true'/);
  });

  it("ci.yml is untouched by it (still the only required check, still `verify`)", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/jobs:\s*\n\s*verify:/);
    expect(ci).not.toMatch(/seededtennis\.com\/api\/health/);
  });
});
