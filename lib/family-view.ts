import type { FamilyMember } from "@/lib/db/family";
import type { FamilyPlanStatus } from "@/lib/db/family-plan";
import type { Player, PlayerGender } from "@/lib/types";

/**
 * Whether the roster's player stats are hidden by the Family plan.
 *
 * Migration 044 returns another member's current_utr, grade,
 * graduation_year, target_school_slugs and gender as NULL unless the family
 * is on the Family plan. A NULL there therefore means one of two things —
 * "nobody entered it" or "your plan does not include it" — and a screen that
 * says "hasn't logged a UTR yet" to a free parent whose child has a rating is
 * saying something untrue. `undefined` while the plan status is loading.
 * Fails closed exactly like familyPlanStatusFor(): an error reads as locked.
 */
export function rosterStatsLocked(
  plan: Pick<FamilyPlanStatus, "unlocked" | "reason"> | undefined
): boolean | undefined {
  if (!plan) return undefined;
  return !plan.unlocked && plan.reason === "free";
}

/** What a parent screen says when it has no rating for the player. */
export function missingPlayerUtrPhrase(playerFirst: string, locked: boolean | undefined): string {
  return locked
    ? `${playerFirst}’s rating shows with the Family plan`
    : `${playerFirst} hasn’t logged a UTR yet`;
}

/** What a parent screen says when it has no class year for the player. */
export function missingClassYearPhrase(locked: boolean | undefined): string {
  return locked ? "Class year shows with the Family plan" : "Class year not set";
}

// The rule that /family's three views kept getting wrong, as a function.
//
// It started as `playerMember?.currentUtr ?? player.currentUTR`, which looks
// like a sensible fallback and is not: when the family has no approved
// player, or the player's value is null, `player` is the signed-in PARENT.
// /family rendered the parent's placeholder UTR of 7 as the player's rating,
// and the parent's graduation_year as the player's class year.
//
// The first fix replaced the `??` in four files and guarded it with a grep.
// An independent review then defeated that guard with a one-line rename:
//
//     const utrRaw = playerMember?.currentUtr;
//     const currentUTR = utrRaw ?? player.currentUTR;
//
// A text pattern pins one spelling of the mistake. This pins the BEHAVIOUR,
// and `lib/family-view.test.ts` exercises it directly — no renderer needed,
// which is why it is a plain function and not a hook.

export interface FamilyPlayerFacts {
  /** The player's rating, or null when nobody has entered one. Never the
   *  viewer's own number. */
  currentUtr: number | null;
  /** The player's class year, or null. Never the viewer's own. */
  graduationYear: number | null;
  /** The player's gender, or null. It selects the UTR growth curve, so
   *  borrowing the viewer's would fabricate a trajectory. */
  gender: PlayerGender | null;
  /** True when a real player row is being described (so the page can show
   *  the player's name rather than the viewer's). */
  hasLinkedPlayer: boolean;
}

/**
 * Resolve what /family may say about the player.
 *
 * `viewer` is the signed-in user's own profile. Its values are used ONLY
 * when the viewer is themselves the player — never to fill a gap in
 * somebody else's row.
 */
export function resolveFamilyPlayerFacts(
  playerMember: Pick<FamilyMember, "currentUtr" | "graduationYear" | "gender"> | undefined,
  viewer: Pick<Player, "currentUTR" | "graduationYear" | "gender" | "role">
): FamilyPlayerFacts {
  if (playerMember) {
    return {
      currentUtr: playerMember.currentUtr,
      graduationYear: playerMember.graduationYear,
      gender: playerMember.gender ?? null,
      hasLinkedPlayer: true,
    };
  }

  // No player row in the roster. Only a viewer who IS the player may
  // describe themselves.
  if (viewer.role === "player") {
    return {
      currentUtr: viewer.currentUTR > 0 ? viewer.currentUTR : null,
      graduationYear: viewer.graduationYear,
      gender: viewer.gender,
      hasLinkedPlayer: true,
    };
  }

  return { currentUtr: null, graduationYear: null, gender: null, hasLinkedPlayer: false };
}

/**
 * WHICH player a family screen is about. The one answer.
 *
 * Nine call sites each did `members.find((m) => m.role === "player")`, which
 * returns whichever player row `family_members()` happened to list first. In
 * a family with two players (production has one: four profiles on one code)
 * the overview, the weekly report, the budget and /schools could each pick a
 * different child on the same page load, and nothing would say so.
 *
 * Deterministic: the player who joined first, then by id. A family with
 * siblings still only sees one of them — choosing between children is the
 * week-1 parent-dashboard work, not tonight's — but every screen now agrees
 * on which one, and names them, so the choice is visible.
 * `lib/family-view.test.ts` pins the order; `lib/nav-single-source.test.ts`
 * fails the build if a component goes back to picking for itself.
 */
export function pickFamilyPlayer<
  M extends { id: string; role: string; createdAt?: string | null }
>(members: readonly M[]): M | undefined {
  const players = members.filter((m) => m.role === "player");
  if (players.length === 0) return undefined;
  return [...players].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : Number.POSITIVE_INFINITY;
    const tb = b.createdAt ? Date.parse(b.createdAt) : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/**
 * Board 22's sidebar note, under the parent nav. The same claim as
 * `parentScopeSentence`, shorter: a parent writes the budget and notes
 * (RLS: is_parent_member, 033) and nothing else.
 */
export function parentSidebarNote(playerFirst: string | null): string {
  if (!playerFirst) return "No player has joined your family yet. You can edit the budget and send notes.";
  return `You're viewing ${playerFirst}'s account. You can edit the budget and send notes. Everything else is ${playerFirst}'s.`;
}

/**
 * Said on /family when the family has more than one player, so the choice
 * pickFamilyPlayer() made is visible rather than silent. Null otherwise.
 */
export function multiPlayerNote(
  members: readonly { role: string }[],
  shownFirst: string
): string | null {
  const players = members.filter((m) => m.role === "player").length;
  if (players < 2) return null;
  return `Your family has ${players} players. This page shows ${shownFirst}, who joined first.`;
}

/** "Bailey Post035" -> "Bailey P." — how a parent's settings refer to a
 *  linked child. First name and last initial only. */
export function firstNameLastInitial(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Your player";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * The parent's one-line story, used on every parent screen.
 *
 * What a parent may write is decided by RLS, and this sentence must match
 * it: `season_budgets` / `budget_expenses` (is_parent_member) and
 * `encouragement_notes` (033: role = 'parent' AND approved). Nothing of the
 * player's — profile, results, plan, outreach, events — is writable by
 * another account; every one of those tables checks `user_id = auth.uid()`.
 * The budget is shared rather than parent-only, because is_parent_member()
 * also admits a player who joined with the code (docs/TODO.md week 1); the
 * budget page says so where it matters.
 */
export function parentScopeSentence(parentFirst: string, playerFirst: string | null): string {
  if (!playerFirst) {
    return `${parentFirst} · parent · No player has joined your family yet, so there is nothing to show. Share your family code from Settings → Family.`;
  }
  return `${parentFirst} · parent of ${playerFirst} · ${playerFirst}'s profile, results, plan and outreach are read-only for you. You can edit the season budget and send ${playerFirst} notes.`;
}
