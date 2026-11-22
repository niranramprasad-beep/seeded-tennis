import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Player } from "@/lib/types";
import { emptyPlayer } from "@/lib/data/user";
import { landAfterOAuth } from "./oauth-landing";

const returning: Player = { ...emptyPlayer, name: "Fake Player", onboarded: true };

describe("landAfterOAuth (Google sign-in shows the signed-in header without a refresh)", () => {
  it("hands a returning user to beginSession before choosing /today", async () => {
    const order: string[] = [];
    const beginSession = vi.fn(() => order.push("begin"));
    const target = await landAfterOAuth(
      { loadPlayer: async () => (order.push("load"), returning), beginSession },
      null,
      "/auth/complete"
    );
    expect(target).toBe("/today");
    expect(beginSession).toHaveBeenCalledWith(returning);
    expect(order).toEqual(["load", "begin"]);
  });

  it("honours a safe ?next= for a returning user", async () => {
    const beginSession = vi.fn();
    expect(await landAfterOAuth({ loadPlayer: async () => returning, beginSession }, "/schools", "/auth/complete")).toBe(
      "/schools"
    );
    expect(beginSession).toHaveBeenCalledOnce();
  });

  it("sends a Google sign-up (no profile yet) to /auth/complete and starts no session", async () => {
    const beginSession = vi.fn();
    expect(await landAfterOAuth({ loadPlayer: async () => null, beginSession }, null, "/auth/complete")).toBe(
      "/auth/complete"
    );
    expect(await landAfterOAuth({ loadPlayer: async () => null, beginSession }, "/plan", "/auth/complete")).toBe(
      "/auth/complete?next=%2Fplan"
    );
    expect(beginSession).not.toHaveBeenCalled();
  });

  it("treats a failed profile read like no profile (to /auth/complete), as before", async () => {
    const beginSession = vi.fn();
    expect(
      await landAfterOAuth(
        { loadPlayer: async () => Promise.reject(new Error("down")), beginSession },
        null,
        "/auth/complete"
      )
    ).toBe("/auth/complete");
    expect(beginSession).not.toHaveBeenCalled();
  });

  it("is what the callback uses — the callback never navigates a returning user without beginSession", () => {
    const src = readFileSync(join(__dirname, "oauth-callback.tsx"), "utf8");
    expect(src).toMatch(/landAfterOAuth\(\s*\{\s*loadPlayer:\s*getCurrentPlayer,\s*beginSession\s*\}/);
    expect(src).not.toMatch(/hasSeededProfile/);
    expect(src).not.toMatch(/\?\?\s*"\/today"/);
  });

  it("beginSession is authoritative: marks the app hydrated, clears a connection error, discards an in-flight hydrate", () => {
    const src = readFileSync(join(__dirname, "..", "..", "lib", "context", "player-context.tsx"), "utf8");
    const body = src.slice(src.indexOf("const beginSession = useCallback("), src.indexOf("const completeOnboarding"));
    expect(body).toMatch(/\+\+hydrateGeneration\.current/);
    expect(body).toMatch(/setHydrated\(true\)/);
    expect(body).toMatch(/setConnectionError\(null\)/);
    // hydrate() must still refuse to commit a stale generation.
    expect(src).toMatch(/if \(generation !== hydrateGeneration\.current\) return;/);
  });

  it("/auth/complete starts the session for someone who already has a profile", () => {
    const src = readFileSync(join(__dirname, "complete-oauth-signup.tsx"), "utf8");
    expect(src).not.toMatch(/hasSeededProfile\(\)\)\s*return router\.replace/);
    expect(src).toMatch(/beginSession\(existing\)/);
  });
});
