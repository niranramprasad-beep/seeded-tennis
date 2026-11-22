import { describe, expect, it } from "vitest";
import { runSignOut, type SignOutEffects } from "./sign-out-steps";

/* PR D round 2: PlayerProvider's signOut() and signOutLocal() share this
 * sequence. Pinned: an in-flight hydrate is invalidated FIRST (so it cannot
 * repopulate the state being cleared), browser storage is cleared on both,
 * and only the scope differs. */

function fake(fail = false) {
  const calls: string[] = [];
  const fx: SignOutEffects = {
    bumpHydrateGeneration: () => void calls.push("bump"),
    resetState: () => void calls.push("reset"),
    clearBrowserStorage: () => void calls.push("clear"),
    forgetUser: () => void calls.push("forget"),
    signOutOfSupabase: async (scope) => {
      calls.push(`supabase:${scope}`);
      if (fail) throw new Error("network");
    },
  };
  return { fx, calls };
}

describe("runSignOut", () => {
  it.each(["global", "local"] as const)("%s: bump, reset, clear storage, forget, then Supabase", async (scope) => {
    const { fx, calls } = fake();
    await runSignOut(fx, scope);
    expect(calls).toEqual(["bump", "reset", "clear", "forget", `supabase:${scope}`]);
  });

  it("a failing Supabase call still leaves this tab signed out and cleared", async () => {
    const { fx, calls } = fake(true);
    await expect(runSignOut(fx, "local")).resolves.toBeUndefined();
    expect(calls).toContain("clear");
    expect(calls).toContain("reset");
  });
});
