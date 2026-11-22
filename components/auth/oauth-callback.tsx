"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { getCurrentPlayer } from "@/lib/auth";
import { usePlayer } from "@/lib/context/player-context";
import { OAUTH_COMPLETE_PATH, safeRedirectPath } from "@/lib/config/auth";
import type { OAuthErrorCode } from "./oauth-errors";
import { landAfterOAuth } from "./oauth-landing";

// Where Google sends the browser back to. The only place in the app that
// exchanges an OAuth code, and the only place that decides where a user goes
// after one.
//
// Three outcomes, and the middle one is the one that matters:
//
//   Google returned an error  -> /login with an error CODE that /login turns
//                                into a sentence it owns. Never a
//                                blank page, and never the raw provider
//                                string, which says things like
//                                "invalid_grant" at a 15-year-old.
//   No Seeded profile yet     -> /auth/complete. Google gives us an email and
//                                a name and nothing else — no birth year, no
//                                role, no family. An account with no birth
//                                year has not passed the under-13 check
//                                (P0-8), so it is NOT a finished signup and
//                                does not get to skip the rest.
//   Profile exists            -> straight in, honouring ?next= if it is safe.
//
// It renders a spinner and nothing else. On the error path it redirects
// rather than rendering the error here, so there is one place that shows
// sign-in problems.

export function OAuthCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const { beginSession } = usePlayer();
  const [stuck, setStuck] = useState(false);
  // React double-mounts effects in development; exchanging a code twice
  // fails the second time, and the failure would look like a real error.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // A code, never a sentence: /login renders only text it owns
    // (components/auth/oauth-errors.ts).
    const fail = (code: OAuthErrorCode) => router.replace(`/login?authError=${code}`);

    (async () => {
      // Google reports a refusal in the query string, not as a failed
      // exchange: the user cancelled, or the app is not configured.
      const providerError = params.get("error_description") ?? params.get("error");
      if (providerError) {
        return fail(params.get("error") === "access_denied" ? "cancelled" : "google_failed");
      }

      const supabase = getSupabase();
      if (!supabase) return fail("unavailable");

      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        // A session that already exists means `detectSessionInUrl` got there
        // first — the exchange "failing" is then the expected outcome, not a
        // problem, so check before reporting one.
        if (error) {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            return fail("link_expired");
          }
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        return fail("incomplete");
      }

      // A returning user is handed to PlayerProvider BEFORE navigating, so
      // the signed-in header and sidebar show without a refresh
      // (./oauth-landing.ts says why this was not guaranteed before).
      const target = await landAfterOAuth(
        { loadPlayer: getCurrentPlayer, beginSession },
        safeRedirectPath(params.get("next")),
        OAUTH_COMPLETE_PATH
      );
      router.replace(target);
    })().catch(() => fail("unknown"));
  }, [params, router, beginSession]);

  // If a redirect somehow does not happen, say so rather than spinning
  // forever at someone who has just handed over their Google account.
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), 12000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-grass motion-reduce:animate-none" aria-hidden />
      <p className="text-sm text-stone" role="status">
        {stuck ? "Still working…" : "Signing you in…"}
      </p>
      {stuck && (
        <a
          href="/login"
          className="inline-flex min-h-11 items-center text-sm font-medium text-grass underline underline-offset-2 sm:min-h-6"
        >
          Go to sign in
        </a>
      )}
    </div>
  );
}
