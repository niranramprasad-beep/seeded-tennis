"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { markEmailVerified } from "@/lib/db/email-verification";
import { seededButtonVariants } from "@/components/seeded/ui/button";
import { AuthCard } from "./auth-card";

// Where the verification link lands (migration 043, B6).
//
// The link is a Supabase magic link (signInWithOtp, PKCE). Opening it gives
// this browser a NEW session whose JWT says it came from the email
// (amr: magiclink/otp). mark_email_verified() checks exactly that on the
// server and stamps profiles.email_verified_at. Nothing here decides whether
// the address is proven — the database does.
//
// Three outcomes:
//   confirmed  -> "Email confirmed", back to /family.
//   not proven -> the session is not from a link (e.g. someone typed the URL
//                 while signed in with a password). Calm, says what to do.
//   no session -> the link expired, was used, or was opened in a different
//                 browser from the one that asked (PKCE keeps the verifier
//                 in the asking browser).

type State = "working" | "confirmed" | "not-proven" | "no-session";

export function EmailVerified() {
  const params = useSearchParams();
  const [state, setState] = useState<State>("working");
  // React double-mounts effects in development; a code can be exchanged once.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const supabase = getSupabase();
      if (!supabase) return setState("no-session");

      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          // detectSessionInUrl may have got there first; only a missing
          // session is a real failure.
          const { data } = await supabase.auth.getSession();
          if (!data.session) return setState("no-session");
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) return setState("no-session");

      setState((await markEmailVerified()) ? "confirmed" : "not-proven");
    })().catch(() => setState("no-session"));
  }, [params]);

  if (state === "working") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-grass motion-reduce:animate-none" aria-hidden />
        <p className="text-sm text-stone" role="status">
          Confirming your email…
        </p>
      </div>
    );
  }

  if (state === "confirmed") {
    return (
      <AuthCard
        title="Email confirmed"
        subtitle="Thanks. You can now approve family members and give consent for a player under 13."
      >
        <Link href="/family" className={seededButtonVariants({ variant: "primary" }) + " w-full"}>
          Back to Family
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="We couldn't confirm your email"
      subtitle={
        state === "not-proven"
          ? "This page only works from the link in the email we sent. Open that link, or ask for a new one from Family."
          : "That link has expired or was already used, or it was opened in a different browser from the one that asked for it. Ask for a new one from Family and open it in this browser."
      }
    >
      <Link href="/family" className={seededButtonVariants({ variant: "secondary" }) + " w-full"}>
        Back to Family
      </Link>
    </AuthCard>
  );
}
