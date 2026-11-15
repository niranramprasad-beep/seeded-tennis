"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { resendConfirmationEmail, signIn } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/config/auth";
import { Button } from "@/components/ui/button";
import { AuthCard, AuthField, AuthFooterLink, authInputClass } from "./auth-card";

// Rebuilt on the shared AuthCard (docs/DESIGN_MOCKUP_SPEC.md): centred
// ~420px card, H2 + subline, "Continue with Google" FIRST, then an "or"
// divider, then email and password. The previous version was a full-height
// glass panel with its own input sizing and its own error treatment — three
// things /signup did differently, which is how they drifted apart.

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { beginSession } = usePlayer();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The OAuth callback redirects here with a readable message rather than
  // rendering its own error page, so sign-in problems have one home.
  const authError = searchParams.get("authError");
  const next = safeRedirectPath(searchParams.get("next"));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't sign in. Check your details and try again.");
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

  const needsConfirmation = error?.toLowerCase().includes("confirm your email");

  const resend = async () => {
    setError(null);
    setNotice(null);
    setResending(true);
    const result = await resendConfirmationEmail(email);
    setResending(false);
    if (!result.ok) {
      setError(result.error ?? "Could not resend confirmation email. Try again.");
      return;
    }
    setNotice("Confirmation email sent. Check your inbox and spam folder.");
  };

  return (
    <AuthCard
      title="Sign in to Seeded"
      subtitle="Pick up where you left off."
      error={authError ?? error}
      google={{ next: next ?? undefined }}
      // One sign-in for everyone. There used to be a second "Parent sign
      // in" link to /parent-login, which asked a visitor to classify
      // themselves before authenticating — and got it wrong often enough to
      // matter, since the only thing that actually decides what you see is
      // `profiles.role`, resolved after sign-in either way. The two forms
      // posted the same credentials to the same endpoint. Parent SIGNUP is
      // still its own choice on /signup, because that genuinely creates a
      // different kind of account.
      footer={
        <p>
          New here? <AuthFooterLink href="/signup">Create an account</AuthFooterLink>
        </p>
      }
    >
      {searchParams.get("confirmed") === "1" && (
        <p className="mb-4 rounded-lg border border-grass/30 bg-grass-50 px-4 py-3 text-sm text-grass">
          Email confirmed. Sign in to finish setting up your profile.
        </p>
      )}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthField label="Email" htmlFor="login-email">
          <input
            id="login-email"
            className={authInputClass}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </AuthField>

        <AuthField label="Password" htmlFor="login-password">
          <input
            id="login-password"
            className={authInputClass}
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </AuthField>

        {needsConfirmation && (
          <button
            type="button"
            onClick={resend}
            disabled={resending || !email}
            className="text-sm font-medium text-error underline underline-offset-4 disabled:opacity-50"
          >
            {resending ? "Sending…" : "Resend confirmation email"}
          </button>
        )}

        {notice && (
          <p className="rounded-lg border border-grass/30 bg-grass-50 px-4 py-2.5 text-sm text-grass">
            {notice}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
        </Button>

        <div className="text-center">
          <AuthFooterLink href="/reset-password">Forgot password?</AuthFooterLink>
        </div>
      </form>
    </AuthCard>
  );
}
