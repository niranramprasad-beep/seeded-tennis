// Writes a PLAYER's diagnostic answers to the account that was just created
// (email sign-up, or Google via /auth/complete). Called once, right after
// sign-up returns a session — production has email confirmation off, so
// signUp() hands back a session immediately (lib/auth.ts `data.session`).
//
// Two writes, both through the existing route handlers rather than the
// browser client, so the same validation and rate limits apply:
//   1. the profile (POST /api/profile → writeCurrentPlayerProfile), which
//      stores the 0 "no rating" sentinel as NULL;
//   2. one dated utr_entries row per rating given (POST /api/utr-entries),
//      oldest first, each at its own local date.
// A parent's answers are never written here (diagnosticPlayerProfile
// refuses them) — see docs/DECISIONS.md, 2026-11-18.

import type { Player } from "@/lib/types";
import { getCurrentPlayer, saveCurrentPlayer } from "@/lib/auth";
import { createUtrEntry } from "@/lib/db/plan";
import {
  diagnosticPlayerProfile,
  diagnosticUtrEntries,
  type DiagnosticAnswers,
} from "@/lib/onboarding/diagnostic";

export type SaveDiagnosticResult =
  | { ok: true; player: Player }
  | { ok: false; player: Player | null; error: string };

/** Who is saving. "new-account" = right after sign-up (the account exists,
 * so the failure copy says so); "existing-account" = a signed-in player
 * finishing the diagnostic on /onboarding, who was never told anything was
 * "ready". Only the wording differs. */
export type SaveDiagnosticContext = "new-account" | "existing-account";

const FAILURE_COPY: Record<SaveDiagnosticContext, { load: string; profile: string; utr: string }> = {
  "new-account": {
    load: "Your account is ready, but we couldn't load it to save your answers. Sign in and try again.",
    profile: "Your account is ready, but your answers didn't save. You can add them in Settings.",
    utr: "Your account is ready, but a UTR didn't save. You can log it again from your account.",
  },
  "existing-account": {
    load: "We couldn't load your account to save your answers. Try again.",
    profile: "Your answers didn't save. Try again.",
    utr: "Your profile is saved, but a UTR didn't save. You can log it again from your account.",
  },
};

export async function saveDiagnosticToAccount(
  answers: DiagnosticAnswers,
  now: Date = new Date(),
  context: SaveDiagnosticContext = "new-account"
): Promise<SaveDiagnosticResult> {
  const copy = FAILURE_COPY[context];
  let base: Player | null = null;
  try {
    base = await getCurrentPlayer();
  } catch {
    base = null;
  }
  if (!base) {
    return {
      ok: false,
      player: null,
      error: copy.load,
    };
  }

  const next = diagnosticPlayerProfile(base, answers, now);
  if (!(await saveCurrentPlayer(next))) {
    return {
      ok: false,
      player: base,
      error: copy.profile,
    };
  }

  for (const entry of diagnosticUtrEntries(answers, now)) {
    try {
      await createUtrEntry(entry);
    } catch {
      return {
        ok: false,
        player: next,
        error: copy.utr,
      };
    }
  }

  return { ok: true, player: next };
}
