// Settings → Family (/settings/family). Pure helpers, so the screen only
// prints what these decide and the tests can pin the wording.
//
// Every number here comes from the roster family_members() returns
// (lib/db/family-join.ts loadFamilyRoster) and the caps in lib/types —
// never a `profiles` read, and never a hand-typed 4 or 2.

import { FAMILY_PLAN_MAX_PARENTS, FAMILY_PLAN_MAX_PLAYERS } from "@/lib/types";

export interface CapCounts {
  players: number;
  parents: number;
}

/**
 * APPROVED members by role, one per person. A pending request is not a
 * member (it reads nothing until approved) and 045's family_member_count()
 * counts approved members only, so the screen must not count it either —
 * otherwise "4 of 4 players" could show while the database still has room.
 */
export function familyCapCounts(
  roster: ReadonlyArray<{ userId: string; role: "player" | "parent"; status: "approved" | "pending" }>
): CapCounts {
  const seen = new Set<string>();
  const counts: CapCounts = { players: 0, parents: 0 };
  for (const m of roster) {
    if (m.status !== "approved" || seen.has(m.userId)) continue;
    seen.add(m.userId);
    if (m.role === "parent") counts.parents += 1;
    else counts.players += 1;
  }
  return counts;
}

/** "2 of 4 players · 1 of 2 parents". */
export function familyCapLine(counts: CapCounts): string {
  const noun = (n: number, one: string, many: string) => (n === 1 ? one : many);
  return (
    `${counts.players} of ${FAMILY_PLAN_MAX_PLAYERS} ${noun(FAMILY_PLAN_MAX_PLAYERS, "player", "players")}` +
    ` · ${counts.parents} of ${FAMILY_PLAN_MAX_PARENTS} ${noun(FAMILY_PLAN_MAX_PARENTS, "parent", "parents")}`
  );
}

/** True when approving one more of this role would hit 045's cap. */
export function familyRoleIsFull(counts: CapCounts, role: "player" | "parent"): boolean {
  return role === "parent" ? counts.parents >= FAMILY_PLAN_MAX_PARENTS : counts.players >= FAMILY_PLAN_MAX_PLAYERS;
}

/** "Joined Nov 3, 2026" in the viewer's own time zone. null for a bad date.
 * A pending row's date is when they ASKED, so it takes another verb. */
export function joinedLabel(iso: string | null | undefined, verb: "Joined" | "Asked" = "Joined"): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${verb} ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

/** What the Leave dialog says will happen. Honest about the two things that
 * change for the rest of the family: they stop seeing you, and a Family plan
 * you pay for stops covering them (045: the unlock follows the payer's home
 * family). */
export function leaveFamilyConsequences(opts: {
  viewerPaysForFamily: boolean;
  /** 046 resets consent to pending for an under-13 left with no family. */
  viewerNeedsParentConsent?: boolean;
}): string[] {
  const lines = [
    "You stop seeing this family's members, and they stop seeing you.",
    "To come back, you'd need the family code and someone in the family to approve you again.",
  ];
  if (opts.viewerNeedsParentConsent) {
    lines.push(
      "Because of your age, your account stops saving anything until a parent in a new family approves you."
    );
  }
  if (opts.viewerPaysForFamily) {
    lines.push("Your Family plan stops covering this family. It stays on your account.");
  }
  return lines;
}
