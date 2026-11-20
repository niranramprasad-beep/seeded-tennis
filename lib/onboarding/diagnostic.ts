// The /onboarding diagnostic (design board 20): nine questions, one per
// screen, then a result. Everything here is pure — the screen renders it,
// lib/fit.ts does every piece of UTR arithmetic, and lib/onboarding/
// save-diagnostic.ts writes it to an account.
//
// The answers are kept as the TEXT the person typed (so an input never
// rewrites what they are typing) and parsed on read. A rating that does not
// parse is not a low rating, it is no rating: `utrToday` is null until the
// text is a number Postgres would accept (1–16.5, migration 006).

import type { EnrollmentTerm, FamilyRole, Player, PlayerGender } from "@/lib/types";
import {
  getCurrentGrade,
  getCurrentSchoolYear,
  getDefaultCommitDate,
  toLocalDateString,
  monthYearLabel,
  shiftLocalMonths,
} from "@/lib/time";
import { parentConsentRequired } from "@/lib/config/consent";
import { isUsableUtr } from "@/lib/fit";

export type DiagnosticRole = FamilyRole;

export const STEP = {
  role: 0,
  team: 1,
  utrToday: 2,
  utrSixMonths: 3,
  utrYear: 4,
  gradYear: 5,
  birth: 6,
  enrollment: 7,
  gpa: 8,
  result: 9,
} as const;

/** "Question N of 9". The result is not a question. */
export const QUESTION_COUNT = 9;
export const RESULT_STEP = STEP.result;
const OPTIONAL = new Set<number>([STEP.utrSixMonths, STEP.utrYear, STEP.gpa]);

export function isOptionalStep(step: number): boolean {
  return OPTIONAL.has(step);
}

export interface DiagnosticAnswers {
  role: DiagnosticRole | null;
  gender: PlayerGender | null;
  utrTodayText: string;
  /** "I don't have a UTR yet" — skips the two past-rating questions and
   * stores no rating at all. */
  noUtrYet: boolean;
  utrSixMonthsText: string;
  utrYearText: string;
  gradYear: number | null;
  birthMonth: number | null;
  birthYear: number | null;
  enrollmentTerm: EnrollmentTerm | null;
  gpaText: string;
}

export const EMPTY_ANSWERS: DiagnosticAnswers = {
  role: null,
  gender: null,
  utrTodayText: "",
  noUtrYet: false,
  utrSixMonthsText: "",
  utrYearText: "",
  gradYear: null,
  birthMonth: null,
  birthYear: null,
  enrollmentTerm: null,
  gpaText: "",
};

/* --------------------------------------------------------------- parsing */

export const UTR_INPUT_ERROR = "Enter a UTR from 1.00 to 16.50.";
export const GPA_INPUT_ERROR = "Enter a GPA from 0.0 to 4.0.";

/** A typed UTR: null + no error when empty, null + error when it is not a
 * rating, the number otherwise. Two decimals at most, as UTR publishes. */
export function parseUtrText(text: string): { value: number | null; error: string | null } {
  const t = text.trim();
  if (!t) return { value: null, error: null };
  if (!/^\d{1,2}(?:\.\d{0,2})?$/.test(t)) return { value: null, error: UTR_INPUT_ERROR };
  const v = Number(t);
  return isUsableUtr(v) ? { value: v, error: null } : { value: null, error: UTR_INPUT_ERROR };
}

export function parseGpaText(text: string): { value: number | null; error: string | null } {
  const t = text.trim();
  if (!t) return { value: null, error: null };
  if (!/^\d(?:\.\d{0,2})?$/.test(t)) return { value: null, error: GPA_INPUT_ERROR };
  const v = Number(t);
  return v >= 0 && v <= 4 ? { value: v, error: null } : { value: null, error: GPA_INPUT_ERROR };
}

/** The answers as values. Past ratings only count alongside today's. */
export interface DiagnosticValues {
  role: DiagnosticRole | null;
  gender: PlayerGender | null;
  utrToday: number | null;
  utrSixMonthsAgo: number | null;
  utrYearAgo: number | null;
  gradYear: number | null;
  birthMonth: number | null;
  birthYear: number | null;
  enrollmentTerm: EnrollmentTerm | null;
  gpa: number | null;
}

export function diagnosticValues(a: DiagnosticAnswers): DiagnosticValues {
  const today = a.noUtrYet ? null : parseUtrText(a.utrTodayText).value;
  return {
    role: a.role,
    gender: a.gender,
    utrToday: today,
    utrSixMonthsAgo: today == null ? null : parseUtrText(a.utrSixMonthsText).value,
    utrYearAgo: today == null ? null : parseUtrText(a.utrYearText).value,
    gradYear: a.gradYear,
    birthMonth: a.birthMonth,
    birthYear: a.birthYear,
    enrollmentTerm: a.enrollmentTerm,
    gpa: parseGpaText(a.gpaText).value,
  };
}

/* ------------------------------------------------------------ navigation */

export function isAnswered(step: number, a: DiagnosticAnswers): boolean {
  switch (step) {
    case STEP.role:
      return a.role != null;
    case STEP.team:
      return a.gender != null;
    case STEP.utrToday:
      return a.noUtrYet || parseUtrText(a.utrTodayText).value != null;
    case STEP.utrSixMonths:
      return parseUtrText(a.utrSixMonthsText).value != null;
    case STEP.utrYear:
      return parseUtrText(a.utrYearText).value != null;
    case STEP.gradYear:
      return a.gradYear != null;
    case STEP.birth:
      return a.birthMonth != null && a.birthYear != null;
    case STEP.enrollment:
      return a.enrollmentTerm != null;
    case STEP.gpa:
      return parseGpaText(a.gpaText).value != null;
    default:
      return true;
  }
}

/** Continue is enabled only by an answer. Optional steps are left with
 * Skip, which clears them — so nothing half-typed is ever kept. */
export function canContinue(step: number, a: DiagnosticAnswers): boolean {
  return isAnswered(step, a);
}

function skipsPastRatings(step: number, a: DiagnosticAnswers): boolean {
  return a.noUtrYet && (step === STEP.utrSixMonths || step === STEP.utrYear);
}

/**
 * The step after `step`. "I don't have a UTR yet" skips both past-rating
 * questions. Steps answered by the homepage calculator's link (`prefilled`)
 * are passed over going forward — "start at the first unanswered step" —
 * and remain reachable with Back.
 */
export function stepAfter(step: number, a: DiagnosticAnswers, prefilled: ReadonlySet<number>): number {
  let n = step + 1;
  while (
    n < RESULT_STEP &&
    (skipsPastRatings(n, a) || (prefilled.has(n) && isAnswered(n, a)))
  ) {
    n++;
  }
  return Math.min(n, RESULT_STEP);
}

export function stepBefore(step: number, a: DiagnosticAnswers): number {
  let n = step - 1;
  while (n > 0 && skipsPastRatings(n, a)) n--;
  return Math.max(n, 0);
}

/** Where a visit starts: the first step nobody has answered. */
export function firstStep(a: DiagnosticAnswers, prefilled: ReadonlySet<number>): number {
  if (!isAnswered(STEP.role, a)) return STEP.role;
  return stepAfter(STEP.role, a, prefilled);
}

/* ----------------------------------------------------------- dates, lists */

/** "UTR around May 2026" — the real month `monthsAgo` before `now`. */
export function pastRatingMonthLabel(monthsAgo: number, now: Date = new Date()): string {
  return monthYearLabel(shiftLocalMonths(now, -monthsAgo));
}

/** The local calendar date a past rating is recorded at: the same day of
 * the month, `monthsAgo` months back (clamped to a shorter month). */
export function pastRatingDate(monthsAgo: number, now: Date = new Date()): string {
  return toLocalDateString(shiftLocalMonths(now, -monthsAgo));
}

/** Class of {this year's seniors} … four years on. Computed, never typed:
 * the school year rolls over on August 1 (lib/time.ts). */
export function gradYearOptions(now: Date = new Date()): number[] {
  const seniors = getCurrentSchoolYear(now);
  return Array.from({ length: 5 }, (_, i) => seniors + i);
}

/** Birth years a high-school-age player could have: 8 to 25 years ago. */
export function playerBirthYearOptions(now: Date = new Date()): number[] {
  const y = now.getFullYear();
  return Array.from({ length: 18 }, (_, i) => y - 8 - i);
}

/** P0-8, the same rule as every signup path (lib/config/consent.ts,
 * mirroring consent_required_for_birth_year: `<= 13` by YEAR, so it rounds
 * toward asking). The month is not used: the database's rule is year-only. */
export function playerNeedsParent(a: DiagnosticAnswers, now: Date = new Date()): boolean {
  return a.birthYear != null && parentConsentRequired(a.birthYear, now);
}

/* ------------------------------------------------------------- prefill */

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/**
 * The homepage calculator links to `/onboarding?utr=…&gradYear=…&gender=…`
 * (and `gpa`). Read on the SERVER from page.tsx's `searchParams`, so the
 * first screen renders with no client-only bailout. Anything that does not
 * parse is ignored rather than coerced — `?utr=0` is not a rating.
 */
export function prefillFromSearchParams(
  params: SearchParams,
  now: Date = new Date()
): { answers: DiagnosticAnswers; prefilled: number[] } {
  const answers: DiagnosticAnswers = { ...EMPTY_ANSWERS };
  const prefilled: number[] = [];

  const gender = first(params.gender);
  if (gender === "women" || gender === "female") answers.gender = "female";
  else if (gender === "men" || gender === "male") answers.gender = "male";
  if (answers.gender) prefilled.push(STEP.team);

  const utr = first(params.utr).trim();
  if (parseUtrText(utr).value != null) {
    answers.utrTodayText = utr;
    prefilled.push(STEP.utrToday);
  }

  const grad = Number(first(params.gradYear));
  if (gradYearOptions(now).includes(grad)) {
    answers.gradYear = grad;
    prefilled.push(STEP.gradYear);
  }

  const gpa = first(params.gpa).trim();
  if (parseGpaText(gpa).value != null) {
    answers.gpaText = gpa;
    prefilled.push(STEP.gpa);
  }

  return { answers, prefilled };
}

/**
 * A SIGNED-IN player who has not finished onboarding yet (a new Google
 * sign-up, or an email sign-up that left before the questions). Their
 * account already answers some of the diagnostic: they are a player (a
 * parent account is created onboarded and never gets here), and sign-up
 * asked their team, grade and birth year. Those steps are filled from the
 * profile and passed over going forward — still reachable with Back, except
 * the role, which an existing account cannot change.
 *
 * `fromUrl` is the homepage calculator's prefill; the account wins where
 * both answer, because the account is what the save writes to.
 *
 * `birthYear` is the account's own `birth_year`, write-once from the client
 * (033): the diagnostic shows it and never offers to change it.
 */
export function signedInDiagnosticStart(
  account: Pick<Player, "gender" | "graduationYear" | "birthMonth">,
  birthYear: number | null,
  fromUrl: { answers: DiagnosticAnswers; prefilled: number[] } = { answers: EMPTY_ANSWERS, prefilled: [] },
  now: Date = new Date()
): { answers: DiagnosticAnswers; prefilled: number[] } {
  const answers: DiagnosticAnswers = { ...fromUrl.answers, role: "player" };
  const prefilled = new Set<number>(fromUrl.prefilled);
  prefilled.add(STEP.role);

  if (account.gender === "male" || account.gender === "female") {
    answers.gender = account.gender;
    prefilled.add(STEP.team);
  }
  if (gradYearOptions(now).includes(account.graduationYear)) {
    answers.gradYear = account.graduationYear;
    prefilled.add(STEP.gradYear);
  }
  if (birthYear != null) answers.birthYear = birthYear;
  if (account.birthMonth != null) answers.birthMonth = account.birthMonth;
  if (answers.birthYear != null && answers.birthMonth != null) prefilled.add(STEP.birth);

  return { answers, prefilled: [...prefilled].sort((a, b) => a - b) };
}

/** The first step Back can reach. A signed-in account is a player already. */
export function minimumStep(signedIn: boolean): number {
  return signedIn ? STEP.team : STEP.role;
}

/* --------------------------------------------------------------- saving */

export interface DiagnosticUtrEntry {
  utr: number;
  /** Local "YYYY-MM-DD". */
  recordedAt: string;
  note: string;
}

/**
 * The dated `utr_entries` rows a PLAYER's answers become: the year-ago and
 * 6-months-ago ratings at those months' dates, today's at today. Oldest
 * first. Nothing at all without a real rating today — no placeholder, ever.
 */
export function diagnosticUtrEntries(a: DiagnosticAnswers, now: Date = new Date()): DiagnosticUtrEntry[] {
  const v = diagnosticValues(a);
  if (v.role !== "player" || v.utrToday == null) return [];
  const rows: DiagnosticUtrEntry[] = [];
  if (v.utrYearAgo != null) {
    rows.push({ utr: v.utrYearAgo, recordedAt: pastRatingDate(12, now), note: "About a year ago (from sign-up)" });
  }
  if (v.utrSixMonthsAgo != null) {
    rows.push({ utr: v.utrSixMonthsAgo, recordedAt: pastRatingDate(6, now), note: "About 6 months ago (from sign-up)" });
  }
  rows.push({ utr: v.utrToday, recordedAt: toLocalDateString(now), note: "Starting UTR" });
  return rows;
}

/**
 * The player's profile with every answer applied. `currentUTR` is today's
 * rating only when one was given; otherwise the in-memory 0 sentinel, which
 * writeCurrentPlayerProfile() stores as NULL. Refuses a parent's answers:
 * a parent's profile holds no UTR or player stats (board 22, DECISIONS).
 */
export function diagnosticPlayerProfile(base: Player, a: DiagnosticAnswers): Player {
  const v = diagnosticValues(a);
  if (v.role !== "player") throw new Error("Only a player's own answers are saved to their profile.");
  const graduationYear = v.gradYear ?? base.graduationYear;
  return {
    ...base,
    role: "player",
    currentUTR: v.utrToday ?? 0,
    graduationYear,
    commitmentDate: getDefaultCommitDate(graduationYear),
    gender: v.gender ?? base.gender,
    gpa: v.gpa,
    birthMonth: v.birthMonth,
    enrollmentTerm: v.enrollmentTerm,
    onboarded: true,
  };
}

/** The grade signUp()/completeOAuthProfile() take, from the grad year
 * (they store graduation_year from it). Clamped to the 8–12 they accept. */
export function signupGradeFor(gradYear: number | null, now: Date = new Date()): number {
  if (gradYear == null) return 10;
  return Math.min(12, Math.max(8, getCurrentGrade(gradYear, now)));
}

/* ------------------------------------------- carried across Google sign-in */

/** sessionStorage, not localStorage: it dies with the tab, so answers about
 * a child never outlive the sign-up they were typed for. */
export const PENDING_ANSWERS_KEY = "seeded.onboarding.pending";
const PENDING_TTL_MS = 60 * 60 * 1000;

export function serializePendingAnswers(a: DiagnosticAnswers, now: Date = new Date()): string {
  return JSON.stringify({ v: 1, savedAt: now.getTime(), answers: a });
}

/** The answers saved before a Google redirect, or null when there are none,
 * they are over an hour old, or they do not have the expected shape. */
export function parsePendingAnswers(raw: string | null, now: Date = new Date()): DiagnosticAnswers | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { v?: number; savedAt?: number; answers?: Partial<DiagnosticAnswers> };
    if (data?.v !== 1 || typeof data.savedAt !== "number") return null;
    if (now.getTime() - data.savedAt > PENDING_TTL_MS || data.savedAt > now.getTime()) return null;
    const x = data.answers ?? {};
    const answers: DiagnosticAnswers = {
      role: x.role === "player" || x.role === "parent" ? x.role : null,
      gender: x.gender === "male" || x.gender === "female" ? x.gender : null,
      utrTodayText: typeof x.utrTodayText === "string" ? x.utrTodayText : "",
      noUtrYet: x.noUtrYet === true,
      utrSixMonthsText: typeof x.utrSixMonthsText === "string" ? x.utrSixMonthsText : "",
      utrYearText: typeof x.utrYearText === "string" ? x.utrYearText : "",
      gradYear: Number.isInteger(x.gradYear) ? (x.gradYear as number) : null,
      birthMonth:
        Number.isInteger(x.birthMonth) && (x.birthMonth as number) >= 1 && (x.birthMonth as number) <= 12
          ? (x.birthMonth as number)
          : null,
      birthYear: Number.isInteger(x.birthYear) ? (x.birthYear as number) : null,
      enrollmentTerm:
        x.enrollmentTerm === "fall_after_grad" ||
        x.enrollmentTerm === "spring_after_grad" ||
        x.enrollmentTerm === "not_sure"
          ? x.enrollmentTerm
          : null,
      gpaText: typeof x.gpaText === "string" ? x.gpaText : "",
    };
    return answers.role ? answers : null;
  } catch {
    return null;
  }
}

export function storePendingAnswers(a: DiagnosticAnswers): void {
  try {
    sessionStorage.setItem(PENDING_ANSWERS_KEY, serializePendingAnswers(a));
  } catch {
    /* storage blocked: the Google path then asks again on /auth/complete */
  }
}

export function readPendingAnswers(): DiagnosticAnswers | null {
  try {
    return parsePendingAnswers(sessionStorage.getItem(PENDING_ANSWERS_KEY));
  } catch {
    return null;
  }
}

export function clearPendingAnswers(): void {
  try {
    sessionStorage.removeItem(PENDING_ANSWERS_KEY);
  } catch {
    /* nothing to clear */
  }
}
