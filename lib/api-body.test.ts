import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import { bodyErrorSentence, looksLikeZodDefault, parseRequestBody } from "./api-body";
import {
  CHECKOUT_FAILED,
  CHECKOUT_NOT_CONFIGURED,
  CHECKOUT_PLAN_UNAVAILABLE,
  CHECKOUT_PREVIEW_OFF,
  checkoutFailureMessage,
} from "./checkout-messages";

// final-check A15 + A8. A 400 from any API route carries one of OUR
// sentences — the schema's own message, or the route's fixed fallback —
// never zod's default text ("Invalid input: expected object, received
// null"). And /api/whop/checkout's "billing not configured" / "plan not
// configured" are 503s with a fixed sentence, not 500s.

// Every route is exercised past its auth, rate-limit and plan gates, so the
// body parser is what answers. Nothing here reaches a database.
vi.mock("@/lib/api-auth", () => ({
  getRequestScopedSupabase: async () => ({
    supabase: {},
    user: { id: "00000000-0000-0000-0000-0000000fe001", email: "fake-final-e-guard@example.com" },
  }),
  refuseParentPlayerDataWrite: async () => null,
  refuseUnlessFamilyPlan: async () => null,
  getProfileRoleAndFamily: async () => ({ role: "player", familyCode: null }),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimited: async () => null }));

const ROOT = join(__dirname, "..");

describe("parseRequestBody", () => {
  const Schema = z.object({
    tier: z.enum(["player", "family"], { message: "Unknown plan." }),
    count: z.number().min(1, "At least one."),
    label: z.string(),
  });
  const FALLBACK = "Fixed fallback sentence.";

  it("keeps a message the schema wrote", async () => {
    for (const [json, sentence] of [
      [{ tier: "gold", count: 1, label: "" }, "Unknown plan."],
      [{ tier: "player", count: 0, label: "" }, "At least one."],
    ] as const) {
      const r = parseRequestBody(Schema, json, FALLBACK);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(await bodyOf(r.response)).toEqual({ error: sentence });
    }
    const good = parseRequestBody(Schema, { tier: "family", count: 2, label: "x" }, FALLBACK);
    expect(good).toEqual({ ok: true, data: { tier: "family", count: 2, label: "x" } });
  });

  it("answers the fallback for everything zod would have worded itself", async () => {
    for (const json of [null, "a string", 42, [], { tier: "player", count: 1, label: 7 }, { tier: "player" }]) {
      const r = parseRequestBody(Schema, json, FALLBACK);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.response.status).toBe(400);
        expect(await bodyOf(r.response)).toEqual({ error: FALLBACK });
      }
    }
  });

  it("fails closed if zod's own wording ever comes through anyway", () => {
    const fake = new z.ZodError([
      { code: "invalid_type", expected: "object", path: [], message: "Invalid input: expected object, received null" } as never,
    ]);
    expect(bodyErrorSentence(fake, FALLBACK)).toBe(FALLBACK);
    for (const zodText of [
      "Invalid input: expected object, received null",
      "Invalid input",
      "Too small: expected number to be >=1",
      "Too big: expected string to have <=10 characters",
      "Unrecognized key: \"x\"",
      "Invalid option: expected one of \"a\"|\"b\"",
      "Expected string, received number",
      "Required",
    ]) {
      expect(looksLikeZodDefault(zodText), zodText).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Static: no route words its own 400 from a zod result
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}
const API_FILES = walk(join(ROOT, "app"));

describe("no route under app/ reads zod's issues itself", () => {
  it("nobody calls safeParse/parse on a body or reads .issues / .flatten() / .format()", () => {
    const hits: string[] = [];
    for (const f of API_FILES) {
      const src = readFileSync(f, "utf8");
      for (const [why, re] of [
        ["calls safeParse itself", /\.safeParse(Async)?\s*\(/],
        ["reads .issues", /\.issues\b/],
        ["flattens or formats a ZodError", /\.(flatten|format)\s*\(\s*\)/],
        ["calls .parse() (throws zod's text)", /Schema\.parse(Async)?\s*\(/],
      ] as const) {
        if (re.test(src)) hits.push(`${relative(ROOT, f)}: ${why}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("every route that reads a JSON body validates it with parseRequestBody", () => {
    const readers = API_FILES.filter((f) => /\breq(uest)?\.json\(\)/.test(readFileSync(f, "utf8")));
    expect(readers.length).toBeGreaterThanOrEqual(9);
    const missing = readers.filter((f) => !/parseRequestBody\(/.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Behaviour: every body-reading route, sent garbage
// ---------------------------------------------------------------------------

async function bodyOf(res: Response): Promise<unknown> {
  return res.json();
}

function post(body: string | null): Request {
  return new Request("https://seeded.test/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer fake" },
    body,
  });
}

// The schema-authored sentences a garbage body may legitimately get back.
const OWN_MESSAGES = new Set([
  "Unknown plan.",
  "Type DELETE to confirm.",
  "A school is required.",
  "Enter your name.",
]);

const ROUTES = [
  "app/api/whop/checkout/route.ts",
  "app/api/training/sessions/route.ts",
  "app/api/family/budget/route.ts",
  "app/api/family/budget/expenses/route.ts",
  "app/api/matches/route.ts",
  "app/api/profile/route.ts",
  "app/api/account/deletion/route.ts",
  "app/api/outreach/route.ts",
  "app/api/utr-entries/route.ts",
];

const GARBAGE: Array<[string, string | null]> = [
  ["no body", null],
  ["not JSON", "this is not json"],
  ["JSON null", "null"],
  ["a JSON string", JSON.stringify("hello")],
  ["an array", "[]"],
  ["an empty object", "{}"],
  ["wrong types", JSON.stringify({ tier: 5, kind: 7, name: 3, sessions: "x", seasonLabel: 1 })],
];

describe("every body-reading route answers garbage with our own sentence", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  for (const route of ROUTES) {
    it(route, async () => {
      // Checkout validates only once it knows billing is configured.
      vi.stubEnv("WHOP_API_KEY", "fake-key-for-tests");
      const mod = (await import(`@/${route.replace(/\.ts$/, "")}`)) as { POST: (r: Request) => Promise<Response> };
      const src = readFileSync(join(ROOT, route), "utf8");
      const fallback = /parseRequestBody\(\s*\w+\s*,\s*json\s*,\s*"([^"]+)"/.exec(src)?.[1];
      expect(fallback, "the route names a literal fallback sentence").toBeTruthy();
      for (const [label, body] of GARBAGE) {
        const res = await mod.POST(post(body));
        expect(res.status, `${label}`).toBe(400);
        const { error } = (await res.json()) as { error: string };
        expect(looksLikeZodDefault(error), `${label}: ${error}`).toBe(false);
        expect(error === fallback || OWN_MESSAGES.has(error), `${label}: ${error}`).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// /api/whop/checkout and /api/whop/webhook when billing is not configured
// ---------------------------------------------------------------------------

describe("/api/whop/checkout: not configured is a 503 with a fixed sentence", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const body = JSON.stringify({ tier: "player", interval: "monthly" });

  it("no Whop key on a Vercel Preview: says checkout is off on previews", async () => {
    vi.stubEnv("WHOP_API_KEY", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    const { POST } = await import("@/app/api/whop/checkout/route");
    const res = await POST(post(body));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: CHECKOUT_PREVIEW_OFF });
  });

  it("no Whop key anywhere else: 'isn't available right now', nothing charged", async () => {
    vi.stubEnv("WHOP_API_KEY", "");
    vi.stubEnv("VERCEL_ENV", "production");
    const { POST } = await import("@/app/api/whop/checkout/route");
    const res = await POST(post(body));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: CHECKOUT_NOT_CONFIGURED });
  });

  it("the plan's variable missing: 503 'That plan isn't available', never a fallback plan", async () => {
    vi.stubEnv("WHOP_API_KEY", "fake-key-for-tests");
    vi.stubEnv("WHOP_PLAN_PLAYER_MONTHLY", "");
    const { POST } = await import("@/app/api/whop/checkout/route");
    const res = await POST(post(body));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: CHECKOUT_PLAN_UNAVAILABLE });
  });

  it("every one of those sentences says nothing was charged", () => {
    for (const s of [CHECKOUT_PREVIEW_OFF, CHECKOUT_NOT_CONFIGURED, CHECKOUT_PLAN_UNAVAILABLE, CHECKOUT_FAILED]) {
      expect(s).toMatch(/nothing was charged/);
    }
  });

  it("the /pricing card shows the route's sentence, or a fixed one — never a parser error", () => {
    expect(checkoutFailureMessage({ error: CHECKOUT_PREVIEW_OFF })).toBe(CHECKOUT_PREVIEW_OFF);
    expect(checkoutFailureMessage(null)).toBe(CHECKOUT_FAILED);
    expect(checkoutFailureMessage({ error: "" })).toBe(CHECKOUT_FAILED);
    expect(checkoutFailureMessage({ error: { code: 1 } })).toBe(CHECKOUT_FAILED);
    expect(checkoutFailureMessage("<html>")).toBe(CHECKOUT_FAILED);
  });
});

describe("/api/whop/webhook: not configured keeps a retryable 5xx and says nothing more", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no secret: 500 (Whop retries a non-2xx), one fixed sentence, no detail", async () => {
    vi.stubEnv("WHOP_WEBHOOK_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { POST } = await import("@/app/api/whop/webhook/route");
    const res = await POST(post("{}"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Billing isn't configured yet." });
  });
});
