"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Player } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import type { DiagnosticAnswers } from "@/lib/onboarding/diagnostic";
import { saveDiagnosticToAccount } from "@/lib/onboarding/save-diagnostic";
import { AuthError } from "@/components/auth/auth-card";
import { SeededButton } from "@/components/seeded/ui/button";
import { cn } from "@/lib/utils";

/**
 * Signed in, not onboarded yet (a new Google sign-up, typically): the
 * account already exists, so "save" means writing the answers to the
 * caller's OWN profile through the same helper sign-up uses
 * (saveDiagnosticToAccount → saveCurrentPlayer → writeCurrentPlayerProfile,
 * then one dated utr_entries row per rating). It never creates an account
 * and never sends a privileged column — writeCurrentPlayerProfile()'s
 * payload has none of them, and `birth_year` (write-once) is not in it.
 *
 * On the result screen it is the secondary action ("See my fit report" is
 * the screen's green button); in the fit report's aside it is the primary.
 */
export function SignedInDiagnosticSave({
  answers,
  variant = "primary",
  className,
}: {
  answers: DiagnosticAnswers;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const router = useRouter();
  const { beginSession } = usePlayer();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The profile saved but a dated UTR did not: the player IS onboarded now,
  // so the way on is "continue", not "try again" (a retry would write the
  // profile twice and the earlier ratings again).
  const [savedPlayer, setSavedPlayer] = useState<Player | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const saved = await saveDiagnosticToAccount(answers, new Date(), "existing-account");
    setSaving(false);
    if (saved.ok) {
      beginSession(saved.player);
      router.replace("/today");
      return;
    }
    setError(saved.error);
    if (saved.player?.onboarded) setSavedPlayer(saved.player);
  };

  return (
    <div className={cn("space-y-3", className)}>
      {error && <AuthError message={error} id="diagnostic-signed-in-save-error" />}
      {savedPlayer ? (
        <SeededButton
          type="button"
          variant={variant}
          className="w-full"
          onClick={() => {
            beginSession(savedPlayer);
            router.replace("/today");
          }}
        >
          Continue
        </SeededButton>
      ) : (
        <SeededButton type="button" variant={variant} loading={saving} className="w-full" onClick={save}>
          {saving ? "Saving…" : error ? "Try again" : "Save to my profile"}
        </SeededButton>
      )}
    </div>
  );
}
