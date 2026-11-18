"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MailCheck } from "lucide-react";
import { SeededButton } from "@/components/seeded/ui/button";
import { joinFamily } from "@/lib/db/family-join";
import {
  checkEmailVerified,
  rememberMyPendingJoinCode,
  sendVerificationLink,
} from "@/lib/db/email-verification";
import {
  VERIFY_COPY,
  clearPendingJoinCode,
  joinOutcomeFor,
  rememberVerifyReturn,
} from "@/lib/email-verify-flow";
import { usePlayer } from "@/lib/context/player-context";

// The B6 "confirm your email" pieces (migration 043). Calm, never an error
// state: the account is fine, there is one step left, and nothing the person
// typed is lost. See lib/email-verify-flow.ts for the rules.

type SendState = { phase: "idle" | "sending" | "sent"; email?: string; error?: string };

/**
 * "Send the link", with the return path stored BEFORE sending so
 * /auth/verified can bring the person back. The address is always the
 * session's own, as recorded by request_email_verification() (043) — the
 * screen never chooses it.
 */
function useVerificationLink(opts: { returnPath: string }) {
  const [state, setState] = useState<SendState>({ phase: "idle" });
  const send = async () => {
    setState((s) => ({ ...s, phase: "sending", error: undefined }));
    rememberVerifyReturn(opts.returnPath);
    const result = await sendVerificationLink();
    if (result.ok) setState({ phase: "sent", email: result.email });
    else setState((s) => ({ phase: s.email ? "sent" : "idle", email: s.email, error: result.error }));
  };
  return { state, send };
}

/**
 * The join step for a parent that join_family() refused with
 * verify_email_required. Keeps the code (in memory and in localStorage, so
 * /auth/verified can finish the join if the link opens in a new tab).
 */
export function VerifyEmailToJoin({
  code,
  familyLabel = "your family",
  returnPath = "/family",
  bare = false,
  onJoined,
}: {
  code: string;
  familyLabel?: string;
  returnPath?: string;
  /** Inside an AuthCard, which supplies the title and the frame. */
  bare?: boolean;
  onJoined: (status: "pending" | "approved") => void;
}) {
  const { state, send } = useVerificationLink({ returnPath });
  const [retrying, setRetrying] = useState(false);
  const [retryNote, setRetryNote] = useState("");

  const sendAndRemember = async () => {
    // Bound to this account's id: /auth/verified finishes the join only
    // for the account that typed the code.
    await rememberMyPendingJoinCode(code);
    await send();
  };

  const retry = async () => {
    setRetrying(true);
    setRetryNote("");
    const outcome = joinOutcomeFor(await joinFamily(code));
    setRetrying(false);
    if (outcome.kind === "joined") {
      clearPendingJoinCode();
      onJoined(outcome.status);
      return;
    }
    setRetryNote(outcome.kind === "verify" ? VERIFY_COPY.stillUnverified : outcome.message);
  };

  return (
    <div className={bare ? undefined : "rounded-xl border border-line bg-card p-5"} data-testid="verify-email-to-join">
      <div className="flex items-start gap-2.5">
        {!bare && <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-grass" aria-hidden />}
        <div className="min-w-0">
          {!bare && <h2 className="text-lg font-semibold text-ink">{VERIFY_COPY.joinTitle(familyLabel)}</h2>}
          <p className={bare ? "text-[15px] text-stone" : "mt-1.5 text-sm text-stone"}>
            Your account is ready. Parents confirm their email before joining a family, so the
            family knows the request really came from you.
          </p>
          <p className="mt-1.5 text-xs text-stone">
            Code saved: <span className="font-mono font-semibold text-ink">{code}</span>. You
            won&rsquo;t need to type it again.
          </p>
        </div>
      </div>

      {state.phase === "sent" && state.email && (
        <p className="mt-3 text-sm text-ink" role="status">
          {VERIFY_COPY.sent(state.email)}
        </p>
      )}
      {state.error && (
        <p className="mt-3 rounded-lg bg-error-bg px-3 py-2 text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <SeededButton
          className="min-h-[38px]"
          variant={state.phase === "sent" ? "secondary" : "primary"}
          loading={state.phase === "sending"}
          onClick={sendAndRemember}
        >
          {state.phase === "sending"
            ? VERIFY_COPY.sending
            : state.phase === "sent"
              ? VERIFY_COPY.resend
              : VERIFY_COPY.send}
        </SeededButton>
        <SeededButton
          className="min-h-[38px]"
          variant={state.phase === "sent" ? "primary" : "secondary"}
          loading={retrying}
          onClick={retry}
        >
          {VERIFY_COPY.retryJoin}
        </SeededButton>
      </div>
      {retryNote && <p className="mt-3 text-sm text-stone">{retryNote}</p>}
    </div>
  );
}

/**
 * Shown on an approval or consent row INSTEAD of the Approve button when the
 * viewer is a parent who has not confirmed their email (approve_family_join
 * and grant_parent_consent would refuse them with 42501). Deny is never
 * gated. "I've confirmed" re-reads the profile, for a link opened in another
 * tab, and flips Player.emailVerified so the buttons come back.
 */
export function VerifyEmailToApprove({ note }: { note?: string }) {
  const pathname = usePathname();
  const { setPlayerLocal } = usePlayer();
  const { state, send } = useVerificationLink({ returnPath: pathname || "/family" });
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState("");

  const recheck = async () => {
    setChecking(true);
    setCheckNote("");
    const verified = await checkEmailVerified();
    setChecking(false);
    if (verified) setPlayerLocal({ emailVerified: true });
    else setCheckNote(VERIFY_COPY.stillUnverified);
  };

  return (
    <div className="mt-3 rounded-lg border border-line bg-card p-3" data-testid="verify-email-to-approve">
      <p className="text-sm font-semibold text-ink">{VERIFY_COPY.approveTitle}</p>
      <p className="mt-1 text-sm text-stone">
        {note ?? "Seeded asks parents to confirm their email before approving anyone or giving consent."}
      </p>
      {state.phase === "sent" && state.email && (
        <p className="mt-2 text-sm text-ink" role="status">
          {VERIFY_COPY.sent(state.email)}
        </p>
      )}
      {state.error && (
        <p className="mt-2 rounded-lg bg-error-bg px-3 py-2 text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <SeededButton
          className="min-h-[38px]"
          variant={state.phase === "sent" ? "secondary" : "primary"}
          loading={state.phase === "sending"}
          onClick={send}
        >
          {state.phase === "sending"
            ? VERIFY_COPY.sending
            : state.phase === "sent"
              ? VERIFY_COPY.resend
              : VERIFY_COPY.send}
        </SeededButton>
        {state.phase === "sent" && (
          <SeededButton className="min-h-[38px]" variant="primary" loading={checking} onClick={recheck}>
            {VERIFY_COPY.recheck}
          </SeededButton>
        )}
      </div>
      {checkNote && <p className="mt-2 text-sm text-stone">{checkNote}</p>}
    </div>
  );
}
