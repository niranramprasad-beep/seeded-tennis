"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePlayer } from "@/lib/context/player-context";
import { AUTH_ERROR_MESSAGES, resendConfirmationEmail, signIn } from "@/lib/auth";
import { safeLoginNext } from "@/lib/config/auth";
import { SeededButton } from "@/components/seeded/ui/button";
import {
  AuthCard,
  AuthField,
  AuthFooterLink,
  AuthNotice,
  authInputClass,
  authLinkClass,
  describedBy,
} from "./auth-card";
import { oauthErrorMessage } from "./oauth-errors";

// Board 21, "Sign in" (docs/DESIGN_MOCKUP_SPEC_V2.md): "Welcome back", a
// SECONDARY "Continue with Google" (flag-gated), "or with email", the error
// banner, Email, Password with "Forgot it?" in its label row, PRIMARY
// "Sign in", then "New here? Create a free account".

const ERROR_ID = "login-error";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { beginSession, isAuthed, hydrated, player } = usePlayer();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The OAuth callback redirects here with an error CODE; only a sentence we
  // wrote is ever rendered for it (components/auth/oauth-errors.ts).
  const authError = oauthErrorMessage(searchParams.get("authError"));
  const next = safeLoginNext(searchParams.get("next"));

  // Already signed in: /login has nothing to offer, so go where signing in
  // would have gone. It used to show the sign-in form to a signed-in user.
  useEffect(() => {
    if (!hydrated || !isAuthed) return;
    if (next) router.replace(next);
    else if (player.role === "parent") router.replace("/family");
    else router.replace(player.onboarded ? "/today" : "/onboarding");
  }, [hydrated, isAuthed, next, player.role, player.onboarded, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    // Checked here rather than with `required`, so the message is ours and
    // lands in the same banner as every other one.
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (!result.ok) {
      // Already mapped by friendlyAuthError in lib/auth.ts.
      setError(result.error ?? AUTH_ERROR_MESSAGES.unknown);
      return;
    }
    if (result.player) {
      beginSession(result.player);
      if (next) return router.replace(next);
      if (result.player.role === "parent") return router.replace("/family");
      router.replace(result.player.onboarded ? "/today" : "/onboarding");
      return;
    }
    setError("Signed in, but Seeded could not load your profile. Try refreshing once.");
  };

  const needsConfirmation = error === AUTH_ERROR_MESSAGES.emailNotConfirmed;

  const resend = async () => {
    setError(null);
    setNotice(null);
    setResending(true);
    const result = await resendConfirmationEmail(email);
    setResending(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't send the confirmation email. Try again.");
      return;
    }
    setNotice("Confirmation email sent. Check your inbox and spam folder.");
  };

  const shownError = error ?? authError;

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to see your fit report and this week's plan."
      error={shownError}
      errorId={ERROR_ID}
      google={{ next: next ?? undefined }}
      notice={
        <>
          {searchParams.get("confirmed") === "1" && !shownError && (
            <AuthNotice>Email confirmed. Sign in to finish setting up your profile.</AuthNotice>
          )}
          {notice && <AuthNotice>{notice}</AuthNotice>}
        </>
      }
      // One sign-in for everyone. /parent-login redirects here: what a
      // parent sees is decided by `profiles.role` after sign-in, not by
      // which page they signed in from. Parent SIGNUP is still a choice on
      // /signup, because that genuinely creates a different kind of account.
      footer={
        <p>
          New here? <AuthFooterLink href="/signup">Create a free account</AuthFooterLink>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthField label="Email" htmlFor="login-email">
          <input
            id="login-email"
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
            aria-describedby={describedBy("login-email", { extra: [error && ERROR_ID] })}
          />
        </AuthField>

        <AuthField
          label="Password"
          htmlFor="login-password"
          labelAction={
            <Link href="/reset-password" className={`${authLinkClass} text-sm`}>
              Forgot it?
            </Link>
          }
        >
          <input
            id="login-password"
            name="password"
            className={authInputClass}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy("login-password", { extra: [error && ERROR_ID] })}
          />
        </AuthField>

        {needsConfirmation && (
          <SeededButton
            type="button"
            variant="ghost"
            onClick={resend}
            loading={resending}
            disabled={!email}
            className="w-full"
          >
            {resending ? "Sending…" : "Resend confirmation email"}
          </SeededButton>
        )}

        <SeededButton type="submit" variant="primary" loading={submitting} className="w-full">
          {submitting ? "Signing in…" : "Sign in"}
        </SeededButton>
      </form>
    </AuthCard>
  );
}
