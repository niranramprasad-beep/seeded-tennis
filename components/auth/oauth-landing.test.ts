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

  it("lets a failed profile read reject, so the callback's catch reports it", async () => {
    const beginSession = vi.fn();
    await expect(
      landAfterOAuth({ loadPlayer: async () => Promise.reject(new Error("down")), beginSession }, null, "/auth/complete")
    ).rejects.toThrow("down");
    expect(beginSession).not.toHaveBeenCalled();
  });

  it("is what the callback uses — the callback never navigates a returning user without beginSession", () => {
    const src = readFileSync(join(__dirname, "oauth-callback.tsx"), "utf8");
    expect(src).toMatch(/landAfterOAuth\(\s*\{\s*loadPlayer:\s*getCurrentPlayer,\s*beginSession\s*\}/);
    expect(src).not.toMatch(/hasSeededProfile/);
    expect(src).not.toMatch(/\?\?\s*"\/today"/);
  });
});
