import { describe, expect, it, vi } from "vitest";

// Final-check PR C (A6), review item: signUp() trims the address before it
// reaches Supabase (a pasted trailing space was refused on /signup's last
// step). The forms trim too (normalizeEmail); this pins the backstop in
// lib/auth.ts itself, with a fake Supabase client that records the call.

const calls: Array<{ email: string }> = [];

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: {
      signUp: async (args: { email: string }) => {
        calls.push({ email: args.email });
        // Confirm-email ON: no session, so signUp() stops before any table write.
        return { data: { session: null, user: null }, error: null };
      },
    },
  }),
  getAuthedUser: async () => ({ user: null, error: null }),
}));

describe("signUp() sends a trimmed address", () => {
  it("leading/trailing whitespace never reaches Supabase", async () => {
    const { signUp } = await import("./auth");
    const result = await signUp(
      {
        name: "Fake Trim",
        email: "  fake-trim@example.com \t",
        password: "not-a-real-pass-1",
        country: "United States",
        gender: "female",
        grade: 10,
        birthYear: 2010,
        role: "player",
      },
      { mode: "create" }
    );
    expect(result.ok).toBe(true);
    expect(result.confirmationRequired).toBe(true);
    expect(calls).toEqual([{ email: "fake-trim@example.com" }]);
  });
});
