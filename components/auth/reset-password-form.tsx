"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, KeyRound, Loader2 } from "lucide-react";
import {
  hasRecoverySession,
  requestPasswordReset,
  updatePassword,
} from "@/lib/auth";
import { useDesign } from "@/lib/context/design-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const inputClass =
  "h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";

export function ResetPasswordForm() {
  const router = useRouter();
  const { design } = useDesign();
  const isSeeded = design === "seeded";
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
    setSubmitting(true);
    const result = await requestPasswordReset(email);
    setSubmitting(false);
    if (!result.ok) return setError(result.error ?? "Couldn't send the email.");
    setMode("sent");
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Use at least 6 characters.");
    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (!result.ok) return setError(result.error ?? "Couldn't update the password.");
    router.push("/login");
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center container-px py-10">
        <div className={cn(isSeeded && "seeded-glass rounded-card border-0 p-8 shadow-seeded-2")}>
        <span
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full border-hairline border-gold/30 bg-gold/10 text-gold",
            isSeeded && "border-0"
          )}
          style={isSeeded ? { background: "var(--s-accent-gradient)", color: "white" } : undefined}
        >
          <KeyRound className="h-5 w-5" />
        </span>

        {mode === "loading" && (
          <Loader2 className="mt-8 h-6 w-6 animate-spin text-grass" />
        )}

        {mode === "sent" && (
          <>
            <span className="mt-6 flex h-10 w-10 items-center justify-center rounded-full bg-grass text-on-primary">
              <Check className="h-5 w-5" />
            </span>
            <h1 className={cn("mt-4 text-3xl text-ink", isSeeded ? "font-seeded font-semibold tracking-tight" : "display-serif")}>Check your inbox.</h1>
            <p className="mt-3 text-pretty leading-relaxed text-stone">
              We sent a reset link to {email}. Open it to choose a new password.
            </p>
            <Link href="/login" className="mt-6 text-sm font-medium text-grass hover:underline">
              Back to sign in
            </Link>
          </>
        )}

        {mode === "request" && (
          <>
            <p className={cn("eyebrow mt-6 text-gold", isSeeded && "font-seeded uppercase tracking-[0.2em]")}>Reset password</p>
            <h1 className={cn("mt-3 text-4xl text-ink", isSeeded ? "font-seeded font-semibold tracking-tight" : "display-serif")}>
              Forgot your password?
            </h1>
            <p className="mt-3 text-pretty leading-relaxed text-stone">
              Enter your email and we&rsquo;ll send a secure reset link.
            </p>
            <form onSubmit={sendLink} className="mt-7 space-y-3">
              <input
                className={inputClass}
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && (
                <p className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">{error}</p>
              )}
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send reset link<ArrowRight className="h-4 w-4" /></>}
              </Button>
            </form>
            <Link href="/login" className="mt-6 text-center text-sm font-medium text-grass hover:underline">
              Back to sign in
            </Link>
          </>
        )}

        {mode === "update" && (
          <>
            <p className={cn("eyebrow mt-6 text-gold", isSeeded && "font-seeded uppercase tracking-[0.2em]")}>Almost there</p>
            <h1 className={cn("mt-3 text-4xl text-ink", isSeeded ? "font-seeded font-semibold tracking-tight" : "display-serif")}>
              Choose a new password.
            </h1>
            <form onSubmit={savePassword} className="mt-7 space-y-3">
              <input
                className={inputClass}
                type="password"
                placeholder="New password (6+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && (
                <p className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">{error}</p>
              )}
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Update password<ArrowRight className="h-4 w-4" /></>}
              </Button>
            </form>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
