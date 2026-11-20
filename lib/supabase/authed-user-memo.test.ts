import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { __resetVerifiedUserForTests, getAuthedUser } from "./client";

// D8 (docs/archive/audit-2-perf.md): every loader used to make its own
// /auth/v1/user round trip, serialised behind supabase-js's auth lock — ten
// of them on one /today load. getAuthedUser() now shares ONE server check
// per access token. These pin the parts of that which matter for
// correctness: shared while valid, re-checked when the token changes, and a
// failure is never remembered.

function fakeClient() {
  const state = {
    token: "token-a" as string | null,
    userCalls: 0,
    fail: false,
  };
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: state.token ? { access_token: state.token } : null },
        error: null,
      }),
      getUser: async () => {
        state.userCalls += 1;
        await new Promise((r) => setTimeout(r, 5));
        if (!state.token) return { data: { user: null }, error: { name: "AuthSessionMissingError", message: "Auth session missing!" } };
        if (state.fail) return { data: { user: null }, error: { name: "AuthApiError", message: "boom" } };
        return { data: { user: { id: `user-for-${state.token}` } }, error: null };
      },
    },
  } as unknown as SupabaseClient<Database>;
  return { client, state };
}

describe("getAuthedUser memo", () => {
  beforeEach(() => __resetVerifiedUserForTests());

  it("makes one server call for many concurrent callers on the same token", async () => {
    const { client, state } = fakeClient();
    const results = await Promise.all(Array.from({ length: 8 }, () => getAuthedUser(client)));
    expect(state.userCalls).toBe(1);
    for (const r of results) expect(r.data.user?.id).toBe("user-for-token-a");
    await getAuthedUser(client);
    expect(state.userCalls).toBe(1);
  });

  it("re-checks with the server when the access token changes", async () => {
    const { client, state } = fakeClient();
    await getAuthedUser(client);
    state.token = "token-b";
    const r = await getAuthedUser(client);
    expect(state.userCalls).toBe(2);
    expect(r.data.user?.id).toBe("user-for-token-b");
  });

  it("never remembers a failure", async () => {
    const { client, state } = fakeClient();
    state.fail = true;
    const first = await getAuthedUser(client);
    expect(first.error).toBeTruthy();
    state.fail = false;
    const second = await getAuthedUser(client);
    expect(second.data.user?.id).toBe("user-for-token-a");
    expect(state.userCalls).toBe(2);
  });

  it("with no session, still asks (locally) and shares nothing", async () => {
    const { client, state } = fakeClient();
    state.token = null;
    const r = await getAuthedUser(client);
    expect(r.data.user).toBeNull();
    state.token = "token-a";
    const r2 = await getAuthedUser(client);
    expect(r2.data.user?.id).toBe("user-for-token-a");
  });
});
