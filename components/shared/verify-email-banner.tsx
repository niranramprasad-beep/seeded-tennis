"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { sendVerificationLink } from "@/lib/db/email-verification";
import {
  VERIFY_COPY,
  dismissVerifyBanner,
  isVerifyBannerDismissed,
  rememberVerifyReturn,
  sendFailureMessage,
  shouldShowVerifyBanner,
} from "@/lib/email-verify-flow";
import { SeededButton } from "@/components/seeded/ui/button";
import { GoogleVerifyButton } from "@/components/auth/auth-card";
import { GOOGLE_AUTH_ENABLED } from "@/lib/config/auth";

// B6 (migration 043): "Confirm your email so you can approve family requests
// and give consent." For a signed-in PARENT whose email is not confirmed —
// the one role the database gates. Players never see it, and it never blocks
// anything.
//
// Layout: a FIXED bar, so appearing after load moves nothing on the page
// (CLS counts in-flow shifts; a fixed element is out of flow). It is drawn
// only after mount, because whether it was dismissed lives in localStorage,
// which the server render cannot see. On phones it sits above the bottom
// tab bar; on desktop it is a small card at the bottom right.

export function VerifyEmailBanner() {
  const { player, isAuthed, hydrated } = usePlayer();
  const pathname = usePathname() ?? "/";
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDismissed(isVerifyBannerDismissed());
    setMounted(true);
  }, []);

  const visible =
    mounted &&
    shouldShowVerifyBanner({
      hydrated,
      isAuthed,
      role: player.role,
      emailVerified: player.emailVerified,
      pathname,
      dismissed,
    });
  if (!visible) return null;

  const send = async () => {
    setPhase("sending");
    setError(null);
    rememberVerifyReturn(pathname);
    const result = await sendVerificationLink();
    if (result.ok) {
      setSentTo(result.email ?? null);
      setPhase("sent");
    } else {
      setError(sendFailureMessage(result.error, GOOGLE_AUTH_ENABLED));
      setPhase(sentTo ? "sent" : "idle");
    }
  };

  const dismiss = () => {
    dismissVerifyBanner();
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Confirm your email"
      data-testid="verify-email-banner"
      className="fixed inset-x-3 z-30 rounded-xl border border-line bg-card p-3 shadow-card bottom-[calc(max(18px,env(safe-area-inset-bottom))+68px)] lg:bottom-5 lg:left-auto lg:right-5 lg:w-[380px]"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">
            {phase === "sent" && sentTo ? VERIFY_COPY.sent(sentTo) : VERIFY_COPY.bannerText}
          </p>
          {error && (
            <p className="mt-1.5 text-sm text-error" role="alert">
              {error}
            </p>
          )}
          {phase !== "sent" && (
            <SeededButton
              type="button"
              variant="secondary"
              className="mt-2 min-h-11 px-3 text-sm sm:min-h-[36px]"
              loading={phase === "sending"}
              onClick={send}
            >
              {phase === "sending" ? VERIFY_COPY.sending : VERIFY_COPY.send}
            </SeededButton>
          )}
          <GoogleVerifyButton
            className="mt-2"
            hint={VERIFY_COPY.googleHint}
            onBeforeStart={() => rememberVerifyReturn(pathname)}
          />
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-m-1.5 inline-flex h-11 w-11 shrink-0 sm:-m-1 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-stone hover:bg-subtle-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
