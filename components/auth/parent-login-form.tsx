"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2, Users } from "lucide-react";
import type { Player } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { signIn } from "@/lib/auth";
import { emptyPlayer } from "@/lib/data/user";
import { Button } from "@/components/ui/button";
import { FloatingDots } from "@/components/shared/floating-dots";

const inputClass =
  "h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";

export function ParentLoginForm() {
  const router = useRouter();
  const { beginSession } = usePlayer();
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

    let player: Player | undefined = result.player;
    if (!player && result.account) {
      player = {
        ...emptyPlayer,
        name: result.account.name,
        gender: result.account.gender,
        grade: result.account.grade,
        country: result.account.country,
        role: result.account.role,
        familyCode: result.account.familyCode,
        onboarded: true,
      };
    }
    if (!player) {
      setError("Signed in, but couldn't load your account. Try again.");
      return;
    }
    beginSession(player);
    router.push(player.role === "parent" ? "/parent-dashboard" : "/dashboard");
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <FloatingDots />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center container-px py-10">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-hairline border-gold/30 bg-gold/10 text-gold">
          <Users className="h-5 w-5" />
        </span>
        <p className="eyebrow mt-6 text-gold">For parents</p>
        <h1 className="display-serif mt-3 text-4xl text-ink">
          Sign in to follow along.
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-stone">
          Use the email and password you registered with your player&rsquo;s
          family code.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-3">
          <input
            className={inputClass}
            type="email"
            placeholder="Parent email address"
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
            <p className="rounded-xl bg-[#FBEAE5] px-4 py-3 text-sm text-[#9C3B22]">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="group w-full"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Open family dashboard
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </Button>
        </form>

        <div className="mt-7 space-y-2 border-t-hairline border-line pt-6 text-center text-sm">
          <p className="text-stone">
            New parent?{" "}
            <Link href="/parent-signup" className="font-medium text-grass hover:underline">
              Join your family
            </Link>
          </p>
          <p className="text-stone-light">
            You&rsquo;re the player?{" "}
            <Link href="/login" className="font-medium text-grass hover:underline">
              Player sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
