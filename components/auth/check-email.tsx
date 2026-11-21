"use client";

import { useState, type ReactNode } from "react";
import { Mail } from "lucide-react";
import { AuthCard } from "./auth-card";

// Board 21's "Check your email" state, shared by the password-reset request
// and by a signup that needs email confirmation.
//
// Board 21 also says "It comes from support@seededtennis.com." That sentence
// is deliberately NOT shown yet. The sender is a Supabase Auth SMTP setting
// this repo cannot read, and the docs disagree about it:
// docs/GO-SEQUENCE.md and docs/archive/FINAL_PASS_REPORT.md describe Google
// Workspace SMTP from that address, while docs/MASTER_ROADMAP.md (NEXT 10
// #3) still lists custom SMTP as an open dashboard step and docs/TODO.md says
// Resend is being wired. Telling someone to look for mail from an address it
// does not come from sends them to spam for the wrong thing. Once the sender
// is confirmed in the Supabase dashboard, set this to SUPPORT_EMAIL from
// lib/config/contact (never a retyped address).
const AUTH_EMAIL_SENDER: string | null = null;

export function CheckEmailCard({
  email,
  lead = "We sent a link to",
  onResend,
  resendFallback,
  children,
  footer,
}: {
  email: string;
  /** The words before the address: "We sent a link to". */
  lead?: string;
  /** Sends the same email again. Its error must already be a friendly
   * sentence (lib/auth.ts maps every Supabase error). */
  onResend?: () => Promise<{ ok: boolean; error?: string }>;
  /** When there is no way to resend from here: a link back to the form. */
  resendFallback?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const [sending, setSending] = useState(false);
  const [sentAgain, setSentAgain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    if (!onResend || sending) return;
    setError(null);
    setSentAgain(false);
    setSending(true);
    const result = await onResend();
    setSending(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't send it again. Wait a minute and try again.");
      return;
    }
    setSentAgain(true);
  };

  return (
    <AuthCard title="Check your email" error={error} footer={footer}>
      <div className="-mt-1">
        <span
          className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-grass-50 text-grass"
          aria-hidden
        >
          <Mail className="h-5 w-5" />
        </span>
        <p className="text-[15px] leading-normal text-ink">
          {lead} <span className="break-all font-semibold">{email}</span>.
          {AUTH_EMAIL_SENDER && <> It comes from {AUTH_EMAIL_SENDER}.</>}
        </p>
        <p className="mt-3 text-[15px] leading-normal text-stone">
          Nothing after 2 minutes? Check spam, or{" "}
          {onResend ? (
            <button
              type="button"
              onClick={resend}
              disabled={sending}
              className="inline-flex min-h-11 items-center rounded-sm font-medium text-grass underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60 sm:min-h-6"
            >
              {sending ? "sending…" : "send it again"}
            </button>
          ) : (
            resendFallback ?? "send it again"
          )}
          .
        </p>
        <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-grass">
          {sentAgain ? "Sent again. It can take a minute or two to arrive." : ""}
        </p>
        {children}
      </div>
    </AuthCard>
  );
}
