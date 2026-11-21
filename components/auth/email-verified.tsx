"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { markEmailVerified, readMyPendingJoinCode } from "@/lib/db/email-verification";
import { joinFamily } from "@/lib/db/family-join";
import { usePlayer } from "@/lib/context/player-context";
import {
  VERIFY_COPY,
  clearPendingJoinCode,
  clearVerifyReturn,
  googleReturnOutcome,
  joinOutcomeFor,
  readVerifyReturn,
  takeGoogleVerifyStart,
} from "@/lib/email-verify-flow";
import { SeededButton } from "@/components/seeded/ui/button";
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
//   confirmed  -> "Email confirmed", then back to where the person asked
//                 from (stored before the link was sent; lib/email-verify-
//                 flow.ts). A parent who was refused a family join has it
//                 finished here, with the code they already typed.
//   not proven -> the session is not from a link sent after the latest
//                 request (e.g. someone typed the URL while signed in with a
//                 password, or opened an older link). Calm, says what to do.
//   rate-limited -> mark_email_verified()'s write hit profile_write; "too
//                 many tries", never "not proven".
//   no session -> the link expired, was used, or was opened in a different
//                 browser from the one that asked (PKCE keeps the verifier
//                 in the asking browser).

//
// "Verify with Google instead" also lands here (no query string; the start
// is remembered in localStorage, lib/email-verify-flow.ts), with three more:
//   google-cancelled -> Google refused or the person cancelled; the old
//                 session stands, nothing changed.
//   google-mismatch -> Google came back as a DIFFERENT account (its email is
//                 not this account's). That session is signed out of this
//                 browser and the screen says why in plain English.
//   google-not-proven -> same account, but the database did not accept the
//                 Google identity as proof.

type State =
  | "working"
  | "confirmed"
  | "not-proven"
  | "rate-limited"
  | "no-session"
  | "google-cancelled"
  | "google-mismatch"
  | "google-not-proven";

/** How long the confirmation stays on screen before going back. Long enough
 *  to read one line; the button goes straight away. */
const BOUNCE_MS = 2500;

function destinationLabel(path: string): string {
  const bare = path.split(/[?#]/)[0];
  if (bare === "/family" || bare.startsWith("/family/")) return "Back to Family";
  if (bare === "/today") return "Back to Today";
  if (bare === "/settings" || bare.startsWith("/settings/")) return "Back to Settings";
  return "Continue";
}

export function EmailVerified() {
  const params = useSearchParams();
  const router = useRouter();
  const { retryConnection, signOut } = usePlayer();
  const [state, setState] = useState<State>("working");
  const [joinNote, setJoinNote] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<{ account: string | null; google: string | null } | null>(null);
  // Read once, after mount (localStorage), so the server render and the
  // first client render agree.
  const [returnPath, setReturnPath] = useState("/today");
  // React double-mounts effects in development; a code can be exchanged once.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    setReturnPath(readVerifyReturn());

    (async () => {
      // Read (and clear) BEFORE anything else: a Google start older than
      // the TTL, or none at all, leaves the emailed-link path untouched.
      const googleStart = takeGoogleVerifyStart();
      const providerError = Boolean(params.get("error") || params.get("error_description"));
      const early = googleReturnOutcome({
        started: googleStart,
        providerError,
        sessionUserId: null,
        sessionEmail: null,
      });
      // Google refused or the person cancelled: no code to exchange, and
      // the session that asked is untouched.
      if (early.kind === "cancelled") return setState("google-cancelled");

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

      const back = googleReturnOutcome({
        started: googleStart,
        providerError,
        sessionUserId: data.session.user.id,
        sessionEmail: data.session.user.email ?? null,
      });
      if (back.kind === "different-account") {
        // Not the account that asked. Leave nobody signed in as an account
        // they did not mean to use (it may have just been created by Google
        // sign-in, with no Seeded profile).
        // Through PlayerProvider, the one sign-out path (it also clears
        // what this browser remembered; lib/local-storage-cleanup.test.ts).
        signOut();
        setMismatch({ account: back.accountEmail, google: back.googleEmail });
        return setState("google-mismatch");
      }

      const marked = await markEmailVerified();
      if (marked === "rate-limited") return setState("rate-limited");
      if (marked !== "verified") return setState(back.kind === "same-account" ? "google-not-proven" : "not-proven");

      // A parent refused at join_family() (043) left their code behind.
      // Finish what they asked for, now that the database will accept it —
      // but only a code THIS account stored (it is bound to the user id), so
      // a code left in a shared browser is never submitted for someone else.
      // Cleared after one use, whatever the outcome.
      const pendingCode = await readMyPendingJoinCode();
      clearPendingJoinCode();
      if (pendingCode) {
        const outcome = joinOutcomeFor(await joinFamily(pendingCode));
        if (outcome.kind === "joined") {
          setJoinNote(
            outcome.status === "approved"
              ? "You’re in the family."
              : "Your request to join is in. Someone in the family approves it from their Seeded."
          );
        } else {
          setJoinNote(`${outcome.message} You can enter the code again from Family.`);
        }
      }

      // The session may have just been created in this tab (the link
      // usually opens a new one), and Player.emailVerified is now stale
      // everywhere: re-read both.
      retryConnection();
      setState("confirmed");
    })().catch(() => setState("no-session"));
  }, [params, retryConnection, signOut]);

  // Bounce back to where they came from — unless there is a join result to
  // read, which the button then carries them past.
  useEffect(() => {
    if (state !== "confirmed" || joinNote) return;
    const t = setTimeout(() => {
      clearVerifyReturn();
      router.replace(returnPath);
    }, BOUNCE_MS);
    return () => clearTimeout(t);
  }, [state, joinNote, returnPath, router]);

  const goBack = () => {
    clearVerifyReturn();
    router.replace(returnPath);
  };

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
        subtitle={joinNote ?? "Thanks. Taking you back now."}
      >
        <SeededButton type="button" variant="primary" className="w-full" onClick={goBack}>
          {destinationLabel(returnPath)}
        </SeededButton>
      </AuthCard>
    );
  }

  if (state === "google-mismatch") {
    return (
      <AuthCard
        title="That Google account has a different email"
        subtitle={VERIFY_COPY.googleMismatch(mismatch?.account ?? null, mismatch?.google ?? null)}
      >
        <SeededButton
          type="button"
          variant="primary"
          className="w-full"
          onClick={() => router.replace(`/login?next=${encodeURIComponent(returnPath)}`)}
        >
          Sign in again
        </SeededButton>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="We couldn't confirm your email"
      subtitle={
        state === "google-cancelled"
          ? VERIFY_COPY.googleCancelled
          : state === "google-not-proven"
          ? VERIFY_COPY.googleNotProven
          : state === "rate-limited"
          ? VERIFY_COPY.markRateLimited
          : state === "not-proven"
          ? "This page only works from the newest link we emailed you, within an hour of asking for it. Open that link, or ask for a new one."
          : "That link has expired or was already used, or it was opened in a different browser from the one that asked for it. Ask for a new one and open it in this browser."
      }
    >
      <SeededButton type="button" variant="secondary" className="w-full" onClick={goBack}>
        {destinationLabel(returnPath)}
      </SeededButton>
    </AuthCard>
  );
}
