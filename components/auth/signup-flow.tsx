"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Users, UserPlus } from "lucide-react";
import type { Player, PlayerGender, FamilyRole } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { AUTH_ERROR_MESSAGES, resendConfirmationEmail, signUp } from "@/lib/auth";
import {
  birthYearOptions,
  isPlausibleBirthYear,
  parentConsentRequired,
} from "@/lib/config/consent";
import { getDefaultCommitDate, getGradYearFromGrade } from "@/lib/time";
import { SeededButton } from "@/components/seeded/ui/button";
import {
  AUTH_TITLE_ID,
  AuthCard,
  AuthField,
  AuthFooterLink,
  AuthLegalLine,
  authInputClass,
  describedBy,
} from "./auth-card";
import { ChipRadioGroup } from "./chip-radio-group";
import { CheckEmailCard } from "./check-email";
import { SIGNUP_CONSENT_NOTE } from "@/lib/legal/policy";
import { cn } from "@/lib/utils";

// Board 21, "Sign up" (docs/DESIGN_MOCKUP_SPEC_V2.md), restyled into the
// shared AuthCard. The board draws ONE screen — role chips, email, password,
// "Create free account". The real signup needs more than that to work, so it
// keeps its three steps, each in the same card:
//
//   1 Account   — the board's screen, plus the name field (every profile has
//                 one; for a player it is first name + last initial).
//   2 About you — country, gender, BIRTH YEAR (P0-8: decides whether the
//                 account needs a parent's consent) and grade.
//   3 Family    — create a family or join one with a code. An under-13
//                 player is offered only "join": nobody in a family of one
//                 can give parental consent.
//
// Nothing is created until the last step, so steps 1 and 2 say "Continue"
// and only step 3 says "Create free account".

const COUNTRIES = [
  "United States",
  "Canada",
  "United Kingdom",
  "Spain",
  "Germany",
  "France",
  "Italy",
  "Australia",
  "Mexico",
  "Brazil",
  "Argentina",
  "India",
  "China",
  "Japan",
  "South Korea",
  "Other",
];

const STEPS = ["Account", "About you", "Family"];

/** The form's floor, and Supabase Auth's default. The project's real minimum
 * is a dashboard setting this repo cannot read (SECURITY_CHECKLIST wants 8);
 * if it is raised, Supabase refuses and friendlyAuthError explains. Kept at
 * 6 so the form does not reject a password the backend would accept. */
const MIN_PASSWORD_LENGTH = 6;
const ERROR_ID = "signup-error";

export function SignupFlow({
  accountType = "player",
}: {
  accountType?: FamilyRole;
}) {
  const router = useRouter();
  const { beginSession } = usePlayer();

  // The "I'm the" chips switch this in place. They used to be a Player
  // button plus a <Link> to /parent-signup dressed as the second radio;
  // /parent-signup is this same component with accountType="parent", so the
  // in-place switch reaches exactly the same code path without a page load
  // that threw away what had been typed.
  const [accountRole, setAccountRole] = useState<FamilyRole>(accountType);
  const isParentSignup = accountRole === "parent";

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("United States");
  const [gender, setGender] = useState<PlayerGender>("male");
  const [grade, setGrade] = useState(10);
  // P0-8. Year only, never a full date of birth — see lib/config/consent.ts.
  // Starts empty rather than at a plausible default: a prefilled birth year
  // is a guess the product would then act on.
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [familyMode, setFamilyMode] = useState<"create" | "join">(
    accountType === "parent" ? "join" : "create"
  );
  const [joinCode, setJoinCode] = useState("");

  const chooseRole = (r: FamilyRole) => {
    setAccountRole(r);
    // Same defaults the two routes always had: most parents are joining a
    // player who already signed up; most players are starting a family.
    setFamilyMode(r === "parent" ? "join" : "create");
    setError(null);
  };

  // Move focus to the new step's title so a screen reader announces it and
  // a keyboard user is not left on a button that has just changed meaning.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.getElementById(AUTH_TITLE_ID)?.focus();
  }, [step]);

  const go = (d: number) => {
    setError(null);
    setStep((s) => Math.min(Math.max(s + d, 0), STEPS.length - 1));
  };

  // Data minimisation for minors: we ask a player for a first name and a
  // last initial, so a full surname is more than Seeded needs to hold about
  // a child. This NUDGES rather than blocks — a hard reject would be
  // trivially worked around ("NiranR"), would lock out anyone whose name
  // does not fit the pattern we imagined, and would turn a privacy
  // preference into a failed signup. The last word counts as an initial if
  // it is a single letter with an optional dot, so "Niran R." — the format
  // the placeholder recommends — does not trigger its own nudge.
  const lastWord = name.trim().split(/\s+/).slice(-1)[0] ?? "";
  const looksLikeFullSurname =
    !isParentSignup && name.trim().split(/\s+/).length > 1 && !/^[A-Za-z]\.?$/.test(lastWord);

  // P0-8. A player who may be under 13 cannot start their own family: there
  // would be nobody in it who can give parental consent, so the account
  // would be created and then permanently locked (the database refuses to
  // let a 'player' account consent for anyone, including itself). So the
  // only path offered is joining an adult's family with their code.
  //
  // A PARENT signing up for themselves is never gated by this, whatever year
  // they enter — they are the adult.
  const needsParentConsent = !isParentSignup && parentConsentRequired(birthYear);
  // A parent can create the family too: the parent of an under-13 has to,
  // because their child cannot. Default for a parent stays "join".
  const effectiveFamilyMode: "create" | "join" =
    needsParentConsent ? "join" : familyMode;

  const continueFromAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      return setError(isParentSignup ? "Enter your name." : "Enter the player's name.");
    }
    if (!/\S+@\S+\.\S+/.test(email)) return setError("Enter a valid email address.");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
    }
    go(1);
  };

  const continueFromAboutYou = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isPlausibleBirthYear(birthYear)) return setError("Choose the year you were born.");
    go(1);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isPlausibleBirthYear(birthYear)) {
      setError("Choose the year you were born.");
      return;
    }
    if (effectiveFamilyMode === "join" && !joinCode.trim()) {
      setError(
        needsParentConsent
          ? "Enter your parent or guardian's family code. They need a Seeded account first."
          : "Enter a family code to join."
      );
      return;
    }
    setSubmitting(true);
    const result = await signUp(
      {
        name,
        email,
        password,
        country,
        gender,
        grade,
        birthYear,
        role: isParentSignup ? "parent" : "player",
      },
      effectiveFamilyMode === "join" ? { mode: "join", code: joinCode } : { mode: "create" }
    );
    setSubmitting(false);
    if (!result.ok) {
      // Already mapped by friendlyAuthError in lib/auth.ts.
      setError(result.error ?? AUTH_ERROR_MESSAGES.unknown);
      return;
    }

    if (result.confirmationRequired) {
      setConfirmationEmail(email);
      if (effectiveFamilyMode === "create" && result.familyCode) setCreatedCode(result.familyCode);
      return;
    }

    const graduationYear = getGradYearFromGrade(grade);
    const player: Player = {
      name,
      // No UTR until the player enters one (lib/data/user.ts).
      currentUTR: 0,
      graduationYear,
      commitmentDate: getDefaultCommitDate(graduationYear),
      gender,
      country,
      role: isParentSignup ? "parent" : "player",
      familyCode: result.familyCode,
      targetSchoolSlugs: [],
      weaknesses: [],
      tournamentsPlayed: 0,
      tournamentsGoal: 12,
      onboarded: isParentSignup,
    };
    beginSession(player);

    if (effectiveFamilyMode === "create" && result.familyCode) {
      // Includes a parent who just created the family: the code IS the thing
      // they came for, since it is what their player signs up with.
      setCreatedCode(result.familyCode);
    } else if (isParentSignup) {
      router.replace("/family");
    } else {
      router.replace("/onboarding");
    }
  };

  // Signed up, but Supabase wants the email confirmed before a session.
  if (confirmationEmail) {
    return (
      <CheckEmailCard
        email={confirmationEmail}
        lead="We sent a confirmation link to"
        onResend={() => resendConfirmationEmail(confirmationEmail)}
      >
        <p className="mt-1 text-[15px] leading-normal text-stone">
          Open it, then come back and sign in.
        </p>
        {createdCode && (
          <div className="mt-5">
            <p className="mb-1.5 text-[13px] font-medium text-stone">Your family code</p>
            <FamilyCodeBox code={createdCode} />
          </div>
        )}
        <SeededButton
          type="button"
          variant="primary"
          className="mt-6 w-full"
          onClick={() => router.replace("/login")}
        >
          Go to sign in
        </SeededButton>
      </CheckEmailCard>
    );
  }

  // Signed up and signed in, and a new family exists: show the code to share.
  if (createdCode) {
    return (
      <AuthCard
        title="Your family is ready"
        subtitle={
          isParentSignup
            ? "Give this code to your player when they sign up. You'll see their request on your Today page and approve it there. Seeded doesn't email or text you, so it's worth doing together."
            : `Share this code so parents and siblings can join ${name.split(" ")[0]}'s account.`
        }
      >
        <FamilyCodeBox code={createdCode} />
        <SeededButton
          type="button"
          variant="primary"
          className="mt-6 w-full"
          onClick={() => router.replace(isParentSignup ? "/family" : "/onboarding")}
        >
          {isParentSignup ? "Go to my family" : "Build my roadmap"}
        </SeededButton>
      </AuthCard>
    );
  }

  const stepCounter = (
    <div>
      <div className="mb-2 flex items-center justify-between text-[13px] text-stone">
        <span className="font-medium text-grass">
          Step {step + 1} of {STEPS.length}
        </span>
        <span>{STEPS[step]}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Sign-up progress"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step + 1}
        aria-valuetext={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
        className="h-1.5 w-full overflow-hidden rounded-pill bg-grass-50"
      >
        <div
          className="h-full rounded-pill bg-grass transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );

  const backButton = (
    <SeededButton type="button" variant="ghost" onClick={() => go(-1)}>
      Back
    </SeededButton>
  );

  const footer = (
    <p>
      Already have an account? <AuthFooterLink href="/login">Sign in</AuthFooterLink>
    </p>
  );

  // The policy constant is the source of the sentence; the two document
  // names are rendered as links.
  const legal = (
    <AuthLegalLine
      prefix={SIGNUP_CONSENT_NOTE.replace(" the Terms and the Privacy policy.", " the")}
    />
  );

  if (step === 0) {
    return (
      <AuthCard
        eyebrow={stepCounter}
        // Not board 21's "Save your fit report": this form receives no
        // report (the onboarding flow has its own sign-up step that does),
        // and people reach it from /pricing, /parents and /login with
        // nothing to save (independent review, 2026-11-16).
        title={isParentSignup ? "Create your parent account" : "Create your free account"}
        subtitle={
          isParentSignup
            ? "Free. No card. Join your player's family with their code, or set one up for them."
            : "Free. No card. See where you fit, then plan your season."
        }
        // A Google signup still lands on /auth/complete for birth year,
        // role and family — the under-13 consent gate has no bypass.
        google={{}}
        error={error}
        errorId={ERROR_ID}
        footer={footer}
      >
        <form onSubmit={continueFromAccount} className="space-y-4" noValidate>
          <ChipRadioGroup<FamilyRole>
            label="I'm the"
            name="signup-role"
            options={[
              { value: "player", label: "Player" },
              { value: "parent", label: "Parent" },
            ]}
            value={accountRole}
            onChange={chooseRole}
          />
          <AuthField
            label={isParentSignup ? "Your name" : "Player's name"}
            htmlFor="signup-name"
            help={
              isParentSignup
                ? undefined
                : looksLikeFullSurname
                  ? "A last initial is enough. You can shorten it if you'd rather we didn't store the full surname."
                  : "First name and last initial is enough, like Niran R."
            }
          >
            <input
              id="signup-name"
              name="name"
              className={authInputClass}
              autoComplete="name"
              placeholder={isParentSignup ? "Alex Ramprasad" : "Niran R."}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-describedby={describedBy("signup-name", {
                hint: !isParentSignup,
                extra: [error && ERROR_ID],
              })}
            />
          </AuthField>
          <AuthField label="Email" htmlFor="signup-email">
            <input
              id="signup-email"
              name="email"
              className={authInputClass}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={describedBy("signup-email", { extra: [error && ERROR_ID] })}
            />
          </AuthField>
          <AuthField
            label="Password"
            htmlFor="signup-password"
            help={`${MIN_PASSWORD_LENGTH}+ characters. Avoid one you use elsewhere.`}
          >
            <input
              id="signup-password"
              name="password"
              className={authInputClass}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={describedBy("signup-password", {
                hint: true,
                extra: [error && ERROR_ID],
              })}
            />
          </AuthField>
          <SeededButton type="submit" variant="primary" className="w-full">
            Continue
          </SeededButton>
        </form>
        <p className="mt-5 text-center text-[13px] leading-normal text-stone">
          Under 13? A parent or guardian signs up first. The player then joins with their
          family code.
        </p>
        {legal}
      </AuthCard>
    );
  }

  if (step === 1) {
    return (
      <AuthCard
        eyebrow={stepCounter}
        title="A bit about you"
        subtitle="This tunes your plan to the right level and timeline."
        error={error}
        errorId={ERROR_ID}
        footer={footer}
      >
        <form onSubmit={continueFromAboutYou} className="space-y-4" noValidate>
          <AuthField label="Country" htmlFor="signup-country">
            <select
              id="signup-country"
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
            label="Gender"
            name="signup-gender"
            options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
            ]}
            value={gender}
            onChange={setGender}
          />
          {/* P0-8. Year only. The product needs to know who is under 13; it
              does not need a child's exact date of birth, which is a
              permanent identifier it would then have to keep. */}
          <AuthField
            label="Year you were born"
            htmlFor="signup-birth-year"
            help={
              needsParentConsent
                ? "Because you're under 13, a parent or guardian has to set Seeded up and say yes before your account starts working. You'll need their family code on the next step."
                : undefined
            }
          >
            <select
              id="signup-birth-year"
              name="birth-year"
              className={authInputClass}
              value={birthYear ?? ""}
              onChange={(e) => setBirthYear(e.target.value ? Number(e.target.value) : null)}
              aria-describedby={describedBy("signup-birth-year", {
                hint: needsParentConsent,
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
          <ChipRadioGroup<number>
            label="Grade in school"
            name="signup-grade"
            columns={5}
            options={[8, 9, 10, 11, 12].map((g) => ({ value: g, label: `${g}th` }))}
            value={grade}
            onChange={setGrade}
          />
          <div className="flex items-center justify-between gap-3 pt-2">
            {backButton}
            <SeededButton type="submit" variant="primary" className="flex-1 sm:flex-none">
              Continue
            </SeededButton>
          </div>
        </form>
        {legal}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow={stepCounter}
      title={isParentSignup ? "Your player's family" : "Your family"}
      subtitle={
        isParentSignup
          ? "Either your player already has a Seeded account, or you're setting one up for them. Under 13s need you to go first."
          : needsParentConsent
            ? "Under 13, so this has to be your parent or guardian's family. Ask them to create their own Seeded account first, then enter the family code it gives them."
            : "Families share one player's data with different roles."
      }
      error={error}
      errorId={ERROR_ID}
      footer={footer}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {/* P0-8: an under-13 player is offered no "create a family" option.
            Nobody in a family of one can give parental consent, so that path
            creates an account that can never be unlocked. */}
        {!needsParentConsent && (
          <FamilyModeChoice
            value={familyMode}
            onChange={setFamilyMode}
            isParentSignup={isParentSignup}
          />
        )}
        {needsParentConsent && (
          <div className="rounded-lg border border-line bg-cream p-4 text-sm leading-normal text-stone">
            <p className="font-medium text-ink">What happens next</p>
            <p className="mt-1.5">
              Your account is created but stays switched off (no results, no schools, no
              plan) until your parent or guardian opens Seeded and says yes. They see the
              request on their Today page.
            </p>
          </div>
        )}
        {effectiveFamilyMode === "join" && (
          <AuthField
            label={needsParentConsent ? "Your parent's family code" : "Family code"}
            htmlFor="signup-family-code"
          >
            <input
              id="signup-family-code"
              name="family-code"
              className={cn(authInputClass, "font-mono uppercase tracking-wider")}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              aria-describedby={describedBy("signup-family-code", { extra: [error && ERROR_ID] })}
            />
          </AuthField>
        )}
        <div className="flex items-center justify-between gap-3 pt-2">
          {backButton}
          <SeededButton
            type="submit"
            variant="primary"
            loading={submitting}
            className="flex-1 sm:flex-none"
          >
            {submitting ? "Creating…" : "Create free account"}
          </SeededButton>
        </div>
      </form>
      {legal}
    </AuthCard>
  );
}

/** "Create a family" / "Join a family" as two native radios styled as
 * cards, so the choice has real radio semantics and arrow-key movement. */
function FamilyModeChoice({
  value,
  onChange,
  isParentSignup,
}: {
  value: "create" | "join";
  onChange: (v: "create" | "join") => void;
  isParentSignup: boolean;
}) {
  const options = [
    {
      value: "create" as const,
      icon: UserPlus,
      title: "Create a family",
      body: isParentSignup
        ? "Your player doesn't have an account yet. You'll get a code to give them."
        : "Start fresh and get a code to share.",
    },
    {
      value: "join" as const,
      icon: Users,
      title: "Join a family",
      body: isParentSignup
        ? "Your player already signed up and gave you their code."
        : "Connect to an existing account.",
    },
  ];
  return (
    <div>
      <span id="signup-family-mode-label" className="mb-1.5 block text-[13px] font-medium text-stone">
        Family
      </span>
      <div
        role="radiogroup"
        aria-labelledby="signup-family-mode-label"
        className="grid gap-3 sm:grid-cols-2"
      >
        {options.map(({ value: v, icon: Icon, title, body }) => {
          const active = value === v;
          return (
            <label key={v} className="relative cursor-pointer">
              <input
                type="radio"
                name="signup-family-mode"
                value={v}
                checked={active}
                onChange={() => onChange(v)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-full flex-col items-start rounded-xl border p-4 text-left transition-colors",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                  active ? "border-grass bg-grass-50" : "border-input bg-card hover:bg-subtle-hover"
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full",
                    active ? "bg-grass text-on-primary" : "bg-grass-50 text-grass"
                  )}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="mt-3 font-semibold text-ink">{title}</span>
                <span className="mt-0.5 text-[13px] leading-snug text-stone">{body}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function FamilyCodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-cream p-4">
      <span className="font-mono text-2xl tracking-wider text-grass">{code}</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-grass-50 text-grass transition-colors hover:bg-grass-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        aria-label={copied ? "Family code copied" : "Copy family code"}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}
