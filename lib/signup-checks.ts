// Field checks for the sign-up forms (/signup, /parent-signup and the
// onboarding "Save it with a free account" step). Pure, so
// lib/signup-checks.test.ts can pin every message.
//
// Final-check A6 (2026-11-21): a bad email used to be caught only by a loose
// `\S+@\S+\.\S+` test, and anything that passed it reached Supabase on the
// LAST step, which answered with one banner — "That email address doesn't
// look right." — on step 3 of 3, naming no field. Now the address is checked
// on the email field itself (on blur, and before leaving step 1), the message
// names the field, and a server refusal of the address sends the person back
// to that field (components/auth/email-field.ts).
//
// Final-check A16: a birth year and a grade that disagree get a gentle hint.
// It never blocks: kids skip and repeat grades, and the birth year is the
// field the consent rule runs on, so the hint asks them to check, nothing
// more.

import { AUTH_ERROR_MESSAGES } from "@/lib/auth";
import { getGradYearFromGrade } from "@/lib/time";
import { birthYearRangeForGradYear } from "@/lib/grade-birth-year";

/** Every email-field message starts with this, so a screen reader that
 * hears only the error still knows which field it is about. */
export const EMAIL_FIELD_PREFIX = "Email:";

export const EMAIL_FIELD_MESSAGES = {
  empty: `${EMAIL_FIELD_PREFIX} enter your email address.`,
  malformed: `${EMAIL_FIELD_PREFIX} that address doesn't look right. Check it for a typo.`,
  /** Supabase refused the address itself (email_address_invalid). */
  refused: `${EMAIL_FIELD_PREFIX} we can't use that address. Check it for a typo, or try a different one.`,
  /** Supabase refused to send to it (email_address_not_authorized). */
  notAllowed: `${EMAIL_FIELD_PREFIX} we can't send email to that address right now. Try a different one.`,
} as const;

/** The address as it is sent: surrounding spaces dropped (a pasted address
 * often carries one, and Supabase refuses it on the last step). */
export function normalizeEmail(raw: string): string {
  return raw.trim();
}

// One @, a local part with no spaces, and a domain of dot-separated labels
// (letters, digits, hyphens; no label starts or ends with a hyphen) ending in
// a top-level domain of 2+ letters. Deliberately not RFC 5322: it rejects
// typos ("name@gmail", "name@@gmail.com", "name@gmail..com", "name @x.com")
// without rejecting real addresses people use.
const LOCAL_PART = /^[^\s@"(),:;<>[\\\]]+$/;
const DOMAIN_LABEL = /^(?!-)[\p{L}\p{N}-]{1,63}(?<!-)$/u;
const TLD = /^\p{L}{2,63}$/u;
// An internationalised TLD in its ASCII (punycode) form, e.g. ".xn--p1ai".
const PUNYCODE_TLD = /^xn--[a-z0-9-]{1,59}$/i;

/** True when the address is shaped like a real one. */
export function isPlausibleEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (!email || email.length > 254) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !LOCAL_PART.test(local)) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((l) => DOMAIN_LABEL.test(l))) return false;
  const tld = labels[labels.length - 1];
  return TLD.test(tld) || PUNYCODE_TLD.test(tld);
}

/**
 * The email field's own message, or null when it is fine.
 *
 * `required` is false while the person is still filling the form (on blur):
 * an empty field they tabbed past is not an error yet. It is true when they
 * press Continue / Create, where empty IS the problem.
 */
export function emailFieldError(raw: string, { required }: { required: boolean }): string | null {
  const email = normalizeEmail(raw);
  if (!email) return required ? EMAIL_FIELD_MESSAGES.empty : null;
  return isPlausibleEmail(email) ? null : EMAIL_FIELD_MESSAGES.malformed;
}

/** When a sign-up failed because of the ADDRESS (the friendlyAuthError
 * sentence says so), the email field's message for it. Null for every other
 * failure, which stays in the form's banner. */
export function emailFieldErrorFromAuth(message: string | null | undefined): string | null {
  if (message === AUTH_ERROR_MESSAGES.invalidEmail) return EMAIL_FIELD_MESSAGES.refused;
  if (message === AUTH_ERROR_MESSAGES.emailNotAllowed) return EMAIL_FIELD_MESSAGES.notAllowed;
  return null;
}

/** /signup's step for the email field (step 1 of 3, index 0). */
export const SIGNUP_EMAIL_STEP = 0;

/**
 * What /signup does when the sign-up call failed: when the ADDRESS was
 * refused, go back to the email field's step with its message on the field;
 * null means stay and show the banner. Pinned by lib/signup-checks.test.ts,
 * together with the block in signup-flow.tsx that acts on it.
 */
export function signupFailureSendBack(
  message: string | null | undefined
): { step: number; emailMessage: string } | null {
  const emailMessage = emailFieldErrorFromAuth(message);
  return emailMessage ? { step: SIGNUP_EMAIL_STEP, emailMessage } : null;
}

/** The birth years that are usual for a class (graduation) year: someone
 * graduating high school in June of G is normally 17 or 18 then, so born in
 * G-19 or G-18. One year either side is still left alone — early starters,
 * repeated grades, reclassification — so the hint only appears when the two
 * answers are two or more years apart from usual. The same range the forms
 * filter their birth-year lists to: one rule, in lib/grade-birth-year.ts. */
export function usualBirthYearsForGradYear(gradYear: number): { earliest: number; latest: number } {
  return birthYearRangeForGradYear(gradYear);
}

/**
 * A gentle hint when a birth year and a grade disagree, or null. Never an
 * error and never blocks: the form still continues.
 *
 * `grade` is the grade the person picked for THIS school year (8–12).
 */
export function birthYearGradeHint(
  birthYear: number | null | undefined,
  grade: number | null | undefined,
  now: Date = new Date()
): string | null {
  if (birthYear == null || grade == null) return null;
  if (!Number.isInteger(birthYear) || !Number.isInteger(grade)) return null;
  const gradYear = getGradYearFromGrade(grade, now);
  return birthYearGradYearHint(birthYear, gradYear, `${grade}th grade`);
}

/** The same check when the form asks for a class year instead of a grade. */
export function birthYearGradYearHint(
  birthYear: number | null | undefined,
  gradYear: number | null | undefined,
  gradeLabel?: string
): string | null {
  if (birthYear == null || gradYear == null) return null;
  if (!Number.isInteger(birthYear) || !Number.isInteger(gradYear)) return null;
  const { earliest, latest } = usualBirthYearsForGradYear(gradYear);
  if (birthYear >= earliest && birthYear <= latest) return null;
  const which = gradeLabel ?? `the class of ${gradYear}`;
  return `Born in ${birthYear} and in ${which}? That's unusual, so check both. If they're right, carry on.`;
}
