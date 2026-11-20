"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { SchoolLite } from "@/lib/types";
import { signedInDiagnosticStart, type DiagnosticAnswers } from "@/lib/onboarding/diagnostic";
import { usePlayer } from "@/lib/context/player-context";
import { loadMyBirthYear } from "@/lib/db/account";
import { SETTINGS_FROM_ONBOARDING_HREF } from "@/lib/settings-sections";
import { AuthGate } from "@/components/shared/auth-gate";
import { SeededDiagnosticOnboarding } from "@/components/seeded/onboarding/diagnostic/diagnostic-flow";

// /onboarding, for every visitor (PR D, D2).
//
//   signed out (and before the session check lands)
//                 the public diagnostic (board 20): ten questions (049 added the last), a result,
//                 a fit report and an inline sign-up that keeps every answer.
//                 Rendered BEFORE the session check too: the server has no
//                 session, and a crawler that does not run JavaScript must
//                 see the first question, not a spinner (sitemap 0.9).
//   signed in, already onboarded (every parent; any finished player)
//                 → /settings/profile, which says "Update your profile here".
//                 The questions set a profile up once; Settings changes it.
//   signed in, not onboarded (a new Google sign-up, typically)
//                 the SAME diagnostic in signed-in mode: the account's own
//                 answers (team, class year, birth year) are filled in, and
//                 the result saves to their own profile through the normal
//                 write helpers instead of creating an account.
//
// The legacy four-step flow (UTR slider with "Developing"/"College-ready"
// labels, grade chips, school picker, focus areas) is deleted, not hidden —
// lib/onboarding-legacy-removed.test.ts fails the build if it returns.
export function OnboardingPageSwitch({
  schools,
  initialAnswers,
  prefilled,
}: {
  schools: SchoolLite[];
  initialAnswers?: DiagnosticAnswers;
  prefilled?: number[];
}) {
  const { isAuthed, hydrated, player } = usePlayer();
  const router = useRouter();

  // Decided ONCE, from the session as the page found it. Both saves on this
  // page start a session that is already onboarded and then navigate on
  // their own (sign-up → /today, signed-in save → /today); re-deciding on
  // every render would see "signed in and onboarded" a moment before that
  // navigation and race it to /settings/profile.
  const [arrival, setArrival] = useState<"signed-out" | "onboarded" | "needs-onboarding" | null>(null);
  useEffect(() => {
    if (!hydrated || arrival !== null) return;
    setArrival(!isAuthed ? "signed-out" : player.onboarded || player.role === "parent" ? "onboarded" : "needs-onboarding");
  }, [hydrated, isAuthed, player.onboarded, player.role, arrival]);

  useEffect(() => {
    if (arrival === "onboarded") router.replace(SETTINGS_FROM_ONBOARDING_HREF);
  }, [arrival, router]);

  if (arrival === null || arrival === "signed-out") {
    return <SeededDiagnosticOnboarding schools={schools} initialAnswers={initialAnswers} prefilled={prefilled} />;
  }
  if (arrival === "onboarded") return <Waiting />;

  // AuthGate still decides the rest: an under-13 account waiting for a
  // parent's consent gets ConsentPendingScreen (it could save nothing).
  return (
    <AuthGate>
      <SignedInDiagnostic schools={schools} initialAnswers={initialAnswers} prefilled={prefilled} />
    </AuthGate>
  );
}

function SignedInDiagnostic({
  schools,
  initialAnswers,
  prefilled,
}: {
  schools: SchoolLite[];
  initialAnswers?: DiagnosticAnswers;
  prefilled?: number[];
}) {
  const { player } = usePlayer();
  // undefined = still loading; null = no birth year on file.
  const { data: birthYear } = useSWR<number | null>("my-birth-year", () => loadMyBirthYear(), {
    revalidateOnFocus: false,
  });

  const start = useMemo(
    () =>
      birthYear === undefined
        ? null
        : signedInDiagnosticStart(player, birthYear, initialAnswers ? { answers: initialAnswers, prefilled: prefilled ?? [] } : undefined),
    // The account's answers are read once, when the birth year lands; the
    // diagnostic owns the answers after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seeded once when the birth year lands; the diagnostic owns answers after
    [birthYear]
  );

  if (!start) return <Waiting />;
  return (
    <SeededDiagnosticOnboarding
      schools={schools}
      initialAnswers={start.answers}
      prefilled={start.prefilled}
      signedIn
    />
  );
}

function Waiting() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-grass motion-reduce:animate-none" />
    </div>
  );
}
