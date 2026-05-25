"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import type { Player } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { resendConfirmationEmail, signIn } from "@/lib/auth";
import { emptyPlayer } from "@/lib/data/user";
import { Button } from "@/components/ui/button";
import { FloatingDots } from "@/components/shared/floating-dots";

const inputClass =
  "h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't sign in.");
      return;
    }
    if (result.player) {
      beginSession(result.player);
      if (result.player.role === "parent") {
        router.push("/family");
        return;
      }
      router.push(result.player.onboarded ? "/dashboard" : "/onboarding");
      return;
    }
    if (result.account) {
      // Local fallback (no Supabase keys): build the player from the stored
      // account only — no sample data — and send them through onboarding.
      const graduationYear = result.account.grade
        ? new Date().getFullYear() + (12 - result.account.grade)
        : emptyPlayer.graduationYear;
      const player: Player = {
        ...emptyPlayer,
        name: result.account.name,
        gender: result.account.gender,
        grade: result.account.grade,
        graduationYear,
        country: result.account.country,
        role: result.account.role,
        familyCode: result.account.familyCode,
        onboarded: false,
      };
      beginSession(player);
      if (player.role === "parent") {
        router.push("/family");
        return;
      }
      router.push("/onboarding");
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
      setError(result.error ?? "Could not resend confirmation email.");
      return;
    }
    setNotice("Confirmation email sent. Check your inbox and spam folder.");
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <FloatingDots />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center container-px py-10">
        <p className="font-serif text-lg italic text-leaf-accent">Welcome back</p>
        <h1 className="mt-1 text-3xl font-light tracking-tight text-ink">
          Sign in to Seeded
        </h1>
        {searchParams.get("confirmed") === "1" && (
          <p className="mt-4 rounded-xl border-[0.5px] border-line bg-grass-50 px-4 py-3 text-sm text-grass">
            Email confirmed. Sign in to finish setting up your profile.
          </p>
        )}

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            className={inputClass}
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={inputClass}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <div className="rounded-xl bg-[#FBEAE5] px-4 py-3 text-sm text-[#9C3B22]">
              <p>{error}</p>
              {needsConfirmation && (
                <button
                  type="button"
                  onClick={resend}
                  disabled={resending || !email}
                  className="mt-2 font-medium text-[#6F2816] underline underline-offset-4 disabled:opacity-50"
                >
                  {resending ? "Sending..." : "Resend confirmation email"}
                </button>
              )}
            </div>
          )}
          {notice && (
            <p className="rounded-xl border-[0.5px] border-line bg-grass-50 px-4 py-2.5 text-sm text-grass">
              {notice}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Sign in
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-stone">
          New here?{" "}
          <Link href="/signup" className="font-medium text-grass hover:underline">
            Create an account
          </Link>
          <span className="mx-2 text-stone-light">or</span>
          <Link href="/parent-signup" className="font-medium text-grass hover:underline">
            parent signup
          </Link>
        </p>
      </div>
    </div>
  );
}
