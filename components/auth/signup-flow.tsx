"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  Users,
  UserPlus,
} from "lucide-react";
import type { Player, PlayerGender, FamilyRole } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { useDesign } from "@/lib/context/design-context";
import { signUp } from "@/lib/auth";
import {
  birthYearOptions,
  isPlausibleBirthYear,
  parentConsentRequired,
} from "@/lib/config/consent";
import { getDefaultCommitDate, getGradYearFromGrade } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { AuthField, GoogleButton, GoogleDivider, authInputClass } from "./auth-card";
import { SIGNUP_CONSENT_NOTE } from "@/lib/legal/policy";
import { cn } from "@/lib/utils";

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

// The shared auth input, not a second copy of it. /login and /signup used
// to disagree on height, radius, border weight and text size; the one spec
// now lives in components/auth/auth-card.tsx and both screens import it.
const inputClass = authInputClass;

const STEPS = ["Account", "About you", "Family"];

export function SignupFlow({
  accountType = "player",
}: {
  accountType?: FamilyRole;
}) {
  const router = useRouter();
  const { beginSession } = usePlayer();
  const { design } = useDesign();
  const isSeeded = design === "seeded";
  const isParentSignup = accountType === "parent";

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
  const [role, setRole] = useState<FamilyRole>(accountType);
  const [familyMode, setFamilyMode] = useState<"create" | "join">(
    isParentSignup ? "join" : "create"
  );
  const [joinCode, setJoinCode] = useState("");

  const go = (d: number) => {
    setError(null);
    setDir(d);
    setStep((s) => Math.min(Math.max(s + d, 0), STEPS.length - 1));
  };

  const accountValid =
    name.trim() && /\S+@\S+\.\S+/.test(email) && password.length >= 6;

  // Data minimisation for minors: we ask a player for a first name and a
  // last initial, so a full surname is more than Seeded needs to hold about
  // a child. This NUDGES rather than blocks — a hard reject would be
  // trivially worked around ("NiranR"), would lock out anyone whose name
  // does not fit the pattern we imagined, and would turn a privacy
  // preference into a failed signup. The hint fires when a player types a
  // second word that is longer than an initial.
  const looksLikeFullSurname =
    !isParentSignup && /\s+\S{2,}\s*$/.test(name.trim()) && name.trim().split(/\s+/).length > 1;

  // P0-8. A player who may be under 13 cannot start their own family: there
  // would be nobody in it who can give parental consent, so the account
  // would be created and then permanently locked (the database refuses to
  // let a 'player' account consent for anyone, including itself). So the
  // only path offered is joining an adult's family with their code.
  //
  // A PARENT signing up for themselves is never gated by this, whatever year
  // they enter — they are the adult.
  const needsParentConsent = !isParentSignup && parentConsentRequired(birthYear);
  const aboutYouValid = isPlausibleBirthYear(birthYear);
  // A PARENT signup used to be hard-wired to "join", which made the
  // parent-first case impossible: the parent of an under-13 has to create
  // the family, because their child cannot (nobody in a family of one can
  // give parental consent). The data layer already supported it — the
  // create path in ensureSupabaseProfile writes whatever role it is given —
  // so the only thing missing was the choice. Default stays "join", which
  // is what most parents are doing.
  const effectiveFamilyMode: "create" | "join" =
    needsParentConsent ? "join" : familyMode;

  const submit = async () => {
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
        role: isParentSignup ? "parent" : role,
      },
      effectiveFamilyMode === "join" ? { mode: "join", code: joinCode } : { mode: "create" }
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
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
      role: isParentSignup ? "parent" : role,
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

  // Success screen showing the family code to share.
  if (confirmationEmail) {
    return (
      <Centered>
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-grass text-on-primary shadow-soft">
            <Check className="h-6 w-6" />
          </span>
          <h1 className={cn("mt-5 text-3xl tracking-tight text-ink", isSeeded ? "font-seeded font-semibold" : "font-light")}>
            Check your inbox to confirm your email
          </h1>
          <p className="mt-2 text-stone">
            We sent a confirmation link to {confirmationEmail}. Open it, then come
            back and sign in.
          </p>
          {createdCode && (
            <div className="mx-auto mt-6 flex max-w-xs items-center justify-between gap-3 rounded-card border-[0.5px] border-line bg-card p-4">
              <span className="font-mono text-2xl tracking-wider text-grass">
                {createdCode}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(createdCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-grass-50 text-grass transition-colors hover:bg-grass-100"
                aria-label="Copy family code"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          )}
          <Button
            variant="primary"
            size="lg"
            className="mt-8"
            onClick={() => router.replace("/login")}
          >
            Go to sign in
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Centered>
    );
  }

  if (createdCode) {
    return (
      <Centered>
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-grass text-on-primary shadow-soft">
            <Check className="h-6 w-6" />
          </span>
          <h1 className={cn("mt-5 text-3xl tracking-tight text-ink", isSeeded ? "font-seeded font-semibold" : "font-light")}>
            Your family is ready.
          </h1>
          {isParentSignup ? (
            <p className="mt-2 text-stone">
              Give this code to your player when they sign up. You&rsquo;ll see their request
              on your Today page and approve it there — Seeded doesn&rsquo;t email or text
              you, so it&rsquo;s worth doing together.
            </p>
          ) : (
            <p className="mt-2 text-stone">
              Share this code so parents and siblings can join {name.split(" ")[0]}
              &rsquo;s account.
            </p>
          )}
          <div className="mx-auto mt-6 flex max-w-xs items-center justify-between gap-3 rounded-card border-[0.5px] border-line bg-card p-4">
            <span className="font-mono text-2xl tracking-wider text-grass">
              {createdCode}
            </span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(createdCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-grass-50 text-grass transition-colors hover:bg-grass-100"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="mt-8"
            onClick={() => router.replace(isParentSignup ? "/family" : "/onboarding")}
          >
            {isParentSignup ? "Go to my family" : "Build my roadmap"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Centered>
    );
  }

  const variants = {
    enter: (d: number) => ({ x: d * 56, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d * -56, opacity: 0 }),
  };

  return (
    <Centered>
      <div className="w-full">
        <div className="mb-2 flex items-center justify-between text-xs text-stone">
          <span className="font-medium text-grass">
            Step {step + 1} of {STEPS.length}
          </span>
          <span>{STEPS[step]}</span>
        </div>
        <div className="mb-8 h-1.5 w-full overflow-hidden rounded-pill bg-grass-50">
          <motion.div
            className="h-full rounded-pill bg-grass"
            animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && (
              <div>
                {/* Google first, then an "or" divider, per
                    docs/DESIGN_MOCKUP_SPEC.md. A Google signup still lands
                    on /auth/complete for birth year, role and family — the
                    under-13 consent gate has no bypass. */}
                <GoogleButton label="Sign up with Google" />
                <GoogleDivider />
                <h1 className={cn("text-3xl tracking-tight text-ink", isSeeded ? "font-seeded font-semibold" : "font-light")}>
                  {isParentSignup ? "Create your parent account" : "Create your account"}
                </h1>
                <p className="mt-2 text-stone">
                  {isParentSignup
                    ? "Use the family code from your player to connect to their progress."
                    : "This is the player's profile. Parents can join with a code next."}
                </p>
                {/* Spec: an "I am the" Player/Parent pill radio. Choosing
                    Parent routes to /parent-signup rather than flipping a
                    flag inside this wizard — the parent path has different
                    copy, different fields and a different landing page, and
                    a half-parent mode inside the player flow would be a
                    worse version of a page that already exists. */}
                {!isParentSignup && (
                  <div className="mt-5">
                    <span className="mb-1.5 block text-[13px] font-medium text-stone">
                      I am the
                    </span>
                    <div role="radiogroup" aria-label="I am the" className="flex gap-2">
                      <button
                        type="button"
                        role="radio"
                        aria-checked
                        className="min-h-11 flex-1 rounded-pill border border-ink bg-ink px-4 text-[15px] font-semibold text-cream"
                      >
                        Player
                      </button>
                      <Link
                        href="/parent-signup"
                        role="radio"
                        aria-checked={false}
                        className="flex min-h-11 flex-1 items-center justify-center rounded-pill border border-input bg-card px-4 text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover"
                      >
                        Parent
                      </Link>
                    </div>
                  </div>
                )}
                {/* Labelled fields rather than placeholder-only, matching
                    /login: a placeholder disappears the moment you type,
                    which on a three-field form is where people lose track
                    of which box they are in. */}
                <div className="mt-6 space-y-4">
                  <AuthField
                    label={isParentSignup ? "Your name" : "Player's name"}
                    htmlFor="signup-name"
                    help={
                      isParentSignup
                        ? undefined
                        : looksLikeFullSurname
                          ? "A last initial is enough — you can shorten it if you'd rather we didn't store the full surname."
                          : "First name and last initial is enough — e.g. Niran R."
                    }
                  >
                    <input
                      id="signup-name"
                      className={inputClass}
                      autoComplete="name"
                      placeholder={isParentSignup ? "Alex Ramprasad" : "Niran R."}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </AuthField>
                  <AuthField label="Email address" htmlFor="signup-email">
                    <input
                      id="signup-email"
                      className={inputClass}
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </AuthField>
                  <AuthField label="Password" htmlFor="signup-password" help="At least 6 characters.">
                    <input
                      id="signup-password"
                      className={inputClass}
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </AuthField>
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h1 className={cn("text-3xl tracking-tight text-ink", isSeeded ? "font-seeded font-semibold" : "font-light")}>
                  A bit about you
                </h1>
                <p className="mt-2 text-stone">
                  This tunes your roadmap to the right level and timeline.
                </p>
                <div className="mt-6 space-y-5">
                  <div>
                    <Label>Country</Label>
                    <select
                      className={inputClass}
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Gender</Label>
                    <Segmented
                      options={[
                        { value: "male", label: "Male" },
                        { value: "female", label: "Female" },
                      ]}
                      value={gender}
                      onChange={(v) => setGender(v as PlayerGender)}
                      layoutId="signup-gender"
                    />
                  </div>
                  <div>
                    {/* P0-8. Year only. The product needs to know who is
                        under 13; it does not need a child's exact date of
                        birth, which is a permanent identifier it would then
                        have to keep. */}
                    <Label>Year you were born</Label>
                    <select
                      className={inputClass}
                      value={birthYear ?? ""}
                      onChange={(e) =>
                        setBirthYear(e.target.value ? Number(e.target.value) : null)
                      }
                    >
                      <option value="">Select a year</option>
                      {birthYearOptions().map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    {needsParentConsent && (
                      <p className="mt-2 text-sm text-stone">
                        Because you&apos;re under 13, a parent or guardian has to set Seeded up
                        and say yes before your account starts working. You&apos;ll need their
                        family code on the next step.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Grade in school</Label>
                    <div className="grid grid-cols-5 gap-2">
                      {[8, 9, 10, 11, 12].map((g) => (
                        <button
                          key={g}
                          onClick={() => setGrade(g)}
                          className={cn(
                            "rounded-xl border-[0.5px] py-3 text-sm font-medium transition-all",
                            grade === g
                              ? "border-grass bg-grass text-on-primary"
                              : "border-line bg-card text-ink hover:shadow-soft"
                          )}
                        >
                          {g}th
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h1 className={cn("text-3xl tracking-tight text-ink", isSeeded ? "font-seeded font-semibold" : "font-light")}>
                  {isParentSignup ? "Your player's family" : "Your family"}
                </h1>
                <p className="mt-2 text-stone">
                  {isParentSignup
                    ? "Either your player already has a Seeded account, or you're setting one up for them. Under 13s need you to go first."
                    : needsParentConsent
                      ? "Under 13, so this has to be your parent or guardian's family. Ask them to create their own Seeded account first, then enter the family code it gives them."
                      : "Families share one player's data with different roles."}
                </p>
                {/* P0-8: an under-13 player is offered no "create a family"
                    option. Nobody in a family of one can give parental
                    consent, so that path creates an account that can never
                    be unlocked. */}
                {!needsParentConsent && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <FamilyOption
                    icon={UserPlus}
                    title="Create a family"
                    body={
                      isParentSignup
                        ? "Your player doesn't have an account yet. You'll get a code to give them."
                        : "Start fresh and get a code to share."
                    }
                    active={familyMode === "create"}
                    onClick={() => setFamilyMode("create")}
                  />
                  <FamilyOption
                    icon={Users}
                    title="Join a family"
                    body={
                      isParentSignup
                        ? "Your player already signed up and gave you their code."
                        : "Connect to an existing account."
                    }
                    active={familyMode === "join"}
                    onClick={() => setFamilyMode("join")}
                  />
                </div>
                )}
                {needsParentConsent && (
                  <div className="mt-6 rounded-xl border-[0.5px] border-line bg-subtle p-4 text-sm text-stone">
                    <p className="font-medium text-ink">What happens next</p>
                    <p className="mt-1.5">
                      Your account is created but stays switched off — no results, no schools,
                      no plan — until your parent or guardian opens Seeded and says yes. They
                      see the request on their Today page.
                    </p>
                  </div>
                )}
                {effectiveFamilyMode === "join" && (
                  <motion.input
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(inputClass, "mt-3 font-mono uppercase tracking-wider")}
                    placeholder={needsParentConsent ? "Your parent's family code" : "Family code"}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <p className="mt-4 rounded-xl bg-error-bg px-4 py-2.5 text-sm text-error">
            {error}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="md"
            onClick={() => go(-1)}
            className={cn(step === 0 && "pointer-events-none opacity-0")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              variant="primary"
              size="lg"
              onClick={() => go(1)}
              disabled={(step === 0 && !accountValid) || (step === 1 && !aboutYouValid)}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={submit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {isParentSignup ? "Create parent account" : "Create account"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-stone">
          {SIGNUP_CONSENT_NOTE.replace("the Terms and the Privacy policy.", "")}
          <Link href="/terms" className="underline underline-offset-2 hover:text-grass">
            Terms
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-grass">
            Privacy policy
          </Link>
          .
        </p>

        <p className="mt-6 text-center text-sm text-stone">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-grass hover:underline">
            Sign in
          </Link>
          {!isParentSignup && (
            <>
              <span className="mx-2 text-stone-light">or</span>
              <Link href="/parent-signup" className="font-medium text-grass hover:underline">
                parent signup
              </Link>
            </>
          )}
        </p>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  const { design } = useDesign();
  const isSeeded = design === "seeded";
  return (
    <div className="relative min-h-[calc(100vh-73px)] overflow-hidden">
      <div className="relative mx-auto flex min-h-[calc(100vh-73px)] max-w-[420px] flex-col justify-center container-px py-10">
        <div className={cn(isSeeded && "seeded-glass rounded-card border-0 p-8 shadow-seeded-2")}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs text-stone-light">{children}</label>;
}

function Segmented({
  options,
  value,
  onChange,
  layoutId,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  layoutId: string;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-pill border-[0.5px] border-line bg-grass-50/70 p-1">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex-1 rounded-pill px-4 py-2 text-sm font-medium transition-colors",
              active ? "text-grass-900" : "text-stone hover:text-ink"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-pill bg-card shadow-soft"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FamilyOption({
  icon: Icon,
  title,
  body,
  active,
  onClick,
}: {
  icon: typeof Users;
  title: string;
  body: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-card border-[0.5px] p-4 text-left transition-all",
        active
          ? "border-grass bg-grass-50 shadow-soft"
          : "border-line bg-card hover:-translate-y-0.5 hover:shadow-soft"
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-2xl",
          active ? "bg-grass text-on-primary" : "bg-grass-50 text-grass"
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 font-medium text-ink">{title}</p>
      <p className="mt-0.5 text-xs text-stone-light">{body}</p>
    </button>
  );
}
