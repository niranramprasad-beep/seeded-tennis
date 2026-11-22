"use client";

import Link from "next/link";
import { usePlayer } from "@/lib/context/player-context";

// The sample report's header CTA. A signed-in visitor already has an account
// (22 Nov consult: the header offered them a sign-up), so they get a way
// back to their own screen instead. Before the session check resolves it
// renders the signed-out CTA, same as the server HTML — no layout shift:
// both are one 44px link with the same minimum width, so the swap never
// moves the header around it.
export function SampleReportCta() {
  const { isAuthed, hydrated, player } = usePlayer();
  if (hydrated && isAuthed) {
    const href = player.role === "parent" ? "/family" : "/today";
    return (
      <Link
        href={href}
        className="inline-flex min-h-11 min-w-[212px] items-center justify-center rounded-lg border border-line bg-card px-[18px] font-sans text-[15px] font-semibold text-ink hover:bg-subtle-hover"
      >
        {player.role === "parent" ? "Back to Family" : "Back to Today"}
      </Link>
    );
  }
  return (
    <Link
      href="/onboarding"
      className="inline-flex min-h-11 min-w-[212px] items-center justify-center rounded-lg bg-grass px-[18px] font-sans text-[15px] font-semibold text-on-primary hover:bg-grass-600"
    >
      Get my free fit report
    </Link>
  );
}
