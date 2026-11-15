import { describe, expect, it } from "vitest";
import { applyMembershipToProfile, escapeLikePattern, findProfileIdByEmail } from "./whop-sync";

// A stand-in for the service-role client, holding profile rows in memory and
// answering only the four query shapes lib/whop-sync.ts actually builds.
// Deliberately NOT a generic mock: if the module starts issuing a query this
// does not model, the test should fail loudly rather than quietly return
// undefined and let a broken guard look like a passing one.

interface Row {
  id: string;
  email?: string | null;
  subscription_tier?: string;
  whop_membership_id?: string | null;
}

/** Postgres ILIKE semantics, so the stub behaves like the database rather
 * than like a string compare. Without this the wildcard regression below
 * would pass against a stub that never had wildcards in the first place. */
function likeMatches(value: string, pattern: string): boolean {
  let rx = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") {
      // Escaped: the next character is a literal.
      i++;
      rx += pattern[i]?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? "";
    } else if (ch === "%") rx += ".*";
    else if (ch === "_") rx += ".";
    else rx += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${rx}$`, "i").test(value);
}

function fakeAdmin(rows: Row[], opts: { failWrites?: boolean } = {}) {
  const state = rows.map((r) => ({ ...r }));

  function from(table: string) {
    if (table !== "profiles") throw new Error(`unexpected table ${table}`);
    return {
      select(_cols: string) {
        const filters: { col: keyof Row; value: unknown; op: "eq" | "ilike" }[] = [];
        const api = {
          eq(col: keyof Row, value: unknown) {
            filters.push({ col, value, op: "eq" });
            return api;
          },
          ilike(col: keyof Row, value: string) {
            filters.push({ col, value, op: "ilike" });
            return api;
          },
          limit(_n: number) {
            return Promise.resolve({ data: match(), error: null });
          },
          maybeSingle() {
            return Promise.resolve({ data: match()[0] ?? null, error: null });
          },
        };
        function match() {
          return state.filter((row) =>
            filters.every((f) =>
              f.op === "ilike" ? likeMatches(String(row[f.col] ?? ""), String(f.value)) : row[f.col] === f.value
            )
          );
        }
        return api;
      },
      update(patch: Partial<Row>) {
        const filters: { col: keyof Row; value: unknown }[] = [];
        const apply = () => {
          const hit = state.filter((row) => filters.every((f) => row[f.col] === f.value));
          for (const row of hit) Object.assign(row, patch);
          return hit;
        };
        const api = {
          eq(col: keyof Row, value: unknown) {
            filters.push({ col, value });
            return api;
          },
          select(_cols: string) {
            if (opts.failWrites) return Promise.resolve({ data: null, error: { message: "boom" } });
            return Promise.resolve({ data: apply().map((r) => ({ id: r.id })), error: null });
          },
          // Awaited directly (no .select()) by the grant path.
          then(resolve: (v: { error: unknown }) => void) {
            if (opts.failWrites) return resolve({ error: { message: "boom" } });
            apply();
            return resolve({ error: null });
          },
        };
        return api;
      },
    };
  }

  // Shaped to the four query forms lib/whop-sync.ts builds, nothing wider.
  return { client: { from } as any, state };
}

// Four of the six real plan ids; the registry is read from process.env here,
// which is empty under vitest — so these tests set it explicitly.
const PLAYER_MONTHLY = "plan_iWNSNKqks0ddp";
const FAMILY_MONTHLY = "plan_0z5e439ZymJC9";
const LEGACY_PLAYER = "plan_TdtqfjDqtjGOq";

// MUST await the callback. An earlier version was synchronous and returned
// the promise, so `finally` restored the environment at the callback's first
// `await` — every assertion after that point ran with no plan ids
// configured, and `tierForPlanId` correctly answered "free". It showed up as
// one failing case in a loop whose first iteration passed, which is exactly
// how a test helper lies.
async function withPlans(fn: () => Promise<void>): Promise<void> {
  const saved = { ...process.env };
  process.env.WHOP_PLAN_PLAYER_MONTHLY = PLAYER_MONTHLY;
  process.env.WHOP_PLAN_FAMILY_MONTHLY = FAMILY_MONTHLY;
  process.env.WHOP_PLAN_PLAYER = LEGACY_PLAYER;
  try {
    await fn();
  } finally {
    process.env = saved;
  }
}

describe("granting access", () => {
  it("upgrades a free account and records the membership", async () =>
    withPlans(async () => {
      const { client, state } = fakeAdmin([
        { id: "u1", subscription_tier: "free", whop_membership_id: null },
      ]);
      const out = await applyMembershipToProfile(client, {
        supabaseUserId: "u1",
        membershipId: "mem_1",
        planId: PLAYER_MONTHLY,
        status: "active",
      });
      expect(out).toEqual({ applied: true, tier: "player", reason: "granted" });
      expect(state[0].subscription_tier).toBe("player");
      expect(state[0].whop_membership_id).toBe("mem_1");
    }));

  it("is idempotent — the second identical call changes nothing", async () =>
    withPlans(async () => {
      // This is what makes the post-checkout sync safe to run on every page
      // load carrying ?checkout=success.
      const { client } = fakeAdmin([
        { id: "u1", subscription_tier: "player", whop_membership_id: "mem_1" },
      ]);
      const out = await applyMembershipToProfile(client, {
        supabaseUserId: "u1",
        membershipId: "mem_1",
        planId: PLAYER_MONTHLY,
        status: "active",
      });
      expect(out).toEqual({ applied: false, reason: "already-current" });
    }));

  it("honours a legacy plan", async () =>
    withPlans(async () => {
      const { client, state } = fakeAdmin([{ id: "u1", subscription_tier: "free" }]);
      await applyMembershipToProfile(client, {
        supabaseUserId: "u1",
        membershipId: "mem_old",
        planId: LEGACY_PLAYER,
        status: "active",
      });
      expect(state[0].subscription_tier).toBe("player");
    }));

  it("treats trialing and completed as access, and past_due as not", async () =>
    withPlans(async () => {
      for (const status of ["active", "trialing", "completed"]) {
        const { client, state } = fakeAdmin([{ id: "u1", subscription_tier: "free" }]);
        await applyMembershipToProfile(client, {
          supabaseUserId: "u1",
          membershipId: "mem_1",
          planId: PLAYER_MONTHLY,
          status,
        });
        expect(state[0].subscription_tier, status).toBe("player");
      }
      const { client, state } = fakeAdmin([
        { id: "u1", subscription_tier: "player", whop_membership_id: "mem_1" },
      ]);
      await applyMembershipToProfile(client, {
        supabaseUserId: "u1",
        membershipId: "mem_1",
        planId: PLAYER_MONTHLY,
        status: "past_due",
      });
      expect(state[0].subscription_tier).toBe("free");
    }));
});

describe("the anti-downgrade guard", () => {
  it("ignores a stale event for a DIFFERENT membership at a lower tier", async () =>
    withPlans(async () => {
      // The production symptom this exists for: an account on Family was
      // found downgraded to Player with no downgrade in Whop, consistent
      // with a replayed event for a superseded membership.
      const { client, state } = fakeAdmin([
        { id: "u1", subscription_tier: "family", whop_membership_id: "mem_family" },
      ]);
      const out = await applyMembershipToProfile(client, {
        supabaseUserId: "u1",
        membershipId: "mem_old_player",
        planId: PLAYER_MONTHLY,
        status: "active",
      });
      expect(out).toEqual({ applied: false, reason: "would-downgrade-active-membership" });
      expect(state[0].subscription_tier).toBe("family");
      expect(state[0].whop_membership_id).toBe("mem_family");
    }));

  it("still allows a genuine upgrade", async () =>
    withPlans(async () => {
      const { client, state } = fakeAdmin([
        { id: "u1", subscription_tier: "player", whop_membership_id: "mem_player" },
      ]);
      await applyMembershipToProfile(client, {
        supabaseUserId: "u1",
        membershipId: "mem_family",
        planId: FAMILY_MONTHLY,
        status: "active",
      });
      expect(state[0].subscription_tier).toBe("family");
      expect(state[0].whop_membership_id).toBe("mem_family");
    }));

  it("allows a real downgrade on the SAME membership", async () =>
    withPlans(async () => {
      // Someone switching plan in Whop keeps one membership id.
      const { client, state } = fakeAdmin([
        { id: "u1", subscription_tier: "family", whop_membership_id: "mem_1" },
      ]);
      await applyMembershipToProfile(client, {
        supabaseUserId: "u1",
        membershipId: "mem_1",
        planId: PLAYER_MONTHLY,
        status: "active",
      });
      expect(state[0].subscription_tier).toBe("player");
    }));

  it("never grants on a plan it cannot identify", async () =>
    withPlans(async () => {
      const { client, state } = fakeAdmin([{ id: "u1", subscription_tier: "free" }]);
      const out = await applyMembershipToProfile(client, {
        supabaseUserId: "u1",
        membershipId: "mem_1",
        planId: "plan_who_knows",
        status: "active",
      });
      expect(out).toEqual({ applied: false, reason: "unknown-plan" });
      expect(state[0].subscription_tier).toBe("free");
    }));

  it("does not revoke on an unknown plan either", async () =>
    withPlans(async () => {
      // "I can't identify this plan" is not a reason to take access away.
      const { client, state } = fakeAdmin([
        { id: "u1", subscription_tier: "family", whop_membership_id: "mem_1" },
      ]);
      await applyMembershipToProfile(client, {
        supabaseUserId: "u1",
        membershipId: "mem_1",
        planId: null,
        status: "active",
      });
      expect(state[0].subscription_tier).toBe("family");
    }));
});

describe("revoking access", () => {
  it("downgrades when the cancelled membership is the one on record", async () =>
    withPlans(async () => {
      const { client, state } = fakeAdmin([
        { id: "u1", subscription_tier: "player", whop_membership_id: "mem_1" },
      ]);
      const out = await applyMembershipToProfile(client, {
        supabaseUserId: "u1",
        membershipId: "mem_1",
        planId: PLAYER_MONTHLY,
        status: "canceled",
      });
      expect(out).toEqual({ applied: true, tier: "free", reason: "revoked" });
      expect(state[0].subscription_tier).toBe("free");
    }));

  it("ignores a cancellation for a membership the user has already left", async () =>
    withPlans(async () => {
      // Tried Family, cancelled it, still on Player. The cancel of the old
      // one must not take the new one away.
      const { client, state } = fakeAdmin([
        { id: "u1", subscription_tier: "player", whop_membership_id: "mem_new" },
      ]);
      const out = await applyMembershipToProfile(client, {
        supabaseUserId: "u1",
        membershipId: "mem_old",
        planId: FAMILY_MONTHLY,
        status: "canceled",
      });
      expect(out).toEqual({ applied: false, reason: "not-this-users-membership" });
      expect(state[0].subscription_tier).toBe("player");
    }));

  it("reports a failed write instead of claiming success", async () =>
    withPlans(async () => {
      const { client } = fakeAdmin([{ id: "u1", subscription_tier: "free" }], { failWrites: true });
      const out = await applyMembershipToProfile(client, {
        supabaseUserId: "u1",
        membershipId: "mem_1",
        planId: PLAYER_MONTHLY,
        status: "active",
      });
      expect(out).toEqual({ applied: false, reason: "write-failed" });
    }));
});

describe("the email fallback", () => {
  it("finds the one account with that address", async () => {
    const { client } = fakeAdmin([
      { id: "u1", email: "player@example.com" },
      { id: "u2", email: "other@example.com" },
    ]);
    expect(await findProfileIdByEmail(client, "player@example.com")).toBe("u1");
  });

  it("ignores case and surrounding whitespace", async () => {
    const { client } = fakeAdmin([{ id: "u1", email: "Player@Example.com" }]);
    expect(await findProfileIdByEmail(client, "  PLAYER@example.COM ")).toBe("u1");
  });

  it("refuses to guess when two accounts share an address", async () => {
    // Granting a paid tier to the wrong account is worse than granting it
    // late. Ambiguity resolves to "do nothing".
    const { client } = fakeAdmin([
      { id: "u1", email: "shared@example.com" },
      { id: "u2", email: "shared@example.com" },
    ]);
    expect(await findProfileIdByEmail(client, "shared@example.com")).toBeNull();
  });

  it("treats a wildcard in the buyer's email as a literal", async () => {
    // The bug: the email comes from Whop, i.e. from whoever paid, and
    // PostgREST's ilike treats % and _ as wildcards. A membership bought as
    // "%@gmail.com" matched a stranger and attached a paid tier to their
    // account. The limit(2) ambiguity check does NOT catch it — a pattern
    // matching exactly one row looks like a clean match.
    const { client } = fakeAdmin([{ id: "victim", email: "someone@gmail.com" }]);
    expect(await findProfileIdByEmail(client, "%@gmail.com")).toBeNull();
    expect(await findProfileIdByEmail(client, "someone@gmail._om")).toBeNull();
    // And a literal match still works.
    expect(await findProfileIdByEmail(client, "someone@gmail.com")).toBe("victim");
  });

  it("escapes the three characters LIKE treats specially", () => {
    expect(escapeLikePattern("a%b")).toBe("a\\%b");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    // Backslash first, or it would escape the escapes added after it.
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
    expect(escapeLikePattern("plain@example.com")).toBe("plain@example.com");
  });

  it("returns null for no match, no email and an empty string", async () => {
    const { client } = fakeAdmin([{ id: "u1", email: "player@example.com" }]);
    expect(await findProfileIdByEmail(client, "nobody@example.com")).toBeNull();
    expect(await findProfileIdByEmail(client, null)).toBeNull();
    expect(await findProfileIdByEmail(client, undefined)).toBeNull();
    expect(await findProfileIdByEmail(client, "   ")).toBeNull();
  });
});
