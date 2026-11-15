import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { unwrapWebhook } from "@whop/sdk/helpers";
import { tierForPlanId, type WhopPlanIds } from "./whop";

// TASK 1. The payloads below are the REAL shape, copied from a live read of
// membership `mem_xZKHm92QxEIqsS` against the Whop API at
// `api_version_date: 2026-11-14` — the exact version webhook
// hook_ActwvOQFQX4Pm is pinned to. Personal fields are replaced with fake
// values; the FIELD NAMES are untouched, which is the whole point.
//
// Why this file exists: the handler originally read the plan as
// `plan_id ?? plan?.id`. The 2026-11-14 resource has neither — Whop renamed
// plans to variants, so it is **`variant_id`**. Every delivery would have
// resolved to "unknown plan" and granted nothing: the same silent nothing as
// the outage that started all this, one layer further in. Nothing in the
// test suite could have caught it, because every test used a payload shape
// someone had made up.
//
// So these tests assert against the recorded shape, and the name of this
// file is a request to re-record it whenever the webhook's
// `api_version_date` is changed.

const IDS: WhopPlanIds = {
  playerMonthly: "plan_iWNSNKqks0ddp",
  playerYearly: "plan_uh50GMFYQVxAc",
  familyMonthly: "plan_0z5e439ZymJC9",
  familyYearly: "plan_06ceyeQdTKF29",
  legacyPlayer: "plan_TdtqfjDqtjGOq",
  legacyFamily: "plan_8ybt0oV8kZ79m",
};

const SECRET = "ws_test_secret_value_for_unit_tests";

/** The 2026-11-14 membership resource. Field names verbatim from the live
 * API; values fake. */
function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem_xZKHm92QxEIqsS",
    status: "active",
    user_id: "user_FAKE000000000",
    member_id: "mber_FAKE000000000",
    product_id: "prod_J02fNUDMl7eEw",
    product: { id: "prod_J02fNUDMl7eEw", title: "Player Access", logo_url: null },
    // THE FIELD. Not plan_id. Not plan.id.
    variant_id: IDS.legacyPlayer,
    promo_code_id: null,
    billing_period_days: 30,
    initial_price: { currency: "usd", amount: "0.00", decimals: 2, display_decimals: 2 },
    renewal_price: { currency: "usd", amount: "19.00", decimals: 2, display_decimals: 2 },
    split_pay_current_payments: null,
    split_pay_required_payments: null,
    collection_method: "charge_automatically",
    license_key: null,
    phone_number: null,
    cancel_at_period_end: false,
    current_period_start: "2026-11-03T00:00:29.522Z",
    current_period_end: "2026-12-03T00:00:29.522Z",
    expires_at: null,
    canceled_at: null,
    cancel_option: null,
    cancellation_reason: null,
    feedback_option: null,
    most_recent_action: "renewing_on",
    most_recent_action_at: "2026-12-03T00:00:29.522Z",
    manage_url: "https://whop.com/billing/manage/mber_FAKE000000000",
    metadata: { tier: "player", supabase_user_id: "00000000-0000-0000-0000-00000000f00d" },
    created_at: "2026-10-04T00:00:29.377Z",
    updated_at: "2026-11-03T00:16:54.139Z",
    member: null,
    affiliate: null,
    external_accounts: [],
    account: { id: "biz_UskbjibeFag2Pv", title: "Seeded Tennis", route: "seededtennis", logo_url: null },
    ...overrides,
  };
}

function event(type: string, data: Record<string, unknown>) {
  return JSON.stringify({ type, data });
}

function sign(payload: string, id = "msg_test") {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", Buffer.from(SECRET, "utf8"))
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  };
}

// The handler's own field readers. Kept in step with
// app/api/whop/webhook/route.ts — if that file's readers change, these must
// too, and a test that goes green while the route goes wrong is caught by
// the "the route reads the same way" test at the bottom.
interface Data {
  id?: string;
  status?: string;
  variant_id?: string;
  plan_id?: string;
  plan?: { id?: string } | null;
  metadata?: Record<string, unknown> | null;
  email?: string | null;
  user?: { email?: string | null } | null;
  member?: { email?: string | null; user?: { email?: string | null } | null } | null;
}
const planIdOf = (d: Data) => d.variant_id ?? d.plan_id ?? d.plan?.id ?? null;
const emailOf = (d: Data) =>
  d.member?.email ?? d.member?.user?.email ?? d.user?.email ?? d.email ?? null;

describe("the 2026-11-14 payload, signed and unwrapped", () => {
  for (const type of ["membership.activated", "membership.updated", "membership.deactivated"]) {
    it(`${type}: verifies and yields a usable membership`, () => {
      const status = type === "membership.deactivated" ? "canceled" : "active";
      const body = event(type, membership({ status }));
      const parsed = unwrapWebhook<{ type: string; data: Data }>(body, {
        headers: sign(body),
        key: SECRET,
      });

      expect(parsed.type).toBe(type);
      expect(parsed.data.id).toBe("mem_xZKHm92QxEIqsS");
      expect(parsed.data.status).toBe(status);
      expect(parsed.data.metadata?.supabase_user_id).toBe(
        "00000000-0000-0000-0000-00000000f00d"
      );
      // The assertion this file exists for.
      expect(planIdOf(parsed.data)).toBe(IDS.legacyPlayer);
      expect(tierForPlanId(planIdOf(parsed.data), IDS)).toBe("player");
    });
  }

  it("resolves every one of the six plans from a real-shaped payload", () => {
    const expected: [string | undefined, string][] = [
      [IDS.playerMonthly, "player"],
      [IDS.playerYearly, "player"],
      [IDS.familyMonthly, "family"],
      [IDS.familyYearly, "family"],
      [IDS.legacyPlayer, "player"],
      [IDS.legacyFamily, "family"],
    ];
    for (const [variantId, tier] of expected) {
      const body = event("membership.activated", membership({ variant_id: variantId }));
      const parsed = unwrapWebhook<{ data: Data }>(body, { headers: sign(body), key: SECRET });
      expect(tierForPlanId(planIdOf(parsed.data), IDS), String(variantId)).toBe(tier);
    }
  });

  it("FAILS the way the bug did if only the old field names are read", () => {
    // The regression, stated as a test. A reader that looks for plan_id or
    // plan.id finds nothing in this payload and resolves to "free" — which
    // the handler turns into "unknown-plan", granting nothing, silently.
    const body = event("membership.activated", membership());
    const parsed = unwrapWebhook<{ data: Data }>(body, { headers: sign(body), key: SECRET });
    const oldReader = (d: Data) => d.plan_id ?? d.plan?.id ?? null;
    expect(oldReader(parsed.data)).toBeNull();
    expect(tierForPlanId(oldReader(parsed.data), IDS)).toBe("free");
    // And the current reader does not.
    expect(tierForPlanId(planIdOf(parsed.data), IDS)).toBe("player");
  });

  it("still reads a pre-2026-11-14 payload", () => {
    // A webhook pinned to an older api_version_date sends plan_id. Costs two
    // `??` to survive, so it does.
    const old = { id: "mem_old", status: "active", plan_id: IDS.familyMonthly, metadata: {} };
    expect(tierForPlanId(planIdOf(old), IDS)).toBe("family");
    expect(tierForPlanId(planIdOf({ id: "m", plan: { id: IDS.playerYearly } }), IDS)).toBe("player");
  });

  it("finds the buyer's email wherever this version puts it", () => {
    // The live resource has `member: null` and no top-level email, so all of
    // these are maybes and the fallback is best-effort by design.
    expect(emailOf(membership() as Data)).toBeNull();
    expect(emailOf({ member: { email: "a@example.com" } })).toBe("a@example.com");
    expect(emailOf({ member: { email: null, user: { email: "b@example.com" } } })).toBe(
      "b@example.com"
    );
    expect(emailOf({ user: { email: "c@example.com" } })).toBe("c@example.com");
    expect(emailOf({ email: "d@example.com" })).toBe("d@example.com");
  });

  it("rejects a payload whose variant_id was swapped after signing", () => {
    // Upgrading yourself to Family by editing the body in flight.
    const body = event("membership.activated", membership());
    const headers = sign(body);
    const tampered = body.replace(IDS.legacyPlayer!, IDS.familyYearly!);
    expect(tampered).not.toBe(body);
    expect(() => unwrapWebhook(tampered, { headers, key: SECRET })).toThrow();
  });
});

describe("the route reads the same way this test does", () => {
  it("has the variant_id-first reader and the four-deep email reader", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const route = readFileSync(
      join(__dirname, "..", "app", "api", "whop", "webhook", "route.ts"),
      "utf8"
    );
    // Guards against this file drifting into testing its own local copy.
    expect(route).toContain("data.variant_id ?? data.plan_id ?? data.plan?.id");
    expect(route).toContain("data.member?.email");
  });
});
