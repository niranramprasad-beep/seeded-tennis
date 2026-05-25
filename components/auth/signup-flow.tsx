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
import { graduationYearForGrade, signUp } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { FloatingDots } from "@/components/shared/floating-dots";
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

const inputClass =
  "h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";

const STEPS = ["Account", "About you", "Family"];

export function SignupFlow({
  accountType = "player",
}: {
  accountType?: FamilyRole;
}) {
  const router = useRouter();
  const { beginSession } = usePlayer();
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

  const submit = async () => {
    setError(null);
    if ((familyMode === "join" || isParentSignup) && !joinCode.trim()) {
      setError("Enter a family code to join.");
      return;
    }
    setSubmitting(true);
    const result = await signUp(
      { name, email, password, country, gender, grade, role: isParentSignup ? "parent" : role },
      isParentSignup || familyMode === "join"
        ? { mode: "join", code: joinCode }
        : { mode: "create" }
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }

    if (result.confirmationRequired) {
      setConfirmationEmail(email);
      if (familyMode === "create" && result.familyCode) setCreatedCode(result.familyCode);
      return;
    }

    const graduationYear = graduationYearForGrade(grade);
    const player: Player = {
      name,
      currentUTR: 7,
      grade,
      graduationYear,
      commitmentDate: `${graduationYear - 1}-09-01`,
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

    if (isParentSignup) {
      router.push("/family");
    } else if (familyMode === "create" && result.familyCode) {
      setCreatedCode(result.familyCode);
    } else {
      router.push("/onboarding");
    }
  };

  // Success screen showing the family code to share.
  if (confirmationEmail) {
    return (
      <Centered>
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-grass text-cream shadow-soft">
            <Check className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-3xl font-light tracking-tight text-ink">
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
                className="flex h-9 w-9 items-center justify-center rounded-full bg-grass-50 text-grass transition-colors hover:bg-grass-100"
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
            onClick={() => router.push("/login")}
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
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-grass text-cream shadow-soft">
            <Check className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-3xl font-light tracking-tight text-ink">
            Your family is ready.
          </h1>
          <p className="mt-2 text-stone">
            Share this code so parents and siblings can join {name.split(" ")[0]}
            's account.
          </p>
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
              className="flex h-9 w-9 items-center justify-center rounded-full bg-grass-50 text-grass transition-colors hover:bg-grass-100"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="mt-8"
            onClick={() => router.push("/onboarding")}
          >
            Build my roadmap
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
            className="h-full rounded-pill bg-gradient-to-r from-leaf-accent to-grass"
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
                <h1 className="text-3xl font-light tracking-tight text-ink">
                  {isParentSignup ? "Create your parent account" : "Create your account"}
                </h1>
                <p className="mt-2 text-stone">
                  {isParentSignup
                    ? "Use the family code from your player to connect to their progress."
                    : "This is the player's profile. Parents can join with a code next."}
                </p>
                <div className="mt-6 space-y-3">
                  <input
                    className={inputClass}
                    placeholder={isParentSignup ? "Parent full name" : "Player's full name"}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <input
                    className={inputClass}
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <input
                    className={inputClass}
                    type="password"
                    placeholder="Password (6+ characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h1 className="text-3xl font-light tracking-tight text-ink">
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
                    <Label>Grade in school</Label>
                    <div className="grid grid-cols-5 gap-2">
                      {[8, 9, 10, 11, 12].map((g) => (
                        <button
                          key={g}
                          onClick={() => setGrade(g)}
                          className={cn(
                            "rounded-xl border-[0.5px] py-3 text-sm font-medium transition-all",
                            grade === g
                              ? "border-grass bg-grass text-cream"
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
                <h1 className="text-3xl font-light tracking-tight text-ink">
                  {isParentSignup ? "Join your player's family" : "Your family"}
                </h1>
                <p className="mt-2 text-stone">
                  {isParentSignup
                    ? "Enter the code your player created. This gives you the parent dashboard."
                    : "Families share one player's data with different roles."}
                </p>
                {!isParentSignup && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <FamilyOption
                    icon={UserPlus}
                    title="Create a family"
                    body="Start fresh and get a code to share."
                    active={familyMode === "create"}
                    onClick={() => setFamilyMode("create")}
                  />
                  <FamilyOption
                    icon={Users}
                    title="Join a family"
                    body="Connect to an existing account."
                    active={familyMode === "join"}
                    onClick={() => setFamilyMode("join")}
                  />
                </div>
                )}
                {(familyMode === "join" || isParentSignup) && (
                  <motion.input
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(inputClass, "mt-3 font-mono uppercase tracking-wider")}
                    placeholder="Family code (e.g. CHEN-7K4P)"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <p className="mt-4 rounded-xl bg-[#FBEAE5] px-4 py-2.5 text-sm text-[#9C3B22]">
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
              disabled={step === 0 && !accountValid}
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
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <FloatingDots />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center container-px py-10">
        {children}
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
          active ? "bg-grass text-cream" : "bg-grass-50 text-grass"
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 font-medium text-ink">{title}</p>
      <p className="mt-0.5 text-xs text-stone-light">{body}</p>
    </button>
  );
}
