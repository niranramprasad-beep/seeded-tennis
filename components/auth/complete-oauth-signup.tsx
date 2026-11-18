"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { FamilyRole, PlayerGender } from "@/lib/types";
import { completeOAuthProfile, hasSeededProfile } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/config/auth";
import {
  birthYearOptions,
  isPlausibleBirthYear,
  parentConsentRequired,
} from "@/lib/config/consent";
import { AuthCard, AuthField, authInputClass, describedBy } from "./auth-card";
import { VerifyEmailToJoin } from "./verify-email-prompt";
import { VERIFY_COPY, rememberPendingJoinCode } from "@/lib/email-verify-flow";
import { ChipRadioGroup } from "./chip-radio-group";
import { SeededButton } from "@/components/seeded/ui/button";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/lib/context/player-context";
import {
  clearPendingAnswers,
  readPendingAnswers,
  signupGradeFor,
  type DiagnosticAnswers,
} from "@/lib/onboarding/diagnostic";
import { saveDiagnosticToAccount } from "@/lib/onboarding/save-diagnostic";

// The second half of a Google signup.
//
// Google hands over an authenticated user, an email and usually a name. It
// does not hand over a birth year, a role, or a family — and the birth year
// is what decides whether the account is allowed to be active at all
// (P0-8, migration 030). So a Google user with no profile row is not a
// finished signup, and this is where they finish.
//
// **There is no bypass here, and that is the point.** It calls
// completeOAuthProfile, which calls the same ensureSupabaseProfile the email
// path calls, with the same arguments: the consent trigger derives
// consent_status from the birth year, join_family() handles the family link,
// and 022 blocks the privileged columns. Identical code, identical rules.

const COUNTRIES = ["United States", "Canada", "United Kingdom", "Other"];
const ERROR_ID = "oauth-complete-error";

export function CompleteOAuthSignup() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeRedirectPath(params.get("next"));

  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [role, setRole] = useState<FamilyRole>("player");
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [country, setCountry] = useState("United States");
  const [gender, setGender] = useState<PlayerGender>("female");
  const [grade, setGrade] = useState(10);
  const [familyMode, setFamilyMode] = useState<"create" | "join">("create");
  const [joinCode, setJoinCode] = useState("");
  const [verifyJoinCode, setVerifyJoinCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<DiagnosticAnswers | null>(null);
  const { beginSession } = usePlayer();

  // Prefill the name Google gave us, and bounce anyone who does not belong
  // here: no session → /login, profile already there → straight in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      if (!supabase) return router.replace("/login");
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) return router.replace("/login");
      if (await hasSeededProfile()) return router.replace(next ?? "/today");
      const meta = data.user.user_metadata as { full_name?: string; name?: string } | null;
      if (!cancelled) {
        setName((meta?.full_name ?? meta?.name ?? "").toString());
        // Arrived from the /onboarding diagnostic: everything they already
        // answered is filled in, so nothing is asked twice. A parent's
        // answers were about their player, so only the role carries over —
        // never the player's birth year onto the parent's own account.
        const carried = readPendingAnswers();
        if (carried) {
          setPending(carried);
          setRole(carried.role ?? "player");
          if (carried.role === "player") {
            if (carried.birthYear != null) setBirthYear(carried.birthYear);
            if (carried.gender) setGender(carried.gender);
            if (carried.gradYear != null) setGrade(signupGradeFor(carried.gradYear));
          }
        }
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  const isParent = role === "parent";
  // Same rule as the email signup: an under-13 player cannot start their own
  // family, because nobody in a family of one can give parental consent.
  const needsParentConsent = !isParent && parentConsentRequired(birthYear);
  const effectiveFamilyMode: "create" | "join" = needsParentConsent ? "join" : familyMode;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter your name.");
    if (!isPlausibleBirthYear(birthYear)) return setError("Choose the year you were born.");
    if (effectiveFamilyMode === "join" && !joinCode.trim()) {
      return setError(
        needsParentConsent
          ? "Enter your parent or guardian's family code. They need a Seeded account first."
          : "Enter a family code to join."
      );
    }

    setSubmitting(true);
    const result = await completeOAuthProfile({
      name: name.trim(),
      country,
      gender,
      grade,
      birthYear,
      role,
      family:
        effectiveFamilyMode === "join" ? { mode: "join", code: joinCode } : { mode: "create" },
    });
    // Hand-written in lib/auth.ts (ensureSupabaseProfile), never raw.
    if (!result.ok) {
      setSubmitting(false);
      return setError(result.error ?? "Something went wrong. Try again.");
    }

    // 043. A Google identity whose verified email is the account's counts as
    // confirmed, so this is rare — but if join_family() still asks, it is a
    // step, not a failure: the profile exists, and the code is kept.
    if (effectiveFamilyMode === "join" && result.joinStatus === "verify_email_required") {
      setSubmitting(false);
      rememberPendingJoinCode(joinCode);
      return setVerifyJoinCode(joinCode.trim().toUpperCase());
    }

    // The diagnostic's answers, written to the account just created — only
    // for a player who is still a player here and is not waiting on a
    // parent's consent (an under-13 account can write nothing until then).
    const carried = pending;
    clearPendingAnswers();
    if (carried && carried.role === "player" && !isParent && !needsParentConsent) {
      const saved = await saveDiagnosticToAccount({
        ...carried,
        birthYear,
        gender,
      });
      setSubmitting(false);
      if (saved.player) beginSession(saved.player);
      if (!saved.ok) return setError(saved.error);
      return router.replace(next ?? "/today");
    }
    setSubmitting(false);
    router.replace(next ?? (isParent ? "/family" : "/onboarding"));
  };

  if (verifyJoinCode) {
    return (
      <AuthCard title={VERIFY_COPY.joinTitle("your family")}>
        <VerifyEmailToJoin
          bare
          code={verifyJoinCode}
          onJoined={() => router.replace("/family")}
        />
      </AuthCard>
    );
  }

  if (checking) {
    return (
      <AuthCard title="Finish setting up" busy>
        <div className="flex min-h-[12rem] items-center justify-center">
          <Loader2
            className="h-6 w-6 animate-spin text-grass motion-reduce:animate-none"
            aria-label="Loading"
          />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Finish setting up"
      subtitle={
        pending?.role === "player"
          ? "We kept your answers from the questions. Check them, then finish."
          : "Google told us who you are. Seeded needs a little more before your account works."
      }
      error={error}
      errorId={ERROR_ID}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthField label="Full name" htmlFor="oauth-name">
          <input
            id="oauth-name"
            name="name"
            className={authInputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            aria-describedby={describedBy("oauth-name", { extra: [error && ERROR_ID] })}
          />
        </AuthField>

        <ChipRadioGroup<FamilyRole>
          label="I'm the"
          name="oauth-role"
          options={[
            { value: "player", label: "Player" },
            { value: "parent", label: "Parent" },
          ]}
          value={role}
          onChange={setRole}
        />

        <AuthField
          label="Year you were born"
          htmlFor="oauth-birth-year"
          help={
            needsParentConsent
              ? "Under 13, so a parent or guardian has to set Seeded up and say yes before your account works. You'll need their family code below."
              : "Under 13? A parent creates the account and invites you."
          }
        >
          <select
            id="oauth-birth-year"
            name="birth-year"
            className={authInputClass}
            value={birthYear ?? ""}
            onChange={(e) => setBirthYear(e.target.value ? Number(e.target.value) : null)}
            aria-describedby={describedBy("oauth-birth-year", {
              hint: true,
              extra: [error && ERROR_ID],
            })}
          >
            <option value="">Select a year</option>
            {birthYearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </AuthField>

        {!isParent && (
          <>
            <AuthField label="Country" htmlFor="oauth-country">
              <select
                id="oauth-country"
                name="country"
                className={authInputClass}
                autoComplete="country-name"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </AuthField>

            <ChipRadioGroup<PlayerGender>
              label="Team"
              name="oauth-gender"
              options={[
                { value: "female", label: "Women's" },
                { value: "male", label: "Men's" },
              ]}
              value={gender}
              onChange={setGender}
            />

            <ChipRadioGroup<number>
              label="Grade in school"
              name="oauth-grade"
              columns={5}
              options={[8, 9, 10, 11, 12].map((g) => ({ value: g, label: `${g}th` }))}
              value={grade}
              onChange={setGrade}
            />
          </>
        )}

        {!needsParentConsent && (
          <ChipRadioGroup<"create" | "join">
            label="Family"
            name="oauth-family"
            options={[
              { value: "create", label: "Start a family" },
              { value: "join", label: "Join with a code" },
            ]}
            value={familyMode}
            onChange={setFamilyMode}
          />
        )}
        {effectiveFamilyMode === "join" && (
          <AuthField
            label={needsParentConsent ? "Your parent's family code" : "Family code"}
            htmlFor="oauth-family-code"
          >
            <input
              id="oauth-family-code"
              name="family-code"
              className={cn(authInputClass, "font-mono uppercase tracking-wider")}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              aria-describedby={describedBy("oauth-family-code", { extra: [error && ERROR_ID] })}
            />
          </AuthField>
        )}

        <SeededButton type="submit" variant="primary" loading={submitting} className="w-full">
          {submitting ? "Saving…" : "Finish setting up"}
        </SeededButton>
        <p className="text-center text-[13px] text-stone">No card. We never sell player data.</p>
      </form>
    </AuthCard>
  );
}
