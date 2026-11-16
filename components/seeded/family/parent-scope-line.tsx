"use client";

import useSWR from "swr";
import { Eye } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { loadFamilyMembers, type FamilyMember } from "@/lib/db/family";
import { firstNameLastInitial, parentScopeSentence, pickFamilyPlayer } from "@/lib/family-view";

// One sentence, the same on every parent screen: who you are, whose account
// you are looking at, and exactly what you can change.
//
// It exists because the parent's screens told three different stories: the
// sidebar said "read-only", Settings offered a Save button on the player's
// profile, and the budget page let them edit. All three were partly true.
// The sentence itself comes from `parentScopeSentence()` so its claim about
// what a parent may write lives next to the rule, not in a component.
// Renders nothing for a player.
export function ParentScopeLine() {
  const { player } = usePlayer();
  const isParent = player.role === "parent";
  const { data: members } = useSWR<FamilyMember[]>(isParent ? "family-members" : null, () =>
    loadFamilyMembers()
  );
  if (!isParent) return null;

  const subject = pickFamilyPlayer(members ?? []);
  const parentFirst = (player.name || "").trim().split(/\s+/)[0] || "You";
  const playerFirst = subject ? firstNameLastInitial(subject.name).split(" ")[0] : null;

  return (
    <p className="flex items-start gap-2 rounded-lg border border-line bg-card px-4 py-3 text-sm text-stone">
      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-grass" aria-hidden />
      <span>
        {members === undefined ? (
          <span className="text-stone-light">Loading your family…</span>
        ) : (
          parentScopeSentence(parentFirst, playerFirst)
        )}
      </span>
    </p>
  );
}
