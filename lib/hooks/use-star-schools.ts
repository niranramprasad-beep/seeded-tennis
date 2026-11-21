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
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { FREE_TIER_TARGET_SCHOOL_LIMIT } from "@/lib/types";
import { toggleTargetSchoolSlug } from "@/lib/db/targets";
import { MY_CONSENT_STATE_KEY, loadMyConsentState } from "@/lib/db/family-join";
import { targetSchoolEditRefusal, signedInTargetEditRefusal } from "@/lib/config/consent";
import type { ToastAction, ToastVariant } from "@/components/seeded/ui/toast";

export interface StarToast {
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

export interface UseStarSchoolsResult {
  isStarred: (slug: string) => boolean;
  /** `label` is just for the toast copy (e.g. a school's shortName). */
  toggleStar: (slug: string, label: string) => void;
  toast: StarToast | null;
  dismissToast: () => void;
  /** False for a parent account. A parent's "targets" would be their OWN
   * profile's list — not their player's — so a star on a parent's screen
   * both edits the wrong row and shows the wrong state. Callers hide the
   * control when this is false; toggleStar is also a no-op, so a keyboard
   * shortcut cannot reach it either. */
  canStar: boolean;
  /** One write for several schools (the compare tray). Applies the same
   * Free limit as toggleStar — it used to skip it, so a Free account adding
   * three from the tray saw them saved and then lost them when /api/profile
   * refused the write. */
  addManyToTargets: (slugs: string[]) => void;
}

export const STAR_TOAST_DURATION_MS = 5000;

export function useStarSchools(): UseStarSchoolsResult {
  const { player, updatePlayer, isAuthed, hydrated } = usePlayer();
  const { canAccess } = useTier();
  const router = useRouter();
  const [toast, setToast] = useState<StarToast | null>(null);

  // QA sweep H1 (UI half). An under-13 account waiting for a parent's
  // consent must not add or remove targets. /schools is public, so
  // ConsentPendingScreen (AuthGate) never covers it. Same SWR key AuthGate
  // uses, so the answer is shared rather than fetched twice. This is the
  // UI's refusal only — the database-side fix is a separate migration.
  const { data: consent, error: consentError } = useSWR(
    isAuthed && hydrated ? MY_CONSENT_STATE_KEY : null,
    () => loadMyConsentState()
  );
  // Signed in: refuse until the check answers (no write slips through in
  // the first moments after a reload). Signed out: no consent to check.
  const consentRefusal = isAuthed
    ? signedInTargetEditRefusal(consent?.status, Boolean(consentError))
    : targetSchoolEditRefusal(undefined);

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

  const canStar = player.role !== "parent";

  const toggleStar = useCallback(
    (slug: string, label: string) => {
      if (!canStar) return;
      if (consentRefusal) {
        setToast({ message: consentRefusal, variant: "default" });
        return;
      }
      const wasStarred = slugsRef.current.includes(slug);
      const next = toggleTargetSchoolSlug(slugsRef.current, slug);

      // Free accounts cap out at FREE_TIER_TARGET_SCHOOL_LIMIT targets.
      // Catching it here means the player gets a sentence explaining the
      // limit instead of an optimistic star that silently un-stars itself a
      // moment later when the write is refused. Removing is always allowed,
      // including for an account that downgraded while over the limit —
      // mirrors the same carve-out in migration 024's trigger.
      const isAdding = !wasStarred;
      if (isAdding && !canAccess("player") && next.length > FREE_TIER_TARGET_SCHOOL_LIMIT) {
        setToast({
          message: `Free tracks ${FREE_TIER_TARGET_SCHOOL_LIMIT} schools. Upgrade to Player to track more.`,
          variant: "default",
          action: { label: "See plans", onClick: () => router.push("/pricing") },
        });
        return;
      }

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
    [updatePlayer, canAccess, router, canStar, consentRefusal]
  );

  const addManyToTargets = useCallback(
    (slugs: string[]) => {
      if (!canStar) return;
      if (consentRefusal) {
        setToast({ message: consentRefusal, variant: "default" });
        return;
      }
      const before = slugsRef.current;
      const merged = Array.from(new Set([...before, ...slugs]));
      const added = merged.length - before.length;
      if (added === 0) return;
      if (!canAccess("player") && merged.length > FREE_TIER_TARGET_SCHOOL_LIMIT) {
        setToast({
          message: `Free tracks ${FREE_TIER_TARGET_SCHOOL_LIMIT} schools. Upgrade to Player to track more.`,
          variant: "default",
          action: { label: "See plans", onClick: () => router.push("/pricing") },
        });
        return;
      }
      void updatePlayer({ targetSchoolSlugs: merged }).then((ok) => {
        if (ok) return;
        void updatePlayer({ targetSchoolSlugs: slugsRef.current.filter((s) => before.includes(s)) });
        setToast(null);
      });
      setToast({
        message: `Added ${added} ${added === 1 ? "school" : "schools"} to targets.`,
        variant: "default",
        action: {
          label: "Undo",
          onClick: () => void updatePlayer({ targetSchoolSlugs: slugsRef.current.filter((s) => before.includes(s)) }),
        },
      });
    },
    [canStar, canAccess, router, updatePlayer, consentRefusal]
  );

  return { isStarred, toggleStar, toast, dismissToast, canStar, addManyToTargets };
}
