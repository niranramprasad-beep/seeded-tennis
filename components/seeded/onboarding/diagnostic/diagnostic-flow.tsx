"use client";

import { forwardRef, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { EnrollmentTerm, PlayerGender, SchoolLite } from "@/lib/types";
import { programGenderFor } from "@/lib/types";
import { diagnosticProjection, projectionTargetDate } from "@/lib/fit";
import { seniorSummerMeasureSentence } from "@/lib/senior-summer";
import { EARLY_DECISION_NOTE } from "@/lib/config/growth";
import {
  EMPTY_ANSWERS,
  questionCountFor,
  RESULT_STEP,
  STEP,
  canContinue,
  diagnosticValues,
  firstStep,
  gradYearOptions,
  isOptionalStep,
  minimumStep,
  parseGpaText,
  parseUtrText,
  pastRatingMonthLabel,
  playerBirthYearOptions,
  playerNeedsParent,
  stepAfter,
  stepBefore,
  type DiagnosticAnswers,
  type DiagnosticRole,
} from "@/lib/onboarding/diagnostic";
import { MONTH_NAMES, currentSeason } from "@/lib/time";
import {
  TOURNAMENTS_PLANNED_LABEL,
  parseTournamentsPlannedText,
} from "@/lib/tournaments-planned";
import { SeededButton } from "@/components/seeded/ui/button";
import { DiagnosticAside } from "./diagnostic-aside";
import { DiagnosticSaveForm } from "./diagnostic-save";
import { SignedInDiagnosticSave } from "./diagnostic-save-signed-in";
import { DiagnosticFitReport } from "@/components/seeded/onboarding/seeded-pre-auth-onboarding";
import { cn } from "@/lib/utils";

// Board 20 — the premium diagnostic. One question per screen, about 90
// seconds, then a result, a fit report and a way to keep it.
//
// Server-rendered: page.tsx reads the query string and passes it in as
// props, so the first question is in the HTML with no useSearchParams()
// bailout. The projection is computed by lib/fit.ts (diagnosticProjection)
// and only printed here — lib/onboarding-ui-no-math.test.ts fails the build
// if UTR arithmetic appears in this folder.

type View = "questions" | "save" | "report";

export function SeededDiagnosticOnboarding({
  schools,
  initialAnswers = EMPTY_ANSWERS,
  prefilled = [],
  signedIn = false,
}: {
  schools: SchoolLite[];
  initialAnswers?: DiagnosticAnswers;
  prefilled?: number[];
  /** A signed-in player who has not finished onboarding (D2). The role is
   * fixed ("player" — a parent account is created onboarded), the birth
   * year is the account's own and shown read-only (write-once, 033), and
   * the result saves to their profile instead of creating an account.
   * Start it from lib/onboarding/diagnostic.ts signedInDiagnosticStart(). */
  signedIn?: boolean;
}) {
  const prefilledSet = useMemo(() => new Set(prefilled), [prefilled]);
  const [answers, setAnswers] = useState<DiagnosticAnswers>(initialAnswers);
  const [step, setStep] = useState(() => firstStep(initialAnswers, prefilledSet));
  const [view, setView] = useState<View>("questions");

  const set = (patch: Partial<DiagnosticAnswers>) => setAnswers((a) => ({ ...a, ...patch }));
  const values = diagnosticValues(answers);
  const parent = answers.role === "parent";

  const projection = useMemo(
    () =>
      values.gradYear != null && values.gender != null
        ? diagnosticProjection({
            todayUtr: values.utrToday,
            sixMonthsAgoUtr: values.utrSixMonthsAgo,
            yearAgoUtr: values.utrYearAgo,
            graduationYear: values.gradYear,
            gender: values.gender,
          })
        : null,
    [values.utrToday, values.utrSixMonthsAgo, values.utrYearAgo, values.gradYear, values.gender]
  );

  // Focus the new question's heading so a screen reader announces it and a
  // keyboard user is not left on a button whose meaning just changed. Not
  // on first paint: that would yank focus on page load.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstPaint = useRef(true);
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step, view]);

  const next = () => {
    // Continue is disabled until answered; Enter must obey the same rule.
    if (!canContinue(step, answers)) return;
    setStep((s) => stepAfter(s, answers, prefilledSet));
  };
  const minStep = minimumStep(signedIn);
  // The account's birth year, when it has one, is fixed: birth_year is
  // write-once from the client, so the question shows it rather than asks.
  const [lockedBirthYear] = useState(() => (signedIn ? initialAnswers.birthYear : null));
  // birth_month is write-once too (041): a month already on the account is
  // shown, never offered for change (the save would be refused, 42501).
  const [lockedBirthMonth] = useState(() => (signedIn ? initialAnswers.birthMonth : null));
  const back = () => {
    if (view === "save") return setView("questions");
    setStep((s) => Math.max(minStep, stepBefore(s, answers)));
  };
  const skip = () => {
    if (step === STEP.utrSixMonths) set({ utrSixMonthsText: "" });
    if (step === STEP.utrYear) set({ utrYearText: "" });
    if (step === STEP.gpa) set({ gpaText: "" });
    if (step === STEP.tournaments) set({ tournamentsPlannedText: "" });
    setStep((s) => stepAfter(s, answers, prefilledSet));
  };

  if (view === "report") {
    return (
      <DiagnosticFitReport
        schools={schools}
        answers={answers}
        signedIn={signedIn}
        onEdit={() => {
          setView("questions");
          setStep(RESULT_STEP);
        }}
      />
    );
  }

  const isResult = step === RESULT_STEP;
  // A parent is asked one question fewer (no tournaments planned), so the
  // count follows the role: "of 9" for a parent, "of 10" for a player.
  const questionCount = questionCountFor(answers.role);
  const questionNumber = Math.min(step + 1, questionCount);
  const headingId = `diag-q-${view}-${step}`;
  const enterContinues = view === "questions" && !isResult;

  return (
    <div className="bg-cream pb-16">
      <div className="mx-auto max-w-[1200px] px-4 pt-6 sm:px-6">
        <div className="mx-auto flex max-w-[420px] flex-col items-center text-center">
          <p className="m-0 text-sm font-semibold text-ink">
            {isResult || view === "save" ? "Your result" : `Question ${questionNumber} of ${questionCount}`}
          </p>
          <p className="m-0 mt-0.5 text-[13px] text-stone">About 90 seconds</p>
          <div
            role="progressbar"
            aria-label="Onboarding progress"
            aria-valuemin={1}
            aria-valuemax={questionCount}
            aria-valuenow={isResult || view === "save" ? questionCount : questionNumber}
            aria-valuetext={
              isResult || view === "save" ? `All ${questionCount} questions answered` : `Question ${questionNumber} of ${questionCount}`
            }
            className="mt-2.5 h-1.5 w-full overflow-hidden rounded-pill bg-grass-50"
          >
            <div
              className="h-full rounded-pill bg-grass transition-[width] duration-300 motion-reduce:transition-none"
              style={{
                width: `${((isResult || view === "save" ? questionCount : questionNumber) / questionCount) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 grid max-w-[1200px] gap-5 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {/* A <div>, not a <form>, while the save step shows: that step
            renders DiagnosticSaveForm, which is its own <form>, and a form
            nested in a form is not prevented by React — pressing "Create
            free account" did a native GET of /onboarding, reloading the page
            and losing every answer, and no account was made (final-check
            PR C walk; lib/onboarding-no-nested-form.test.ts). */}
        <QuestionShell
          asForm={view !== "save"}
          onSubmit={(e) => {
            e.preventDefault();
            if (enterContinues) next();
          }}
          onKeyDown={(e) => {
            // Enter = Continue on a choice too (text fields already submit
            // the form natively). Buttons and selects keep their own Enter.
            const t = e.target as HTMLElement;
            if (
              e.key === "Enter" &&
              enterContinues &&
              t instanceof HTMLInputElement &&
              (t.type === "radio" || t.type === "checkbox")
            ) {
              e.preventDefault();
              next();
            }
          }}
          aria-labelledby={headingId}
          className="flex min-w-0 flex-col rounded-[16px] border border-line bg-card p-6 sm:p-10 lg:min-h-[560px] lg:p-12"
        >
          <div aria-live="polite" className="flex-1">
            {view === "save" ? (
              <>
                <QuestionHeading id={headingId} ref={headingRef}>
                  {parent ? "Create your parent account" : "Save it with a free account"}
                </QuestionHeading>
                <Help>
                  {parent
                    ? "Free. No card. You'll get a family code to give your player."
                    : "Free. No card. Everything you answered comes with you."}
                </Help>
                <div className="mt-6 max-w-[440px]">
                  <DiagnosticSaveForm answers={answers} idPrefix="diag-save" />
                </div>
              </>
            ) : isResult ? (
              <ResultBody
                headingId={headingId}
                headingRef={headingRef}
                answers={answers}
                gradYear={values.gradYear}
                programCount={values.gender ? schools.filter((s) => s.gender === programGenderFor(values.gender!)).length : schools.length}
                onReport={() => setView("report")}
                onSave={() => setView("save")}
                signedIn={signedIn}
              />
            ) : (
              <QuestionBody
                step={step}
                headingId={headingId}
                headingRef={headingRef}
                answers={answers}
                set={set}
                lockedBirthYear={lockedBirthYear}
                lockedBirthMonth={lockedBirthMonth}
                onNoUtr={() => {
                  const cleared = { ...answers, noUtrYet: true, utrTodayText: "", utrSixMonthsText: "", utrYearText: "" };
                  setAnswers(cleared);
                  setStep(stepAfter(STEP.utrToday, cleared, prefilledSet));
                }}
              />
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
            {(step > minStep || view === "save") && (
              <SeededButton type="button" variant="secondary" onClick={back}>
                Back
              </SeededButton>
            )}
            <span className="flex-1" />
            {view === "questions" && !isResult && isOptionalStep(step) && (
              <SeededButton type="button" variant="ghost" onClick={skip}>
                Skip
              </SeededButton>
            )}
            {view === "questions" && !isResult && (
              <SeededButton type="submit" disabled={!canContinue(step, answers)}>
                Continue
              </SeededButton>
            )}
          </div>
        </QuestionShell>

        <DiagnosticAside answers={answers} projection={projection} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ pieces */

/** The question card: a <form> (Enter = Continue) for the questions and the
 * result, a plain <div> for the save step, whose sign-up form must not sit
 * inside another form. */
function QuestionShell({
  asForm,
  onSubmit,
  onKeyDown,
  children,
  ...rest
}: {
  asForm: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLFormElement>) => void;
  "aria-labelledby": string;
  className: string;
  children: ReactNode;
}) {
  if (!asForm) return <div {...rest}>{children}</div>;
  return (
    <form noValidate onSubmit={onSubmit} onKeyDown={onKeyDown} {...rest}>
      {children}
    </form>
  );
}

const QuestionHeading = forwardRef<HTMLHeadingElement, { id: string; children: ReactNode }>(
  function QuestionHeading({ id, children }, ref) {
    return (
      <h1
        id={id}
        ref={ref}
        tabIndex={-1}
        className="m-0 font-seeded text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-balance text-ink focus:outline-none sm:text-[34px]"
      >
        {children}
      </h1>
    );
  }
);

function Help({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="m-0 mt-3 text-base leading-relaxed text-stone">
      {children}
    </p>
  );
}

function OptionRows<T extends string | number>({
  labelledBy,
  name,
  options,
  value,
  onChange,
}: {
  labelledBy: string;
  name: string;
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="mt-6 grid gap-3">
      {options.map((o) => {
        const checked = value === o.value;
        return (
          <label key={String(o.value)} className="relative block cursor-pointer">
            <input
              type="radio"
              name={name}
              value={String(o.value)}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex min-h-[64px] items-center gap-4 rounded-xl border px-5 py-3 transition-colors",
                "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                checked ? "border-grass bg-grass-50" : "border-input bg-card hover:bg-subtle-hover"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  checked ? "border-grass" : "border-input"
                )}
              >
                {checked && <span className="h-2.5 w-2.5 rounded-full bg-grass" />}
              </span>
              <span className="flex flex-col">
                <span className="text-[17px] font-semibold text-ink">{o.label}</span>
                {o.hint && <span className="text-sm text-stone">{o.hint}</span>}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function UtrInput({
  id,
  label,
  value,
  onChange,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  describedBy?: string;
}) {
  // Inline, as they type: anything that is not a 1.00–16.50 rating says so.
  const visibleError = parseUtrText(value).error;
  const errorId = `${id}-error`;
  return (
    <div className="mt-6 max-w-[320px]">
      <label htmlFor={id} className="block text-[13px] font-medium text-stone">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={visibleError ? true : undefined}
        aria-describedby={[describedBy, visibleError ? errorId : null].filter(Boolean).join(" ") || undefined}
        className="mt-1.5 h-16 w-full rounded-lg border border-input bg-card px-4 font-mono text-[32px] tabular-nums text-ink placeholder:text-stone-light focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-error"
      />
      <p id={errorId} role={visibleError ? "alert" : undefined} className="m-0 mt-1.5 min-h-[20px] text-sm text-error-strong">
        {visibleError ?? ""}
      </p>
    </div>
  );
}

function QuestionBody({
  step,
  headingId,
  headingRef,
  answers,
  set,
  onNoUtr,
  lockedBirthYear = null,
  lockedBirthMonth = null,
}: {
  step: number;
  headingId: string;
  headingRef: React.Ref<HTMLHeadingElement>;
  answers: DiagnosticAnswers;
  set: (patch: Partial<DiagnosticAnswers>) => void;
  onNoUtr: () => void;
  /** Signed in with a birth year on file: shown, not asked. */
  lockedBirthYear?: number | null;
  /** Signed in with a birth month on file: shown, not asked. */
  lockedBirthMonth?: number | null;
}) {
  const parent = answers.role === "parent";
  const helpId = useId();
  const your = parent ? "your player's" : "your";
  const Your = parent ? "Your player's" : "Your";

  switch (step) {
    case STEP.role:
      return (
        <>
          <QuestionHeading id={headingId} ref={headingRef}>
            Who&rsquo;s filling this in?
          </QuestionHeading>
          <Help>We&rsquo;ll word the questions for you.</Help>
          <OptionRows<DiagnosticRole>
            labelledBy={headingId}
            name="diag-role"
            value={answers.role}
            onChange={(role) => set({ role })}
            options={[
              { value: "player", label: "I'm the player", hint: "Answer for yourself." },
              { value: "parent", label: "I'm a parent", hint: "Answer for your player." },
            ]}
          />
        </>
      );
    case STEP.team:
      return (
        <>
          <QuestionHeading id={headingId} ref={headingRef}>
            {parent ? "Which team is your player aiming for?" : "Which team are you aiming for?"}
          </QuestionHeading>
          <Help>We compare {parent ? "them" : "you"} with that team&rsquo;s college programs.</Help>
          <OptionRows<PlayerGender>
            labelledBy={headingId}
            name="diag-team"
            value={answers.gender}
            onChange={(gender) => set({ gender })}
            options={[
              { value: "male", label: "Men's tennis" },
              { value: "female", label: "Women's tennis" },
            ]}
          />
        </>
      );
    case STEP.utrToday:
      return (
        <>
          <QuestionHeading id={headingId} ref={headingRef}>
            {parent ? "What's your player's UTR today?" : "What's your UTR today?"}
          </QuestionHeading>
          <Help id={helpId}>{Your} singles UTR, from {your} UTR profile. Like 8.25.</Help>
          <UtrInput
            id="diag-utr-today"
            label="UTR today"
            value={answers.utrTodayText}
            onChange={(v) => set({ utrTodayText: v, noUtrYet: false })}
            describedBy={helpId}
          />
          <SeededButton type="button" variant="ghost" className="mt-2 -ml-[18px]" onClick={onNoUtr}>
            {parent ? "My player doesn't have a UTR yet" : "I don't have a UTR yet"}
          </SeededButton>
        </>
      );
    case STEP.utrSixMonths:
    case STEP.utrYear: {
      const monthsAgo = step === STEP.utrSixMonths ? 6 : 12;
      return (
        <>
          <QuestionHeading id={headingId} ref={headingRef}>
            {step === STEP.utrSixMonths ? "What was it about 6 months ago?" : "And about a year ago?"}
          </QuestionHeading>
          <Help id={helpId}>
            Optional. It shows {your} pace. {Your} UTR profile has the history.
          </Help>
          <UtrInput
            id={`diag-utr-${monthsAgo}`}
            label={`UTR around ${pastRatingMonthLabel(monthsAgo)}`}
            value={step === STEP.utrSixMonths ? answers.utrSixMonthsText : answers.utrYearText}
            onChange={(v) => set(step === STEP.utrSixMonths ? { utrSixMonthsText: v } : { utrYearText: v })}
            describedBy={helpId}
          />
        </>
      );
    }
    case STEP.gradYear:
      return (
        <>
          <QuestionHeading id={headingId} ref={headingRef}>
            {parent ? "When does your player graduate high school?" : "When do you graduate high school?"}
          </QuestionHeading>
          <Help>We project {your} rating to the summer before senior year.</Help>
          <div role="radiogroup" aria-labelledby={headingId} className="mt-6 flex flex-wrap gap-2.5">
            {gradYearOptions().map((y) => {
              const checked = answers.gradYear === y;
              return (
                <label key={y} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="diag-grad"
                    value={y}
                    checked={checked}
                    onChange={() => set({ gradYear: y })}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "flex min-h-12 items-center rounded-pill border px-5 text-[16px] font-semibold transition-colors",
                      "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                      checked ? "border-ink bg-ink text-cream" : "border-input bg-card text-ink hover:bg-subtle-hover"
                    )}
                  >
                    Class of {y}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      );
    case STEP.birth: {
      const under13 = playerNeedsParent(answers);
      const note = lockedBirthYear != null && lockedBirthMonth != null
        ? "Already on your account."
        : lockedBirthYear != null
        ? "Your birth year is already on your account, so only the month is new."
        : under13
        ? parent
          ? "Under 13, so you create the account and your player joins with your family code."
          : "You're under 13, so a parent or guardian creates the account. You can still see your fit report."
        : "Under 13? A parent creates the account.";
      return (
        <>
          <QuestionHeading id={headingId} ref={headingRef}>
            {parent ? "When was your player born?" : "When were you born?"}
          </QuestionHeading>
          <Help id={helpId}>Month and year only. We never ask for the day.</Help>
          <div className="mt-6 grid max-w-[440px] grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
              Month
              <select
                value={answers.birthMonth ?? ""}
                onChange={(e) => set({ birthMonth: e.target.value ? Number(e.target.value) : null })}
                aria-describedby={helpId}
                disabled={lockedBirthMonth != null}
                className="h-12 rounded-lg border border-input bg-card px-3 text-base text-ink disabled:bg-cream disabled:text-stone"
              >
                <option value="">Month</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
              Year
              <select
                value={answers.birthYear ?? ""}
                onChange={(e) => set({ birthYear: e.target.value ? Number(e.target.value) : null })}
                aria-describedby={helpId}
                disabled={lockedBirthYear != null}
                className="h-12 rounded-lg border border-input bg-card px-3 text-base text-ink disabled:bg-cream disabled:text-stone"
              >
                <option value="">Year</option>
                {lockedBirthYear != null && !playerBirthYearOptions().includes(lockedBirthYear) && (
                  <option value={lockedBirthYear}>{lockedBirthYear}</option>
                )}
                {playerBirthYearOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p
            className={cn(
              "m-0 mt-4 max-w-[440px] rounded-lg px-4 py-3 text-sm leading-snug",
              under13 && lockedBirthYear == null
                ? "border border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]"
                : "bg-cream text-stone"
            )}
          >
            {note}
          </p>
        </>
      );
    }
    case STEP.enrollment:
      return (
        <>
          <QuestionHeading id={headingId} ref={headingRef}>
            {parent ? "When does your player plan to start college?" : "When do you plan to start college?"}
          </QuestionHeading>
          <Help>Most players start in the fall. Either is fine.</Help>
          <OptionRows<EnrollmentTerm>
            labelledBy={headingId}
            name="diag-enrollment"
            value={answers.enrollmentTerm}
            onChange={(enrollmentTerm) => set({ enrollmentTerm })}
            options={[
              { value: "fall_after_grad", label: parent ? "Fall after they graduate" : "Fall after I graduate" },
              { value: "spring_after_grad", label: "Spring after (gap semester)" },
              { value: "not_sure", label: "Not sure yet" },
            ]}
          />
        </>
      );
    case STEP.gpa: {
      const { error } = parseGpaText(answers.gpaText);
      return (
        <>
          <QuestionHeading id={headingId} ref={headingRef}>
            {parent ? "What's your player's unweighted GPA?" : "What's your unweighted GPA?"}
          </QuestionHeading>
          <Help id={helpId}>Optional. From 0.0 to 4.0. Coaches look at grades too.</Help>
          <div className="mt-6 max-w-[320px]">
            <label htmlFor="diag-gpa" className="block text-[13px] font-medium text-stone">
              Unweighted GPA
            </label>
            <input
              id="diag-gpa"
              value={answers.gpaText}
              onChange={(e) => set({ gpaText: e.target.value })}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={[helpId, error ? "diag-gpa-error" : null].filter(Boolean).join(" ")}
              className="mt-1.5 h-16 w-full rounded-lg border border-input bg-card px-4 font-mono text-[32px] tabular-nums text-ink placeholder:text-stone-light focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-error"
            />
            <p id="diag-gpa-error" role={error ? "alert" : undefined} className="m-0 mt-1.5 min-h-[20px] text-sm text-error-strong">
              {error ?? ""}
            </p>
          </div>
        </>
      );
    }
    case STEP.tournaments: {
      // Players only (stepAfter passes over it for a parent). Optional:
      // Skip leaves it "Not set" — Seeded never fills in a number.
      const { error } = parseTournamentsPlannedText(answers.tournamentsPlannedText);
      return (
        <>
          <QuestionHeading id={headingId} ref={headingRef}>
            How many tournaments do you plan to play this season?
          </QuestionHeading>
          <Help id={helpId}>
            Optional. A rough count for this {currentSeason()} is fine. You can change it in Settings.
          </Help>
          <div className="mt-6 max-w-[320px]">
            <label htmlFor="diag-tournaments" className="block text-[13px] font-medium text-stone">
              {TOURNAMENTS_PLANNED_LABEL}
            </label>
            <input
              id="diag-tournaments"
              value={answers.tournamentsPlannedText}
              onChange={(e) => set({ tournamentsPlannedText: e.target.value })}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={[helpId, error ? "diag-tournaments-error" : null].filter(Boolean).join(" ")}
              className="mt-1.5 h-16 w-full rounded-lg border border-input bg-card px-4 font-mono text-[32px] tabular-nums text-ink placeholder:text-stone-light focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-error"
            />
            <p
              id="diag-tournaments-error"
              role={error ? "alert" : undefined}
              className="m-0 mt-1.5 min-h-[20px] text-sm text-error-strong"
            >
              {error ?? ""}
            </p>
          </div>
        </>
      );
    }
    default:
      return null;
  }
}

function ResultBody({
  headingId,
  headingRef,
  answers,
  gradYear,
  programCount,
  onReport,
  onSave,
  signedIn = false,
}: {
  headingId: string;
  headingRef: React.Ref<HTMLHeadingElement>;
  answers: DiagnosticAnswers;
  gradYear: number | null;
  programCount: number;
  onReport: () => void;
  onSave: () => void;
  signedIn?: boolean;
}) {
  const parent = answers.role === "parent";
  const who = parent ? "your player" : "you";
  // B20: the tense follows the real date (lib/senior-summer.ts) — never
  // "We'll measure you at summer 2026" in November 2026. Never "we measure
  // you at today's rating" for someone who gave no rating.
  const hasRating = diagnosticValues(answers).utrToday != null;
  const heading =
    gradYear != null
      ? seniorSummerMeasureSentence(who, projectionTargetDate(gradYear).getFullYear(), { hasRating })
      : `We’ll measure ${who} at the summer before senior year.`;
  return (
    <>
      <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-grass">Your result</p>
      <QuestionHeading id={headingId} ref={headingRef}>
        {heading}
      </QuestionHeading>
      <Help>
        The fit report compares that rating with {programCount}{" "}
        {answers.gender === "female" ? "women's" : answers.gender === "male" ? "men's" : ""} college
        programs. {EARLY_DECISION_NOTE}
      </Help>
      <div className="mt-8 flex max-w-[440px] flex-col gap-3">
        <SeededButton type="button" onClick={onReport}>
          See my fit report
        </SeededButton>
        {signedIn ? (
          <SignedInDiagnosticSave answers={answers} variant="secondary" />
        ) : (
          <>
            <SeededButton type="button" variant="secondary" onClick={onSave}>
              Save it with a free account
            </SeededButton>
            <p className="m-0 text-center text-[13px] text-stone">No card. We never sell player data.</p>
          </>
        )}
      </div>
    </>
  );
}
