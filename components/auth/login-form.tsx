"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import type { Player } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { signIn } from "@/lib/auth";
import { sampledPlayer } from "@/lib/data/user";
import { Button } from "@/components/ui/button";
import { FloatingDots } from "@/components/shared/floating-dots";

const inputClass =
  "h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { beginSession, signInAsSample } = usePlayer();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't sign in.");
      return;
    }
    if (result.player) {
      beginSession(result.player);
    } else if (result.account) {
      // Local fallback: rehydrate the player from the stored account, keeping
      // the sample tennis profile so the dashboard is populated for the demo.
      const player: Player = {
        ...sampledPlayer,
        name: result.account.name,
        gender: result.account.gender,
        grade: result.account.grade,
        country: result.account.country,
        role: result.account.role,
        familyCode: result.account.familyCode,
        onboarded: true,
      };
      beginSession(player);
    } else {
      signInAsSample();
    }
    router.push("/dashboard");
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
            <p className="rounded-xl bg-[#FBEAE5] px-4 py-2.5 text-sm text-[#9C3B22]">
              {error}
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
        </p>

        <div className="mt-6 border-t-[0.5px] border-line pt-6 text-center">
          <button
            onClick={() => {
              signInAsSample();
              router.push("/dashboard");
            }}
            className="text-sm text-stone-light transition-colors hover:text-ink"
          >
            Explore the demo as Alex Chen →
          </button>
        </div>
      </div>
    </div>
  );
}
