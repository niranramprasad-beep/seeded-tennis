import { afterEach, describe, expect, it, vi } from "vitest";

/* PR D round 2: markEmailVerified() as behaviour, with the Supabase client
 * stubbed. "verified" only when the database said true; a database "no" or
 * a database error is "not-proven"; 53400 is "rate-limited"; no answer at
 * all is "unreachable" (never reported as "not confirmed"). */

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({ rpc }),
  getAuthedUser: vi.fn(),
}));

const { markEmailVerified } = await import("./email-verification");

afterEach(() => {
  rpc.mockReset();
});

describe("markEmailVerified()", () => {
  it("true -> verified, and it asks mark_email_verified", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await markEmailVerified()).toBe("verified");
    expect(rpc).toHaveBeenCalledWith("mark_email_verified");
  });

  it.each([false, null, "true", 1])("%s -> not-proven", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    expect(await markEmailVerified()).toBe("not-proven");
  });

  it("a database error -> not-proven", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "28000", message: "Sign in first." } });
    expect(await markEmailVerified()).toBe("not-proven");
  });

  it("043's profile_write refusal -> rate-limited", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "53400", message: "email_verify_rate_limited" } });
    expect(await markEmailVerified()).toBe("rate-limited");
  });

  it("a fetch failure reported as an error with no code -> unreachable", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "", message: "TypeError: Failed to fetch" } });
    expect(await markEmailVerified()).toBe("unreachable");
  });

  it("a throw -> unreachable", async () => {
    rpc.mockRejectedValue(new TypeError("fetch failed"));
    expect(await markEmailVerified()).toBe("unreachable");
  });
});
