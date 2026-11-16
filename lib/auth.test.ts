import { describe, expect, it } from "vitest";
import { writeCurrentPlayerProfile, type PlayerWriteContext } from "./auth";
import { emptyPlayer } from "@/lib/data/user";
import type { Player } from "@/lib/types";

// Minimal duck-typed stand-in for the request-scoped Supabase client —
// just enough of the `.from("profiles").upsert(...)` surface
// writeCurrentPlayerProfile actually calls. `results` is consumed in
// order, one per upsert call, so a test can script "fails once (42703),
// then succeeds" without a real database.
function fakeSupabase(results: Array<{ error: { code?: string; message: string } | null }>) {
  const upsertCalls: Record<string, unknown>[] = [];
  let call = 0;
  const supabase = {
    from: (_table: string) => ({
      upsert: async (payload: Record<string, unknown>) => {
        upsertCalls.push(payload);
        const result = results[call] ?? { error: null };
        call += 1;
        return result;
      },
    }),
  };
  return { supabase: supabase as unknown as PlayerWriteContext["supabase"], upsertCalls };
}

const player: Player = {
  ...emptyPlayer,
  name: "Maya Chen",
  currentUTR: 9.5,
  graduationYear: 2028,
  gender: "female",
  familyCode: "CHEN-8X2K",
  homeArea: "Bethesda, MD",
  utrProfileLink: "app.utrsports.net/profiles/12345",
  gpa: 3.7,
};

describe("writeCurrentPlayerProfile", () => {
  it("upserts the full mapped row, including the normalized UTR link, on success", async () => {
    const { supabase, upsertCalls } = fakeSupabase([{ error: null }]);
    const ctx: PlayerWriteContext = { supabase, userId: "user-1", userEmail: "maya@example.com" };

    await expect(writeCurrentPlayerProfile(player, ctx)).resolves.toBeUndefined();

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toMatchObject({
      id: "user-1",
      email: "maya@example.com",
      name: "Maya Chen",
      country: player.country,
      gender: "female",
      role: "player",
      family_code: "CHEN-8X2K",
      current_utr: 9.5,
      graduation_year: 2028,
      home_area: "Bethesda, MD",
      utr_profile_link: "https://app.utrsports.net/profiles/12345",
      gpa: 3.7,
      deletion_requested_at: null,
    });
  });

  it("falls back to the base-only upsert on an undefined-column (42703) error", async () => {
    const { supabase, upsertCalls } = fakeSupabase([
      { error: { code: "42703", message: "column profiles.home_area does not exist" } },
      { error: null },
    ]);
    const ctx: PlayerWriteContext = { supabase, userId: "user-1", userEmail: "maya@example.com" };

    await expect(writeCurrentPlayerProfile(player, ctx)).resolves.toBeUndefined();

    expect(upsertCalls).toHaveLength(2);
    // The fallback row must never carry the migration-014 columns.
    expect(upsertCalls[1]).not.toHaveProperty("home_area");
    expect(upsertCalls[1]).not.toHaveProperty("utr_profile_link");
    expect(upsertCalls[1]).not.toHaveProperty("gpa");
    expect(upsertCalls[1]).not.toHaveProperty("deletion_requested_at");
    expect(upsertCalls[1]).toMatchObject({ id: "user-1", name: "Maya Chen" });
  });

  it("throws the real Supabase error message when the write fails for a non-42703 reason", async () => {
    const { supabase } = fakeSupabase([{ error: { code: "23505", message: "duplicate key value" } }]);
    const ctx: PlayerWriteContext = { supabase, userId: "user-1", userEmail: "maya@example.com" };

    await expect(writeCurrentPlayerProfile(player, ctx)).rejects.toThrow("duplicate key value");
  });

  it("also throws when the 42703 fallback upsert itself fails", async () => {
    const { supabase } = fakeSupabase([
      { error: { code: "42703", message: "column profiles.home_area does not exist" } },
      { error: { code: "500", message: "fallback also failed" } },
    ]);
    const ctx: PlayerWriteContext = { supabase, userId: "user-1", userEmail: "maya@example.com" };

    await expect(writeCurrentPlayerProfile(player, ctx)).rejects.toThrow("fallback also failed");
  });

  it("stores null (not the raw garbage) for an invalid UTR profile link rather than failing the whole write", async () => {
    const { supabase, upsertCalls } = fakeSupabase([{ error: null }]);
    const ctx: PlayerWriteContext = { supabase, userId: "user-1", userEmail: "maya@example.com" };

    await writeCurrentPlayerProfile({ ...player, utrProfileLink: "not a url" }, ctx);

    expect(upsertCalls[0]).toMatchObject({ utr_profile_link: null });
  });

  it("stores null for an empty UTR profile link", async () => {
    const { supabase, upsertCalls } = fakeSupabase([{ error: null }]);
    const ctx: PlayerWriteContext = { supabase, userId: "user-1", userEmail: "maya@example.com" };

    await writeCurrentPlayerProfile({ ...player, utrProfileLink: "" }, ctx);

    expect(upsertCalls[0]).toMatchObject({ utr_profile_link: null });
  });
});
