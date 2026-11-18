"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Player } from "@/lib/types";
import { emptyPlayer } from "@/lib/data/user";
import { usePlayer } from "@/lib/context/player-context";
import { AUTH_ERROR_MESSAGES, signUp } from "@/lib/auth";
import { birthYearOptions, isPlausibleBirthYear } from "@/lib/config/consent";
import { SIGNUP_CONSENT_NOTE } from "@/lib/legal/policy";
import {
  diagnosticValues,
  playerNeedsParent,
  signupGradeFor,
  storePendingAnswers,
  type DiagnosticAnswers,
} from "@/lib/onboarding/diagnostic";
import { saveDiagnosticToAccount } from "@/lib/onboarding/save-diagnostic";
import {
  AuthError,
  AuthField,
  AuthLegalLine,
  GoogleButton,
  GoogleDivider,
  authInputClass,
  describedBy,
} from "@/components/auth/auth-card";
import { ChipRadioGroup } from "@/components/auth/chip-radio-group";
import { FamilyCodeBox } from "@/components/auth/signup-flow";
import { VerifyEmailToJoin } from "@/components/auth/verify-email-prompt";
import { rememberMyPendingJoinCode } from "@/lib/db/email-verification";
import { VERIFY_COPY } from "@/lib/email-verify-flow";
import { SeededButton, seededButtonVariants } from "@/components/seeded/ui/button";
import { cn } from "@/lib/utils";

// "Save it with a free account" (board 20, the result screen) and the fit
// report's "Save your report" aside. One form, three honest branches:
//
//   player, 13+    email + password (or Google) → the account is created,
//                  signed in, and EVERY answer is written to it
//                  (lib/onboarding/save-diagnostic.ts). No re-entry.
//   player, <13    no form. A parent creates the account (CLAUDE.md, P0-8):
//                  an under-13 account is inert until an adult consents, so
//                  it could not hold these answers anyway.
//   parent         the PARENT's own account. Nothing they told us about
//                  their player is written to it — a parent's profile holds
//                  no UTR or player stats (board 22). docs/DECISIONS.md,
//                  2026-11-18, has the reasons.

const MIN_PASSWORD_LENGTH = 6; // signup-flow.tsx's floor, for the same reason
const ERROR_ID = "diagnostic-save-error";

export function DiagnosticSaveForm({
  answers,
  idPrefix,
}: {
  answers: DiagnosticAnswers;
  /** Keeps field ids unique when the form renders in two places. */
  idPrefix: string;
}) {
  if (answers.role === "parent") return <ParentSave answers={answers} idPrefix={idPrefix} />;
  if (playerNeedsParent(answers)) return <UnderThirteen />;
  return <PlayerSave answers={answers} idPrefix={idPrefix} />;
}

function UnderThirteen() {
  return (
    <div className="rounded-xl border border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] p-5 text-[15px] leading-relaxed text-[rgb(var(--c-gold-tint-text))]">
      <p className="m-0 font-semibold">A parent creates the account.</p>
      <p className="mt-2">
        Players under 13 can&rsquo;t sign up on their own. A parent or guardian makes their Seeded
        account first, then you join with the family code it gives them. Your fit report stays on
        this page. Nothing is saved.
      </p>
      <Link href="/parent-signup" className={cn(seededButtonVariants({ variant: "primary" }), "mt-4 w-full")}>
        Go to parent sign-up
      </Link>
    </div>
  );
}

function PlayerSave({ answers, idPrefix }: { answers: DiagnosticAnswers; idPrefix: string }) {
  const router = useRouter();
  const { beginSession } = usePlayer();
  const values = diagnosticValues(answers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState<string | null>(null);
  const [partial, setPartial] = useState<{ error: string; player: Player } | null>(null);

  // Same nudge as /signup: a last initial is enough for a child.
  const lastWord = name.trim().split(/\s+/).slice(-1)[0] ?? "";
  const looksLikeFullSurname = name.trim().split(/\s+/).length > 1 && !/^[A-Za-z]\.?$/.test(lastWord);

  const id = (f: string) => `${idPrefix}-${f}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter your first name and last initial.");
    if (!/\S+@\S+\.\S+/.test(email)) return setError("Enter a valid email address.");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
    }
    if (!values.gender || !isPlausibleBirthYear(values.birthYear)) {
      return setError("Go back and answer the team and birthday questions first.");
    }

    setSubmitting(true);
    const result = await signUp(
      {
        name: name.trim(),
        email,
        password,
        country: "United States",
        gender: values.gender,
        grade: signupGradeFor(values.gradYear),
        birthYear: values.birthYear,
        role: "player",
      },
      familyCode.trim() ? { mode: "join", code: familyCode } : { mode: "create" }
    );
    if (!result.ok) {
      setSubmitting(false);
      return setError(result.error ?? AUTH_ERROR_MESSAGES.unknown);
    }
    if (result.confirmationRequired) {
      // Production has confirmation off; if it is ever turned back on, say
      // plainly that the answers were not saved rather than pretend.
      setSubmitting(false);
      return setCheckEmail(email);
    }

    const saved = await saveDiagnosticToAccount(answers);
    setSubmitting(false);
    const player: Player = saved.player ?? {
      ...emptyPlayer,
      name: name.trim(),
      gender: values.gender,
      familyCode: result.familyCode,
    };
    // Starting the session swaps /onboarding to the signed-in view, which
    // unmounts this form — so a failed save is shown BEFORE that happens.
    if (!saved.ok) return setPartial({ error: saved.error, player });
    beginSession(player);
    router.replace("/today");
  };

  if (partial) {
    return (
      <div className="space-y-4">
        <AuthError message={partial.error} id={ERROR_ID} />
        <SeededButton
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => {
            beginSession(partial.player);
            router.replace("/today");
          }}
        >
          Continue to my account
        </SeededButton>
      </div>
    );
  }

  if (checkEmail) {
    return (
      <p role="status" className="rounded-lg border border-line bg-cream p-4 text-[15px] leading-relaxed text-ink">
        We sent a link to <strong>{checkEmail}</strong>. Open it, then sign in. Your answers on this
        page are not saved yet.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <AuthError message={error} id={ERROR_ID} />}
      <GoogleButton onStart={() => storePendingAnswers(answers)} />
      <GoogleDivider label="or with email" />
      <AuthField
        label="Your name"
        htmlFor={id("name")}
        help={
          looksLikeFullSurname
            ? "A last initial is enough. You can shorten it if you'd rather we didn't keep your full last name."
            : "First name and last initial is enough, like Sam R."
        }
      >
        <input
          id={id("name")}
          className={authInputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          aria-describedby={describedBy(id("name"), { hint: true, extra: [error && ERROR_ID] })}
        />
      </AuthField>
      <AuthField label="Email" htmlFor={id("email")}>
        <input
          id={id("email")}
          type="email"
          className={authInputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-describedby={describedBy(id("email"), { extra: [error && ERROR_ID] })}
        />
      </AuthField>
      <AuthField label="Password" htmlFor={id("password")} help="6+ characters. Avoid one you use elsewhere.">
        <input
          id={id("password")}
          type="password"
          className={authInputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          aria-describedby={describedBy(id("password"), { hint: true, extra: [error && ERROR_ID] })}
        />
      </AuthField>
      <AuthField
        label="Family code (optional)"
        htmlFor={id("family")}
        help="Only if a parent already set up Seeded and gave you one."
      >
        <input
          id={id("family")}
          className={cn(authInputClass, "font-mono uppercase tracking-wider")}
          value={familyCode}
          onChange={(e) => setFamilyCode(e.target.value.toUpperCase())}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-describedby={describedBy(id("family"), { hint: true })}
        />
      </AuthField>
      <SeededButton type="submit" loading={submitting} className="w-full">
        {submitting ? "Saving…" : "Create free account"}
      </SeededButton>
      <p className="m-0 text-center text-[13px] text-stone">No card. We never sell player data.</p>
      <AuthLegalLine prefix={SIGNUP_CONSENT_NOTE.replace(" the Terms and the Privacy policy.", " the")} />
    </form>
  );
}

function ParentSave({ answers, idPrefix }: { answers: DiagnosticAnswers; idPrefix: string }) {
  const router = useRouter();
  const { beginSession } = usePlayer();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [familyMode, setFamilyMode] = useState<"create" | "join">("create");
  const [joinCode, setJoinCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [verifyJoinCode, setVerifyJoinCode] = useState<string | null>(null);
  const [sessionPlayer, setSessionPlayer] = useState<Player | null>(null);
  const [checkEmail, setCheckEmail] = useState<string | null>(null);

  const id = (f: string) => `${idPrefix}-parent-${f}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter your name.");
    if (!/\S+@\S+\.\S+/.test(email)) return setError("Enter a valid email address.");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
    }
    // YOUR birth year, not your player's: it is written once to the parent's
    // own profile (migration 030/033), and the player's would make the
    // parent's account read as under 13.
    if (!isPlausibleBirthYear(birthYear)) return setError("Choose the year you were born.");
    if (familyMode === "join" && !joinCode.trim()) return setError("Enter a family code to join.");

    setSubmitting(true);
    const result = await signUp(
      {
        name: name.trim(),
        email,
        password,
        country: "United States",
        // A parent's own row still has these columns. These are exactly the
        // values /parent-signup sends (signup-flow.tsx's defaults) — NOT the
        // player's team or grade, which are player stats (board 22).
        gender: "male",
        grade: 10,
        birthYear,
        role: "parent",
      },
      familyMode === "join" ? { mode: "join", code: joinCode } : { mode: "create" }
    );
    setSubmitting(false);
    if (!result.ok) return setError(result.error ?? AUTH_ERROR_MESSAGES.unknown);
    if (result.confirmationRequired) return setCheckEmail(email);

    const parentPlayer: Player = {
      ...emptyPlayer,
      name: name.trim(),
      role: "parent",
      familyCode: result.familyCode,
      onboarded: true,
    };
    // Starting the session swaps /onboarding to the signed-in view and
    // unmounts this form, so the new family code is shown FIRST and the
    // session starts when they leave for /family.
    if (familyMode === "create" && result.familyCode) {
      setCreatedCode(result.familyCode);
      setSessionPlayer(parentPlayer);
    } else if (familyMode === "join" && result.joinStatus === "verify_email_required") {
      // 043: join_family() refuses a PARENT who hasn't confirmed their email.
      // The account exists and is signed in — this is one more step, not a
      // failed sign-up, and the code is kept (bound to this account) so
      // /auth/verified or "I've confirmed — try again" finishes the join.
      // The session starts only once they leave this step, for the same
      // reason as the created-code branch above.
      void rememberMyPendingJoinCode(joinCode);
      setVerifyJoinCode(joinCode.trim().toUpperCase());
      setSessionPlayer(parentPlayer);
    } else {
      beginSession(parentPlayer);
      router.replace("/family");
    }
  };

  if (checkEmail) {
    return (
      <p role="status" className="rounded-lg border border-line bg-cream p-4 text-[15px] leading-relaxed text-ink">
        We sent a link to <strong>{checkEmail}</strong>. Open it, then sign in.
      </p>
    );
  }

  if (verifyJoinCode) {
    return (
      <div>
        <p className="m-0 text-[15px] font-semibold text-ink">{VERIFY_COPY.joinTitle("your family")}</p>
        <div className="mt-2">
          <VerifyEmailToJoin
            bare
            code={verifyJoinCode}
            onJoined={() => {
              if (sessionPlayer) beginSession(sessionPlayer);
              router.replace("/family");
            }}
          />
        </div>
      </div>
    );
  }

  if (createdCode) {
    return (
      <div>
        <p className="m-0 text-[15px] font-semibold text-ink">Your family code</p>
        <div className="mt-2">
          <FamilyCodeBox code={createdCode} />
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-stone">
          Give this code to your player. They sign up with it and answer these questions for
          themselves, about 90 seconds. You approve their request on your family page.
        </p>
        <SeededButton
          type="button"
          className="mt-5 w-full"
          onClick={() => {
            if (sessionPlayer) beginSession(sessionPlayer);
            router.replace("/family");
          }}
        >
          Go to my family
        </SeededButton>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="m-0 rounded-lg border border-line bg-cream p-4 text-[15px] leading-relaxed text-ink">
        This makes <strong>your</strong> parent account. What you told us about your player stays on
        this page. They answer for themselves when they join with your family code.
      </p>
      {error && <AuthError message={error} id={ERROR_ID} />}
      <GoogleButton onStart={() => storePendingAnswers(answers)} />
      <GoogleDivider label="or with email" />
      <AuthField label="Your name" htmlFor={id("name")}>
        <input
          id={id("name")}
          className={authInputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          aria-describedby={describedBy(id("name"), { extra: [error && ERROR_ID] })}
        />
      </AuthField>
      <AuthField label="Email" htmlFor={id("email")}>
        <input
          id={id("email")}
          type="email"
          className={authInputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </AuthField>
      <AuthField label="Password" htmlFor={id("password")} help="6+ characters. Avoid one you use elsewhere.">
        <input
          id={id("password")}
          type="password"
          className={authInputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          aria-describedby={describedBy(id("password"), { hint: true })}
        />
      </AuthField>
      <AuthField label="Year you were born" htmlFor={id("birth-year")} help="Yours, not your player's.">
        <select
          id={id("birth-year")}
          className={authInputClass}
          value={birthYear ?? ""}
          onChange={(e) => setBirthYear(e.target.value ? Number(e.target.value) : null)}
          aria-describedby={describedBy(id("birth-year"), { hint: true })}
        >
          <option value="">Select a year</option>
          {birthYearOptions().map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </AuthField>
      <ChipRadioGroup<"create" | "join">
        label="Family"
        name={id("family-mode")}
        options={[
          { value: "create", label: "Start a family" },
          { value: "join", label: "Join with a code" },
        ]}
        value={familyMode}
        onChange={setFamilyMode}
      />
      {familyMode === "join" && (
        <AuthField label="Family code" htmlFor={id("family-code")}>
          <input
            id={id("family-code")}
            className={cn(authInputClass, "font-mono uppercase tracking-wider")}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </AuthField>
      )}
      <SeededButton type="submit" loading={submitting} className="w-full">
        {submitting ? "Saving…" : "Create parent account"}
      </SeededButton>
      <p className="m-0 text-center text-[13px] text-stone">No card. We never sell player data.</p>
      <AuthLegalLine prefix={SIGNUP_CONSENT_NOTE.replace(" the Terms and the Privacy policy.", " the")} />
    </form>
  );
}
