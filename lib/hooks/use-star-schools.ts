"use client";

// Shared star-to-target mechanism — one implementation, used by every page
// that shows a school as a row/card (Schools browser, School Profile,
// Plan's target list). Reuses the exact same real targetSchoolSlugs /
// updatePlayer() mechanism the Schools compare tray's "Save to targets"
// already used; this hook doesn't invent a second concept of "target," it
// just adds: an optimistic UI update (already true of updatePlayer's
// synchronous setPlayer), an Undo-offering toast, and a real silent
// rollback if the write actually fails.
import { useCallback, useRef, useState } from "react";
import { usePlayer } from "@/lib/context/player-context";
import { toggleTargetSchoolSlug } from "@/lib/db/targets";
import type { ToastAction, ToastVariant } from "@/components/seeded/ui/toast";

export interface StarToast {
  message: string;
  variant: ToastVariant;
  action: ToastAction;
}

export interface UseStarSchoolsResult {
  isStarred: (slug: string) => boolean;
  /** `label` is just for the toast copy (e.g. a school's shortName). */
  toggleStar: (slug: string, label: string) => void;
  toast: StarToast | null;
  dismissToast: () => void;
}

export const STAR_TOAST_DURATION_MS = 5000;

export function useStarSchools(): UseStarSchoolsResult {
  const { player, updatePlayer } = usePlayer();
  const [toast, setToast] = useState<StarToast | null>(null);

  // Always-fresh membership list, readable from closures created on a
  // previous render (the undo/rollback callbacks below) without needing
  // this hook's identity to change on every target-list update.
  const slugsRef = useRef(player.targetSchoolSlugs);
  slugsRef.current = player.targetSchoolSlugs;

  // Identifies which click "owns" the currently-visible toast, so a
  // failure callback never clears a NEWER toast raised by a later click.
  const activeTokenRef = useRef(0);

  const isStarred = useCallback(
    (slug: string) => player.targetSchoolSlugs.includes(slug),
    [player.targetSchoolSlugs]
  );

  const dismissToast = useCallback(() => setToast(null), []);

  const toggleStar = useCallback(
    (slug: string, label: string) => {
      const wasStarred = slugsRef.current.includes(slug);
      const next = toggleTargetSchoolSlug(slugsRef.current, slug);

      const token = ++activeTokenRef.current;
      let settled = false;

      // Inverts just THIS slug's membership relative to whatever the list
      // looks like right now — never stomps on a different star toggled
      // in between this click and the undo/rollback actually firing.
      const invert = () => {
        const current = slugsRef.current;
        return wasStarred
          ? current.includes(slug) ? current : [...current, slug]
          : current.filter((s) => s !== slug);
      };

      const undo = () => {
        if (settled) return;
        settled = true;
        void updatePlayer({ targetSchoolSlugs: invert() });
      };

      void updatePlayer({ targetSchoolSlugs: next }).then((ok) => {
        if (ok || settled) return;
        settled = true;
        // Real write failure — roll back quietly. The optimistic UI
        // already implied success; correcting it without a second,
        // scarier popup is the honest move here.
        void updatePlayer({ targetSchoolSlugs: invert() });
        if (activeTokenRef.current === token) setToast(null);
      });

      setToast({
        message: wasStarred ? `Removed ${label} from targets.` : `Added ${label} to targets.`,
        variant: "default",
        action: { label: "Undo", onClick: undo },
      });
    },
    [updatePlayer]
  );

  return { isStarred, toggleStar, toast, dismissToast };
}
