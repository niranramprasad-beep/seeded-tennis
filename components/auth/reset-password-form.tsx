"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { hasRecoverySession, requestPasswordReset, updatePassword } from "@/lib/auth";
import { SeededButton } from "@/components/seeded/ui/button";
import {
  AuthCard,
  AuthField,
  AuthFooterLink,
  authInputClass,
  describedBy,
} from "./auth-card";
import { CheckEmailCard } from "./check-email";

// Board 21, "Reset" (docs/DESIGN_MOCKUP_SPEC_V2.md), in four states:
//   loading -> checking whether the visitor arrived from the email link
//   request -> "Reset your password", email, PRIMARY "Send reset link"
//   sent    -> the shared "Check your email" card, with a working resend
//   update  -> arrived from the link (Supabase gave them a session): set a
//              new password
//
// The board's sub-line says "It works for 1 hour". That is left out on
// purpose: the link's lifetime is a Supabase Auth project setting (email OTP
// expiry), which nothing in this repo sets or can read, so the sentence
// would be a guess presented as a fact.

/** The form's own floor, and what Supabase Auth enforces by default. The
 * project's real minimum lives in the Supabase dashboard and cannot be read
 * from here; if it is raised, Supabase refuses and friendlyAuthError says so. */
const MIN_PASSWORD_LENGTH = 6;
const ERROR_ID = "reset-error";

export function ResetPasswordForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "request" | "update" | "sent">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If the user arrived from a reset email, Supabase gives them a session.
    hasRecoverySession().then((recovery) => setMode(recovery ? "update" : "request"));
  }, []);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Enter the email you signed up with.");
      return;
    }
    setSubmitting(true);
    // Already mapped by friendlyAuthError in lib/auth.ts.
    const result = await requestPasswordReset(email);
    setSubmitting(false);
    if (!result.ok) return setError(result.error ?? "Couldn't send the email. Try again.");
    setMode("sent");
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (!result.ok) return setError(result.error ?? "Couldn't update the password. Try again.");
    router.push("/login");
  };

  const backToSignIn = (
    <p>
      <AuthFooterLink href="/login">Back to sign in</AuthFooterLink>
    </p>
  );

  if (mode === "loading") {
    // Holds the request card's height while the session check runs, so the
    // card does not jump when the real state arrives (CLS, Board 23 rule 6).
    return (
      <AuthCard title="Reset your password" busy footer={backToSignIn}>
        <div className="flex min-h-[9.5rem] items-center justify-center">
          <Loader2
            className="h-6 w-6 animate-spin text-grass motion-reduce:animate-none"
            aria-label="Loading"
          />
        </div>
      </AuthCard>
    );
  }

  if (mode === "sent") {
    return (
      <CheckEmailCard
        email={email}
        onResend={() => requestPasswordReset(email)}
        footer={backToSignIn}
      />
    );
  }

  if (mode === "update") {
    return (
      <AuthCard
        title="Choose a new password"
        subtitle="Pick one you don't use anywhere else."
        error={error}
        errorId={ERROR_ID}
      >
        <form onSubmit={savePassword} className="space-y-4" noValidate>
          <AuthField
            label="New password"
            htmlFor="reset-new-password"
            help={`${MIN_PASSWORD_LENGTH}+ characters.`}
          >
            <input
              id="reset-new-password"
              name="new-password"
              className={authInputClass}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy("reset-new-password", {
                hint: true,
                extra: [error && ERROR_ID],
              })}
            />
          </AuthField>
          <SeededButton type="submit" variant="primary" loading={submitting} className="w-full">
            {submitting ? "Saving…" : "Save new password"}
          </SeededButton>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to set a new password."
      error={error}
      errorId={ERROR_ID}
      footer={backToSignIn}
    >
      <form onSubmit={sendLink} className="space-y-4" noValidate>
        <AuthField label="Email" htmlFor="reset-email">
          <input
            id="reset-email"
            name="email"
            className={authInputClass}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy("reset-email", { extra: [error && ERROR_ID] })}
          />
        </AuthField>
        <SeededButton type="submit" variant="primary" loading={submitting} className="w-full">
          {submitting ? "Sending…" : "Send reset link"}
        </SeededButton>
      </form>
    </AuthCard>
  );
}
