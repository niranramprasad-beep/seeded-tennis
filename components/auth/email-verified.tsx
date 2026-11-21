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
  joinOutcomeFor,
  providerErrorFrom,
  hasPendingJoinCodeFor,
  readVerifyReturn,
  sessionCameFromOAuth,
  takeGoogleVerifyStart,
  verifiedActionFor,
  verifiedScreenFor,
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
// is remembered in localStorage, lib/email-verify-flow.ts). What happens is
// decided by the pure verifiedActionFor() / verifiedScreenFor() (tested):
//   google-cancelled -> Google refused or the person cancelled; the old
//                 session stands, nothing changed.
//   google-mismatch -> Google came back as a DIFFERENT account. This
//                 browser's session for it is ended (scope "local" only —
//                 it may be someone else's account, signed in elsewhere),
//                 confirmed gone, and the screen says why.
//   google-not-proven -> same account, but the database did not accept the
//                 Google identity as proof.
//   unreachable -> mark_email_verified() got no answer; never "not confirmed".

type State =
  | "working"
  | "confirmed"
  | "not-proven"
  | "rate-limited"
  | "unreachable"
  | "no-session"
  | "google-cancelled"
  | "google-mismatch"
  | "google-mismatch-still-signed-in"
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
  const { retryConnection, signOutLocal } = usePlayer();
  const [state, setState] = useState<State>("working");
  const [joinNote, setJoinNote] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<{
    account: string | null;
    google: string | null;
    lostJoinCode: boolean;
  } | null>(null);
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
      const started = takeGoogleVerifyStart();
      const providerError = providerErrorFrom(window.location.search, window.location.hash);

      // Google refused or the person cancelled: no code to exchange, and
      // the session that asked is untouched.
      const early = verifiedActionFor({ started, providerError, session: null });
      if (early.kind === "show" && early.screen === "google-cancelled") return setState("google-cancelled");

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
      const session = data.session
        ? {
            userId: data.session.user.id,
            email: data.session.user.email ?? null,
            oauth: sessionCameFromOAuth(data.session.access_token),
          }
        : null;
      const action = verifiedActionFor({ started, providerError, session });

      if (action.kind === "show") return setState(action.screen);

      if (action.kind === "sign-out-local") {
        // Not the account that asked. End THIS browser's session for it
        // only (never "global": it may be a shared family Google account),
        // through PlayerProvider, which also clears what this browser
        // remembered — including a family code the asking account left.
        const lostJoinCode = hasPendingJoinCodeFor(started?.owner);
        await signOutLocal();
        let after = await supabase.auth.getSession();
        if (after.data.session) {
          await signOutLocal();
          after = await supabase.auth.getSession();
        }
        setMismatch({ account: action.accountEmail, google: action.googleEmail, lostJoinCode });
        return setState(after.data.session ? "google-mismatch-still-signed-in" : "google-mismatch");
      }

      const screen = verifiedScreenFor(await markEmailVerified(), action.via);
      if (screen !== "confirmed") return setState(screen);

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
    })().catch(() => setState("unreachable"));
  }, [params, retryConnection, signOutLocal]);

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

  if (state === "google-mismatch" || state === "google-mismatch-still-signed-in") {
    return (
      <AuthCard
        title="That Google account has a different email"
        subtitle={
          state === "google-mismatch"
            ? VERIFY_COPY.googleMismatch(mismatch?.account ?? null, mismatch?.google ?? null, mismatch?.lostJoinCode)
            : VERIFY_COPY.googleMismatchStillSignedIn
        }
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
          : state === "unreachable"
          ? VERIFY_COPY.markUnreachable
          : state === "not-proven"
          ? "This page only works from the newest link we emailed you, within an hour of asking for it. Open that link, or ask for a new one."
          : "That link has expired or was already used, or it was opened in a different browser from the one that asked for it. Ask for a new one and open it in this browser."
      }
    >
      {state === "unreachable" && (
        // The code is already exchanged; a reload asks the database again
        // with the session this tab now holds.
        <SeededButton
          type="button"
          variant="primary"
          className="mb-3 w-full"
          onClick={() => window.location.reload()}
        >
          Try again
        </SeededButton>
      )}
      <SeededButton type="button" variant="secondary" className="w-full" onClick={goBack}>
        {destinationLabel(returnPath)}
      </SeededButton>
    </AuthCard>
  );
}
