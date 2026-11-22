import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_FAMILY_ALREADY } from "./checkout-messages";

// final-check PR E round 2 (M1): /api/whop/checkout never sells a family a
// second Family plan — the server half of lib/plan-entry.ts's button rule —
// and fails OPEN when the check itself errors, because this route is the
// only purchase path. Nothing here reaches Whop or a database.

const rpc = vi.fn();
const create = vi.fn();
const logged: string[] = [];

vi.mock("@/lib/api-auth", () => ({
  getRequestScopedSupabase: async () => ({
    supabase: { rpc },
    user: { id: "00000000-0000-0000-0000-0000000fe002", email: "fake-final-e-guard@example.com" },
  }),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimited: async () => null }));
vi.mock("@/lib/whop", () => ({
  getWhop: () => ({ checkoutConfigurations: { create } }),
  planIdFor: (tier: string, interval: string) => `plan_fake_${tier}_${interval}`,
}));
vi.mock("@/lib/server-log", () => ({
  logServerError: (event: string) => void logged.push(event),
  logServerEvent: () => {},
}));

function post(tier: string): Request {
  return new Request("https://seeded.test/api/whop/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer fake" },
    body: JSON.stringify({ tier, interval: "monthly" }),
  });
}

describe("/api/whop/checkout: no second Family plan", () => {
  beforeEach(() => {
    rpc.mockReset();
    create.mockReset();
    create.mockResolvedValue({ purchase_url: "https://whop.com/checkout/fake" });
    logged.length = 0;
  });

  it("family already unlocked: 409 with the fixed sentence, Whop never called", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { POST } = await import("@/app/api/whop/checkout/route");
    const res = await POST(post("family"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: CHECKOUT_FAMILY_ALREADY });
    expect(rpc).toHaveBeenCalledWith("my_family_has_tier", { p_tier: "family" });
    expect(create).not.toHaveBeenCalled();
  });

  it("family not unlocked: the purchase goes ahead (first Family purchase unchanged)", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const { POST } = await import("@/app/api/whop/checkout/route");
    const res = await POST(post("family"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://whop.com/checkout/fake" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("the check errors: fails OPEN (logged), so Family stays buyable", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "fake outage", code: "XX000" } });
    const { POST } = await import("@/app/api/whop/checkout/route");
    const res = await POST(post("family"));
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    expect(logged).toContain("whop.checkout.family_check_failed");
  });

  it("Player checkout does not ask about the family at all", async () => {
    const { POST } = await import("@/app/api/whop/checkout/route");
    const res = await POST(post("player"));
    expect(res.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });
});
