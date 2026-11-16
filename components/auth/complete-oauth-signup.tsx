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
import { AuthCard, AuthField, authInputClass } from "./auth-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const submit = async () => {
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
    setSubmitting(false);

    if (!result.ok) return setError(result.error ?? "Something went wrong. Try again.");
    router.replace(next ?? (isParent ? "/family" : "/onboarding"));
  };

  if (checking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-grass motion-reduce:animate-none" aria-hidden />
      </div>
    );
  }

  return (
    <AuthCard
      title="Finish setting up"
      subtitle="Google told us who you are. Seeded needs a little more before your account works."
      error={error}
    >
      <div className="space-y-4">
        <AuthField label="Full name" htmlFor="oauth-name">
          <input
            id="oauth-name"
            className={authInputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </AuthField>

        <AuthField label="I am the" htmlFor="oauth-role">
          <div id="oauth-role" className="flex gap-2">
            {(["player", "parent"] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => setRole(r)}
                className={cn(
                  "min-h-11 flex-1 rounded-pill border px-4 text-[15px] font-semibold transition-colors",
                  role === r
                    ? "border-ink bg-ink text-cream"
                    : "border-input bg-card text-ink hover:bg-subtle-hover"
                )}
              >
                {r === "player" ? "Player" : "Parent"}
              </button>
            ))}
          </div>
        </AuthField>

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
            className={authInputClass}
            value={birthYear ?? ""}
            onChange={(e) => setBirthYear(e.target.value ? Number(e.target.value) : null)}
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
                className={authInputClass}
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

            <AuthField label="Team" htmlFor="oauth-gender">
              <div id="oauth-gender" className="flex gap-2">
                {(["female", "male"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={gender === g}
                    onClick={() => setGender(g)}
                    className={cn(
                      "min-h-11 flex-1 rounded-pill border px-4 text-[15px] font-semibold transition-colors",
                      gender === g
                        ? "border-ink bg-ink text-cream"
                        : "border-input bg-card text-ink hover:bg-subtle-hover"
                    )}
                  >
                    {g === "female" ? "Women's" : "Men's"}
                  </button>
                ))}
              </div>
            </AuthField>

            <AuthField label="Grade in school" htmlFor="oauth-grade">
              <div id="oauth-grade" className="grid grid-cols-5 gap-2">
                {[8, 9, 10, 11, 12].map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={grade === g}
                    onClick={() => setGrade(g)}
                    className={cn(
                      "min-h-11 rounded-lg border text-sm font-semibold transition-colors",
                      grade === g
                        ? "border-ink bg-ink text-cream"
                        : "border-input bg-card text-ink hover:bg-subtle-hover"
                    )}
                  >
                    {g}th
                  </button>
                ))}
              </div>
            </AuthField>
          </>
        )}

        <AuthField label="Family" htmlFor="oauth-family">
          <div id="oauth-family" className="space-y-2">
            {!needsParentConsent && (
              <div className="flex gap-2">
                {(["create", "join"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={familyMode === m}
                    onClick={() => setFamilyMode(m)}
                    className={cn(
                      "min-h-11 flex-1 rounded-pill border px-3 text-[15px] font-semibold transition-colors",
                      familyMode === m
                        ? "border-ink bg-ink text-cream"
                        : "border-input bg-card text-ink hover:bg-subtle-hover"
                    )}
                  >
                    {m === "create" ? "Start a family" : "Join with a code"}
                  </button>
                ))}
              </div>
            )}
            {effectiveFamilyMode === "join" && (
              <input
                className={cn(authInputClass, "font-mono uppercase tracking-wider")}
                placeholder={needsParentConsent ? "Your parent's family code" : "Family code"}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                aria-label="Family code"
              />
            )}
          </div>
        </AuthField>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finish setting up"}
        </Button>
        <p className="text-center text-xs text-stone">No card. We never sell player data.</p>
      </div>
    </AuthCard>
  );
}
