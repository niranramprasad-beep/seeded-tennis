import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toolBackLink } from "./tool-back-link";
import { isParentAllowedPath, isPlayerBlockedPath } from "./route-access";

/* PR D, D7: the back links on the Tools pages (Results, Tournament checker)
 * must go somewhere the reader can open. The checker's said "← Events" to a
 * parent, whom AuthGate sends away from /events. */

describe("toolBackLink", () => {
  it("a player goes back to Events; a parent to the family Overview; a visitor gets none", () => {
    expect(toolBackLink({ isAuthed: true, role: "player" })).toEqual({ href: "/events", label: "Events" });
    expect(toolBackLink({ isAuthed: true, role: "parent" })).toEqual({ href: "/family", label: "Overview" });
    expect(toolBackLink({ isAuthed: false, role: "player" })).toBeNull();
  });

  it("never points a role at a page that role is bounced from", () => {
    expect(isParentAllowedPath(toolBackLink({ isAuthed: true, role: "parent" })!.href)).toBe(true);
    expect(isPlayerBlockedPath(toolBackLink({ isAuthed: true, role: "player" })!.href)).toBe(false);
  });

  it("both Tools pages use it, and neither hard-codes its own back link", () => {
    for (const file of [
      "../components/seeded/tournament-fit/seeded-tournament-fit-view.tsx",
      "../components/matches/match-history-view.tsx",
    ]) {
      const src = readFileSync(join(__dirname, file), "utf8");
      expect(src, file).toMatch(/toolBackLink\(/);
      expect(src, file).not.toMatch(/<Link href="\/events"[^>]*>\s*<ArrowLeft/);
    }
  });
});
