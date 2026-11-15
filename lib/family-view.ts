import type { FamilyMember } from "@/lib/db/family";
import type { Player, PlayerGender } from "@/lib/types";

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
