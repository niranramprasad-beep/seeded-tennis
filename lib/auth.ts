import { ENROLLMENT_TERMS, type EnrollmentTerm, type FamilyRole, type Player, type PlayerGender } from "@/lib/types";
import { getAuthedUser, getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { emptyPlayer } from "@/lib/data/user";
import { getDefaultCommitDate, getGradYearFromGrade, resolveGraduationYear } from "@/lib/time";
import { validateUtrProfileLink } from "@/lib/utr-profile-link";
import { toTournamentsPlannedOrNull } from "@/lib/tournaments-planned";
import { joinFamily, type JoinFamilyStatus } from "@/lib/db/family-join";
import { OAUTH_CALLBACK_PATH, safeRedirectPath } from "@/lib/config/auth";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/email-verify-required";

export { isSupabaseConfigured };

export interface AccountInput {
  name: string;
  email: string;
  password: string;
  country: string;
  gender: PlayerGender;
  grade: number;
  role: "player" | "parent";
  /** P0-8. Collected at signup so the product knows who is under 13 instead
   * of inferring it from `grade`. The database decides what it means:
   * profiles.consent_status is derived from this by the 022/030 trigger and
   * is never read from the request body. Optional only so the pre-030 call
   * sites and tests keep compiling — the signup form always sends it. */
  birthYear?: number | null;
  /** Migration 041. Month of birth, 1-12 — never a day. Optional: the
   * current signup form does not ask for it yet, and a null is filled in
   * once later (the 041 trigger makes it write-once after that). */
  birthMonth?: number | null;
}

export type FamilyChoice =
  | { mode: "create" }
  | { mode: "join"; code: string };

export interface AuthResult {
  ok: boolean;
  error?: string;
  familyCode?: string;
  confirmationRequired?: boolean;
  /** Set when signing up with `familyMode: "join"`. A bad code is not a
   * failed signup — the account is real and usable, the person just isn't
   * in a family yet, so the UI sends them to the pending screen with a
   * "Wrong code? Re-enter" option rather than stranding them. */
  joinStatus?: JoinFamilyStatus;
}

// Unguessable family codes.
//
// This used to be `FIRSTNAME-XXXX` from Math.random(): the prefix leaked the
// player's first name to anyone holding a code, and four base-36 characters
// of a non-cryptographic PRNG is not a secret. Both halves of that were part
// of why P0-2 was exploitable.
//
// Matches generate_family_code() in migration 023 (same alphabet, same
// length) so a code minted here and one minted in the database are
// indistinguishable. The alphabet omits I/O/0/1 — these get read aloud and
// typed by parents.
const FAMILY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const FAMILY_CODE_LENGTH = 12;

export function generateFamilyCode(_name?: string): string {
  const bytes = new Uint8Array(FAMILY_CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < FAMILY_CODE_LENGTH; i++) {
    out += FAMILY_CODE_ALPHABET[bytes[i] % FAMILY_CODE_ALPHABET.length];
  }
  return out;
}


// Thrown when Supabase isn't configured. Auth has exactly one backend — there
// is no local/offline fallback that fabricates accounts. In development this
// surfaces as a loud, unmissable error instead of a silently-working demo.
const NOT_CONFIGURED_MESSAGE =
  "Seeded isn't connected to Supabase. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local and restart the dev server.";

function notConfiguredResult(): AuthResult {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.error(`[seeded/auth] ${NOT_CONFIGURED_MESSAGE}`);
  }
  return { ok: false, error: NOT_CONFIGURED_MESSAGE };
}

// A bare "Failed to fetch" (or supabase-js's AuthRetryableFetchError, which
// wraps the same thing) almost always means the request never reached
// Supabase — the project is paused, the URL env var is wrong, or the network
// is down. Shared by friendlyAuthError (for messages) and getSessionState
// (which gets this back as a resolved { error }, not a thrown exception —
// see that function for why the distinction matters).
function isNetworkFailureMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("fetch failed")
  );
}

// The sentences a person can see when auth fails. Exported so the UI can
// recognise one (login-form offers "Resend confirmation email" only for
// EMAIL_NOT_CONFIRMED) without matching on fragments of prose, and so the
// tests can assert the mapping without retyping it.
export const AUTH_ERROR_MESSAGES = {
  invalidCredentials:
    "That email and password don't match. Try again, or reset your password.",
  emailNotConfirmed:
    "Confirm your email first. Open the link we sent you, then sign in.",
  alreadyRegistered:
    "There's already an account with that email. Sign in, or reset your password.",
  // No number on purpose: the real minimum is a Supabase project setting
  // (Authentication -> Policies), which this repo cannot read. The forms
  // check 6 before sending; if the project is ever raised above that, this
  // sentence stays true and a number here would not.
  weakPassword:
    "That password is too short or too easy to guess. Try a longer one you don't use anywhere else.",
  samePassword: "That's your current password. Choose a new one.",
  invalidEmail: "That email address doesn't look right. Check it and try again.",
  emailNotAllowed: "We can't send email to that address right now. Try a different one.",
  rateLimited: "Too many tries. Wait a minute and try again.",
  network: "Can't reach Seeded right now. Check your connection and try again.",
  linkExpired: "That link has expired or was already used. Ask for a new one.",
  signupsClosed: "New accounts are paused right now. Try again later.",
  providerUnavailable:
    "Google sign-in isn't available right now. Use your email and password instead.",
  serverError: "Something went wrong on our side. Try again in a moment.",
  // Migration 043: a parent must prove they own their email (a link we
  // send) before they can join a family, approve someone, or give consent.
  // The sending code is lib/db/email-verification.ts sendVerificationLink().
  verifyEmailRequired: VERIFY_EMAIL_REQUIRED_MESSAGE,
  unknown: "Something went wrong. Try again in a moment.",
} as const;

/**
 * Turn a raw Supabase / network error into a sentence a player can act on.
 *
 * Every branch returns one of AUTH_ERROR_MESSAGES and nothing else — the
 * raw text is never passed through. It used to end in `return message`, so
 * anything not on the list ("Database error saving new user",
 * "unexpected_failure", an AuthApiError's JSON) reached the screen verbatim.
 * Supabase sends both prose ("Invalid login credentials") and codes
 * ("invalid_credentials"), depending on the endpoint and the supabase-js
 * version, so each branch matches both.
 */
export function friendlyAuthError(message: unknown): string {
  // An AuthError carries a machine `code` beside its prose; callers pass
  // the error itself so the code branches below can actually match (they
  // used to receive `error.message` only — independent review, 2026-11-16).
  const code =
    message && typeof message === "object" && "code" in message && typeof (message as { code?: unknown }).code === "string"
      ? (message as { code: string }).code
      : "";
  const text =
    typeof message === "string"
      ? message
      : message instanceof Error
        ? message.message
        : message && typeof message === "object" && "message" in message
          ? String((message as { message?: unknown }).message ?? "")
          : message == null
            ? ""
            : String(message);
  const raw = code ? `${code} ${text}` : text;
  const m = raw.toLowerCase();

  if (isNetworkFailureMessage(raw) || m.includes("authretryablefetcherror")) {
    return AUTH_ERROR_MESSAGES.network;
  }
  // 043's stable message from join_family / approve_family_join /
  // grant_parent_consent. Checked before anything else that could match a
  // 42501, because the next step here is specific: verify, then retry.
  if (m.includes("verify_email_required")) {
    return AUTH_ERROR_MESSAGES.verifyEmailRequired;
  }
  if (
    m.includes("rate limit") ||
    m.includes("rate_limit") ||
    m.includes("too many requests") ||
    // "For security purposes, you can only request this after 42 seconds."
    m.includes("for security purposes") ||
    /\b429\b/.test(m)
  ) {
    return AUTH_ERROR_MESSAGES.rateLimited;
  }
  if (m.includes("not confirmed") || m.includes("email_not_confirmed")) {
    return AUTH_ERROR_MESSAGES.emailNotConfirmed;
  }
  if (
    m.includes("invalid login credentials") ||
    m.includes("invalid_credentials") ||
    m.includes("invalid_grant")
  ) {
    return AUTH_ERROR_MESSAGES.invalidCredentials;
  }
  if (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("user_already_exists") ||
    m.includes("email_exists") ||
    m.includes("already exists")
  ) {
    return AUTH_ERROR_MESSAGES.alreadyRegistered;
  }
  if (m.includes("same_password") || m.includes("different from the old password")) {
    return AUTH_ERROR_MESSAGES.samePassword;
  }
  if (
    m.includes("weak_password") ||
    m.includes("password should") ||
    m.includes("password is known") ||
    m.includes("password is too") ||
    m.includes("pwned")
  ) {
    return AUTH_ERROR_MESSAGES.weakPassword;
  }
  if (
    m.includes("email_address_invalid") ||
    // Current Supabase prose: Email address "x@y.z" is invalid
    /email address\s+"[^"]*"\s+is invalid/.test(m) ||
    m.includes("validate email") ||
    m.includes("invalid email") ||
    m.includes("invalid format")
  ) {
    return AUTH_ERROR_MESSAGES.invalidEmail;
  }
  if (m.includes("email_address_not_authorized") || m.includes("email address not authorized")) {
    return AUTH_ERROR_MESSAGES.emailNotAllowed;
  }
  if (
    m.includes("otp_expired") ||
    m.includes("link is invalid or has expired") ||
    m.includes("token has expired") ||
    m.includes("auth session missing") ||
    m.includes("session_not_found") ||
    m.includes("flow_state")
  ) {
    return AUTH_ERROR_MESSAGES.linkExpired;
  }
  if (m.includes("signups not allowed") || m.includes("signup_disabled") || m.includes("signups_disabled")) {
    return AUTH_ERROR_MESSAGES.signupsClosed;
  }
  if (m.includes("provider is not enabled") || m.includes("unsupported provider") || m.includes("provider_disabled")) {
    return AUTH_ERROR_MESSAGES.providerUnavailable;
  }
  // Supabase Auth's 500s — "Unexpected failure, please check server logs for
  // more information", "Database error saving new user" (a trigger refused
  // the row) — were shown verbatim on the login and signup forms.
  if (
    m.includes("unexpected failure") ||
    m.includes("unexpected_failure") ||
    m.includes("server logs") ||
    m.includes("internal server error") ||
    m.includes("database error") ||
    /\b5\d\d\b/.test(m)
  ) {
    return AUTH_ERROR_MESSAGES.serverError;
  }
  return AUTH_ERROR_MESSAGES.unknown;
}

// Create an account. Supabase is the only backend — if it isn't configured,
// this fails loudly instead of fabricating a local account.
export async function signUp(
  input: AccountInput,
  family: FamilyChoice
): Promise<AuthResult> {
  const supa = getSupabase();
  if (!supa) return notConfiguredResult();

  // Resolve the family code (create new or validate join).
  let familyCode: string;
  if (family.mode === "create") {
    familyCode = generateFamilyCode(input.name);
  } else {
    familyCode = family.code.trim().toUpperCase();
    if (!familyCode) return { ok: false, error: "Enter a family code to join." };
  }

  let data;
  try {
    const res = await supa.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/login?confirmed=1`
            : undefined,
        data: {
          name: input.name,
          country: input.country,
          gender: input.gender,
          grade: input.grade,
          role: input.role,
          birth_year: input.birthYear ?? null,
          birth_month: input.birthMonth ?? null,
          family_code: familyCode,
          family_mode: family.mode,
        },
      },
    });
    if (res.error) return { ok: false, error: friendlyAuthError(res.error) };
    data = res.data;
  } catch (e) {
    return {
      ok: false,
      error: friendlyAuthError(e instanceof Error ? e.message : String(e)),
    };
  }

  if (!data.session) {
    return {
      ok: true,
      familyCode,
      confirmationRequired: true,
    };
  }

  const userId = data.user?.id;
  if (!userId) return { ok: false, error: AUTH_ERROR_MESSAGES.serverError };
  const profileResult = await ensureSupabaseProfile({
    userId,
    email: input.email,
    name: input.name,
    country: input.country,
    gender: input.gender,
    grade: input.grade,
    role: input.role,
    birthYear: input.birthYear ?? null,
    birthMonth: input.birthMonth ?? null,
    familyCode,
    familyMode: family.mode,
  });
  if (!profileResult.ok) return profileResult;

  // joinStatus carried through: a parent refused with verify_email_required
  // (043) has a working account and one step left, and the sign-up screen
  // must show that step rather than drop them on an empty /family.
  return { ok: true, familyCode, joinStatus: profileResult.joinStatus };
}

// Starts Google OAuth via Supabase. This calls the real Supabase API — it's
// not a fabricated button. Whether it actually completes depends on the
// Google provider being enabled (with a client ID/secret) in this project's
// Supabase dashboard under Authentication → Providers, which can't be
// verified or configured from application code; if it isn't enabled yet,
// Supabase returns a clear provider error here rather than silently failing.
export async function signInWithGoogle(next?: string): Promise<AuthResult> {
  const supa = getSupabase();
  if (!supa) return notConfiguredResult();

  // Always our own callback route, never `window.location.href`. The old
  // behaviour sent Google back to whatever page the button was on, which
  // meant no single place exchanged the code, no single place decided where
  // a brand-new user goes, and a redirect URL that changed per page — so the
  // Supabase allowlist had to be wide. One path, allowlisted once.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const safeNext = safeRedirectPath(next ?? null);
  const redirectTo = `${origin}${OAUTH_CALLBACK_PATH}${
    safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""
  }`;

  try {
    const { error } = await supa.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: friendlyAuthError(e instanceof Error ? e.message : String(e)),
    };
  }
}

/**
 * Finishes a Google signup.
 *
 * Google gives us an authenticated user and an email. It does not give us a
 * birth year, a role, or a family — the three things the product is built
 * around and the first of which decides whether the account is allowed to be
 * active at all (P0-8). So a Google user with no profile row is NOT a
 * finished signup, and app/auth/complete collects the rest before this runs.
 *
 * Deliberately the same `ensureSupabaseProfile` the email path uses, with
 * the same arguments. There is no second profile-creation path to drift:
 * the under-13 consent trigger, the family-join RPC and the 022 column lock
 * all apply identically, because it is the same code.
 */
export async function completeOAuthProfile(input: {
  name: string;
  country: string;
  gender: PlayerGender;
  grade: number;
  birthYear: number | null;
  /** Migration 041 — optional, see AccountInput.birthMonth. */
  birthMonth?: number | null;
  role: FamilyRole;
  family: FamilyChoice;
}): Promise<AuthResult> {
  const supa = getSupabase();
  if (!supa) return notConfiguredResult();

  const { data, error } = await supa.auth.getUser();
  if (error || !data.user) {
    return { ok: false, error: "Your sign-in expired. Try signing in again." };
  }

  const familyCode =
    input.family.mode === "create"
      ? generateFamilyCode()
      : input.family.code.trim().toUpperCase();
  if (input.family.mode === "join" && !familyCode) {
    return { ok: false, error: "Enter a family code to join." };
  }

  return ensureSupabaseProfile({
    userId: data.user.id,
    email: data.user.email ?? "",
    name: input.name,
    country: input.country,
    gender: input.gender,
    grade: input.grade,
    birthYear: input.birthYear,
    birthMonth: input.birthMonth ?? null,
    role: input.role,
    familyCode,
    familyMode: input.family.mode,
  });
}

/** Whether the signed-in user has finished signing up. A Google user exists
 * in auth with no profile row until app/auth/complete runs. */
export async function hasSeededProfile(): Promise<boolean> {
  const supa = getSupabase();
  if (!supa) return false;
  const { data } = await supa.auth.getUser();
  if (!data.user) return false;
  const { data: profile } = await supa
    .from("profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();
  return Boolean(profile);
}

export async function signIn(
  email: string,
  password: string
): Promise<AuthResult & { player?: Player }> {
  const supa = getSupabase();
  if (!supa) return notConfiguredResult();

  let data;
  try {
    const res = await supa.auth.signInWithPassword({ email, password });
    if (res.error) {
      return { ok: false, error: friendlyAuthError(res.error) };
    }
    data = res.data;
  } catch (e) {
    // signInWithPassword can throw (not just return an error) on a hard
    // network failure; catch it so the sign-in button never hangs.
    return {
      ok: false,
      error: friendlyAuthError(e instanceof Error ? e.message : String(e)),
    };
  }
  if (!data.user) {
    return { ok: false, error: AUTH_ERROR_MESSAGES.serverError };
  }

  try {
    // Load the existing profile FIRST — never reset a returning user's data.
    let player = await getCurrentPlayer();
    if (!player) {
      // No profile row yet (e.g. first login after email confirmation):
      // create it from the signup metadata, then re-read.
      const metadata = data.user.user_metadata ?? {};
      const emailName = (data.user.email ?? email).split("@")[0] ?? emptyPlayer.name;
      const name = String(metadata.name ?? emailName);
      const familyCode = String(metadata.family_code ?? generateFamilyCode(name));
      const grade = Number(metadata.grade ?? 10);
      const gender = (metadata.gender ?? emptyPlayer.gender) as PlayerGender;
      const country = String(metadata.country ?? emptyPlayer.country);
      const role = (metadata.role ?? emptyPlayer.role) as FamilyRole;
      // signUp() stores both in user_metadata for exactly this path (a
      // confirmation-required signup whose profile is created at first
      // login). Without birth_year the 033 trigger refuses the insert.
      const birthYear = toIntOrNull(metadata.birth_year);
      const birthMonth = toBirthMonthOrNull(metadata.birth_month);
      const created = await ensureSupabaseProfile({
        userId: data.user.id,
        email: data.user.email ?? email,
        name,
        country,
        gender,
        grade,
        role,
        birthYear,
        birthMonth,
        familyCode,
        familyMode: (metadata.family_mode === "join" ? "join" : "create") as
          | "create"
          | "join",
      });
      if (!created.ok) return created;
      player =
        (await getCurrentPlayer()) ??
        buildPlayerFromAuthProfile({
          name,
          email: data.user.email ?? email,
          country,
          gender,
          grade,
          role,
          familyCode,
        });
    }
    return { ok: true, player };
  } catch (e) {
    return {
      ok: false,
      error: friendlyAuthError(e instanceof Error ? e.message : String(e)),
    };
  }
}

function buildPlayerFromAuthProfile(input: {
  name: string;
  email: string;
  country: string;
  gender: PlayerGender;
  grade: number;
  role: FamilyRole;
  familyCode: string;
}): Player {
  const graduationYear = getGradYearFromGrade(input.grade);
  return {
    ...emptyPlayer,
    name: input.name || input.email,
    // Not 7 — see lib/data/user.ts. A brand-new account has no UTR until the
    // person enters one, and `<= 0` is how the rest of the code says so.
    currentUTR: 0,
    graduationYear,
    commitmentDate: getDefaultCommitDate(graduationYear),
    gender: input.gender,
    country: input.country,
    role: input.role,
    familyCode: input.familyCode,
    targetSchoolSlugs: [],
    weaknesses: [],
    tournamentsPlanned: null,
    onboarded: false,
  };
}

export async function resendConfirmationEmail(email: string): Promise<AuthResult> {
  const supa = getSupabase();
  if (!supa) return { ok: false, error: "Supabase is not configured." };

  try {
    const { error } = await supa.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/login?confirmed=1`
            : undefined,
      },
    });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyAuthError(e) };
  }
}

export async function signOut(): Promise<void> {
  const supa = getSupabase();
  if (supa) await supa.auth.signOut();
}

// Sends a password-reset email with a link back to /reset-password.
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const supa = getSupabase();
  if (!supa) {
    return { ok: false, error: "Password reset needs Supabase configured." };
  }
  try {
    const { error } = await supa.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined,
    });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyAuthError(e) };
  }
}

// True when the user arrived via a recovery link (a session is present).
export async function hasRecoverySession(): Promise<boolean> {
  const supa = getSupabase();
  if (!supa) return false;
  const { data } = await supa.auth.getSession();
  return Boolean(data.session);
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const supa = getSupabase();
  if (!supa) return { ok: false, error: "Password reset needs Supabase configured." };
  try {
    const { error } = await supa.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyAuthError(e) };
  }
}

function toIntOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isInteger(n) ? n : null;
}

function toBirthMonthOrNull(value: unknown): number | null {
  const n = toIntOrNull(value);
  return n != null && n >= 1 && n <= 12 ? n : null;
}

function toEnrollmentTermOrNull(value: unknown): EnrollmentTerm | null {
  return (ENROLLMENT_TERMS as readonly string[]).includes(value as string)
    ? (value as EnrollmentTerm)
    : null;
}

/** The auth-user facts isEmailVerifiedFor() reads. Structural, so it accepts
 * a supabase-js `User` without importing its type here. */
export interface EmailVerificationAuthFacts {
  email?: string | null;
  identities?: Array<{
    provider?: string;
    identity_data?: Record<string, unknown> | null;
  }> | null;
}

/**
 * Migration 043, mirrored for the UI: has this account PROVEN it owns its
 * current email?
 *
 * The database decides (email_is_verified(), which join_family /
 * approve_family_join / grant_parent_consent call); this only lets a screen
 * know whether to offer "Confirm your email" before the person hits the
 * 42501. Same two halves as the SQL:
 *   1. profiles.email_verified_at is set AND email_verified_for is the
 *      account's CURRENT email (case-insensitive) — a later email change
 *      un-verifies, on purpose;
 *   2. or a Google identity whose verified email is the account's email.
 * NEVER auth.users.email_confirmed_at: production auto-confirms at sign-up,
 * so it is stamped for every account and proves nothing.
 */
export function isEmailVerifiedFor(
  profile: { email_verified_at?: string | null; email_verified_for?: string | null } | null | undefined,
  user: EmailVerificationAuthFacts | null | undefined
): boolean {
  const email = (user?.email ?? "").trim().toLowerCase();
  if (!email) return false;
  if (
    profile?.email_verified_at &&
    typeof profile.email_verified_for === "string" &&
    profile.email_verified_for.trim().toLowerCase() === email
  ) {
    return true;
  }
  return (user?.identities ?? []).some((identity) => {
    if (identity?.provider !== "google") return false;
    const data = identity.identity_data ?? {};
    const identityEmail = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const verified = data.email_verified === true || data.email_verified === "true";
    return verified && identityEmail === email;
  });
}

function mapProfileToPlayer(
  profile: any,
  fallbackEmail: string,
  authUser?: EmailVerificationAuthFacts | null
): Player {
  const graduationYear = resolveGraduationYear(profile) ?? emptyPlayer.graduationYear;
  return {
    ...emptyPlayer,
    name: profile.name || fallbackEmail || emptyPlayer.name,
    // A null current_utr becomes 0 ("not tracked"), never a plausible number.
    currentUTR: Number(profile.current_utr ?? emptyPlayer.currentUTR),
    graduationYear,
    commitmentDate: profile.commitment_date ?? getDefaultCommitDate(graduationYear),
    gender: (profile.gender ?? emptyPlayer.gender) as PlayerGender,
    country: profile.country ?? emptyPlayer.country,
    role: (profile.role ?? emptyPlayer.role) as FamilyRole,
    // DELIBERATELY the raw profile column, NOT my_family_code().
    //
    // This value is round-tripped straight back into the profile by
    // writeCurrentPlayerProfile() below, and 022/030/035's trigger REJECTS
    // any client change to family_code with 42501. A joiner's profile
    // carries NULL on purpose; substituting their real family code here
    // would turn every ordinary profile save — renaming yourself in
    // Settings — into "This profile field can only be changed by Seeded."
    // for every member who joined with a code.
    //
    // Nothing displays this. /family reads the shareable code from
    // loadMyFamilyCode() (the my_family_code() RPC), which answers for both
    // membership shapes. If you need "which family is this user in",
    // that is the function you want — see lib/db/family-scope.ts.
    familyCode: profile.family_code ?? undefined,
    targetSchoolSlugs:
      (profile.target_school_slugs as string[] | null) ??
      emptyPlayer.targetSchoolSlugs,
    weaknesses: profile.weaknesses ?? emptyPlayer.weaknesses,
    // NULL stays null ("Not set"). profiles.tournaments_played is not read:
    // no screen ever wrote it (049's header).
    tournamentsPlanned: toTournamentsPlannedOrNull(profile.tournaments_goal),
    onboarded: Boolean(profile.onboarded),
    // home_area/utr_profile_link/gpa/deletion_requested_at (migration
    // 014_profile_fields_and_deletion.sql) are read safely even before that
    // migration is applied: `select("*")` only ever returns columns that
    // actually exist, so these just come back undefined (not an error) on
    // an unmigrated database.
    homeArea: profile.home_area ?? emptyPlayer.homeArea,
    utrProfileLink: profile.utr_profile_link ?? emptyPlayer.utrProfileLink,
    gpa: profile.gpa != null ? Number(profile.gpa) : null,
    deletionRequestedAt: profile.deletion_requested_at ?? null,
    // Migration 041. Absent columns (an unmigrated database) read as null.
    birthMonth: toBirthMonthOrNull(profile.birth_month),
    enrollmentTerm: toEnrollmentTermOrNull(profile.enrollment_term),
    // Migration 043. See isEmailVerifiedFor() — never email_confirmed_at.
    emailVerified: isEmailVerifiedFor(profile, authUser ?? { email: fallbackEmail }),
  };
}

// Throws on a real Supabase/network failure so callers can tell "no profile
// row" apart from "couldn't reach Supabase" — never silently treat the two
// the same way (the latter must never look like a normal signed-out state).
// The caller's OWN profile row (a single-row read by id — the only shape
// lib/db/family-scope.test.ts allows). Throws on a real failure.
async function fetchOwnProfileRow(supa: TypedSupabaseClient, userId: string) {
  const { data: profile, error: profileError } = await supa
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  return profile;
}

/**
 * The tier read off the profile row the session restore already fetched,
 * so TierProvider does not have to fetch the same row again before a
 * PaidGate page can render (D8). READ-ONLY and short-lived; it is never
 * part of `Player`, so it can never be round-tripped back into a profile
 * write (subscription_tier is a privileged column). `refresh()` after a
 * checkout bypasses it and reads the database.
 */
let restoredTier: { userId: string; tier: string | null; at: number } | null = null;
const RESTORED_TIER_TTL_MS = 15_000;
export function takeRestoredTier(userId: string): string | null | undefined {
  const hit = restoredTier;
  restoredTier = null;
  if (!hit || hit.userId !== userId || Date.now() - hit.at > RESTORED_TIER_TTL_MS) return undefined;
  return hit.tier;
}

function playerFromOwnProfile(
  supa: TypedSupabaseClient,
  user: { id: string; email?: string | null } & EmailVerificationAuthFacts,
  profile: NonNullable<Awaited<ReturnType<typeof fetchOwnProfileRow>>>
): Player {
  const player = mapProfileToPlayer(profile, user.email ?? "", user);
  restoredTier = { userId: user.id, tier: profile.subscription_tier ?? null, at: Date.now() };

  // One-time migration: a legacy row stored only `grade`. Persist the
  // derived graduationYear now so future loads read it directly instead of
  // re-deriving it from a `grade` value that will only get staler.
  if (profile.graduation_year == null) {
    void supa
      .from("profiles")
      .update({ graduation_year: player.graduationYear })
      .eq("id", user.id);
  }

  return player;
}

export async function getCurrentPlayer(): Promise<Player | null> {
  const supa = getSupabase();
  if (!supa) return null;

  const { data: userData, error: userError } = await getAuthedUser(supa);
  if (userError || !userData.user) return null;

  const profile = await fetchOwnProfileRow(supa, userData.user.id);
  if (!profile) return null;
  return playerFromOwnProfile(supa, userData.user, profile);
}

export type SessionState =
  | { status: "authed"; player: Player }
  | { status: "signed-out" }
  | { status: "error"; message: string };

// Used on app load to restore a session. Unlike getCurrentPlayer(), this
// distinguishes "there is no session" (status: signed-out) from "Supabase
// could not be reached" (status: error) — the two must never be conflated,
// since a paused/unreachable backend should never silently look like a
// logged-out user.
export async function getSessionState(): Promise<SessionState> {
  const supa = getSupabase();
  if (!supa) return { status: "error", message: NOT_CONFIGURED_MESSAGE };

  try {
    // D8: start reading the profile row NOW, keyed by the user id in the
    // LOCALLY stored session, alongside the server's session check below,
    // instead of after it. The row is only used if the server then confirms
    // that very user — otherwise it is thrown away and the read is redone
    // for whoever the server says it is. So nothing is trusted that was not
    // trusted before; the two round trips just overlap. (RLS limits this
    // read to the caller's own row either way.)
    const { data: localSession } = await supa.auth.getSession();
    const localUserId = localSession.session?.user?.id ?? null;
    const earlyProfile = localUserId ? fetchOwnProfileRow(supa, localUserId) : null;
    // If it ends up unused (or the check fails first), its rejection must
    // not surface as an unhandled one.
    earlyProfile?.catch(() => {});

    const { data: userData, error: userError } = await getAuthedUser(supa);

    // A network failure here resolves as { error }, not a thrown exception —
    // supabase-js catches "Failed to fetch" into an AuthRetryableFetchError
    // internally (confirmed live: it even retries a few times first; this
    // is NOT a theoretical case, caught via a real simulated outage).
    // Treating every userError as "signed out" would silently log out an
    // already-authenticated user the moment Supabase is unreachable —
    // exactly the failure this whole status split exists to prevent.
    if (
      userError &&
      (userError.name === "AuthRetryableFetchError" ||
        isNetworkFailureMessage(userError.message))
    ) {
      return { status: "error", message: friendlyAuthError(userError) };
    }
    if (userError || !userData.user) return { status: "signed-out" };

    const verifiedId = userData.user.id;
    const profile =
      earlyProfile && verifiedId === localUserId
        ? await earlyProfile
        : await fetchOwnProfileRow(supa, verifiedId);
    if (!profile) return { status: "signed-out" };
    return { status: "authed", player: playerFromOwnProfile(supa, userData.user, profile) };
  } catch (e) {
    return {
      status: "error",
      message: friendlyAuthError(e instanceof Error ? e.message : String(e)),
    };
  }
}

// Returns whether the write actually succeeded — real signal the
// star-to-target optimistic update (lib/hooks/use-star-schools.ts) awaits
// to decide whether to silently roll back. "Nothing to fail against" (no
// backend configured, or signed out) counts as success: that's the same
// no-op this function has always been in those cases, not a new failure
// mode. A thrown exception (e.g. a genuine network error, OR the real
// write failing server-side with a specific message) is the one real
// failure case — this never propagates it, same as before; only the
// boolean changes.
export async function saveCurrentPlayer(player: Player): Promise<boolean> {
  try {
    return await saveCurrentPlayerOrThrow(player);
  } catch {
    return false;
  }
}

// The browser-side half of the generic profile-patch every settings/
// onboarding/profile-edit flow funnels through (updatePlayer() in
// lib/context/player-context.tsx). The actual Supabase upsert no longer
// happens here: this posts the full merged player to app/api/profile, the
// zod-validated route handler that supplies a request-scoped client and
// calls writeCurrentPlayerProfile (below) to perform the real write
// server-side — same "no browser-direct write" shape as every other
// migrated write path in lib/db/*. Preserves the exact pre-existing
// early-exit behavior (no backend configured, or signed out, both count
// as a no-op success) so this is a pure plumbing change, not a behavior
// change, for any of this function's many existing callers.
async function saveCurrentPlayerOrThrow(player: Player): Promise<boolean> {
  const supa = getSupabase();
  if (!supa) return true;

  const { data } = await getAuthedUser(supa);
  if (!data.user) return true;

  const { postJson } = await import("@/lib/api-client");
  await postJson("/api/profile", player);
  return true;
}

/** Used ONLY by app/api/profile's route handler, which passes its own
 * request-scoped, RLS-respecting client + already-authenticated user id/
 * email. writeCurrentPlayerProfile below uses this to do the real
 * Supabase write server-side — there's no browser-direct write path left
 * (see saveCurrentPlayerOrThrow's doc comment above). */
export interface PlayerWriteContext {
  supabase: TypedSupabaseClient;
  userId: string;
  userEmail: string | null;
}

/**
 * Performs the real profile upsert — moved verbatim out of
 * saveCurrentPlayerOrThrow, just re-targeted from the browser's own
 * Supabase client to the request-scoped one the route handler supplies.
 * Throws a specific Error on a real write failure (the route surfaces
 * `err.message` in its JSON response, same convention as every other
 * lib/db/* write function); resolves on success.
 */
/** A Player as the profile route hands it over. birthMonth,
 * enrollmentTerm and tournamentsPlanned may be ABSENT (an older client's
 * body never had them), and absent must stay absent: it means "leave the
 * stored value alone", which is not the same as null ("clear it"). */
export type PlayerProfileWrite = Omit<Player, "birthMonth" | "enrollmentTerm" | "tournamentsPlanned"> & {
  birthMonth?: number | null;
  enrollmentTerm?: Player["enrollmentTerm"];
  tournamentsPlanned?: number | null;
};

export async function writeCurrentPlayerProfile(
  player: PlayerProfileWrite,
  ctx: PlayerWriteContext
): Promise<void> {
  const base = {
    id: ctx.userId,
    email: ctx.userEmail,
    name: player.name,
    country: player.country,
    gender: player.gender,
    role: player.role,
    family_code: player.familyCode ?? null,
    // NULL, not 0. `profiles_current_utr_check` (migration 006, live on
    // production) is `current_utr is null or current_utr between 1 and 16.5`,
    // so writing the 0 sentinel raises 23514 and every profile write fails
    // for anyone who has not entered a UTR — found by a verification pass
    // after the sentinel landed, reproduced on staging.
    //
    // This is also the more honest shape: "not tracked" is NULL in the
    // database, 0 only in memory, and the two round-trip
    // (NULL -> 0 via mapProfileToPlayer, 0 -> NULL here).
    current_utr: player.currentUTR > 0 ? player.currentUTR : null,
    graduation_year: player.graduationYear,
    commitment_date: player.commitmentDate,
    target_school_slugs: player.targetSchoolSlugs,
    weaknesses: player.weaknesses,
    // "Tournaments planned this season" (049): the player's number or NULL
    // ("Not set"), sent only when the body carries the field — so a client
    // built before 049 (which posted tournamentsGoal: 12, stripped by the
    // route's schema) can never write the invented 12 back.
    // tournaments_played is never written: played is counted from
    // tournament_entries, not stored on the profile.
    ...(player.tournamentsPlanned !== undefined ? { tournaments_goal: player.tournamentsPlanned } : {}),
    onboarded: player.onboarded,
  };

  // home_area/utr_profile_link/gpa/deletion_requested_at (migration
  // 014_profile_fields_and_deletion.sql) may not be applied to the live
  // database yet — same "011/013 discipline" as remind_at/
  // tournament_entries: the migration file is tracked in git but not run
  // against the shared dev/prod Supabase project automatically. Try the
  // full row first; if Postgres rejects it for an undefined column
  // (42703), fall back to the base columns so every OTHER updatePlayer()
  // call across the app (onboarding, weaknesses, target schools,
  // tournament counts, ...) keeps working exactly as before instead of
  // silently failing because of these unrelated new fields.
  // Defensive second check right before the real write: every real UI path
  // (Settings' ProfileCard, pre-auth onboarding's save step) already
  // validates and normalizes this with the same lib/utr-profile-link.ts
  // rule, but updatePlayer() is a generic merge-patch any caller can hit —
  // this makes sure a malformed value never actually lands in Postgres
  // even if some future caller skips the form-level check, rather than
  // silently failing the whole profile write over one bad field.
  const linkCheck = validateUtrProfileLink(player.utrProfileLink ?? "");
  const { error } = await ctx.supabase.from("profiles").upsert({
    ...base,
    home_area: player.homeArea ?? null,
    utr_profile_link: linkCheck.valid ? linkCheck.normalized || null : null,
    gpa: player.gpa ?? null,
    deletion_requested_at: player.deletionRequestedAt ?? null,
    // Migration 041. birth_month is WRITE-ONCE (the 041 trigger refuses any
    // change once set), so it is sent only when the Player carries a value:
    // either the first fill-in or the stored value round-tripped unchanged.
    // Sending null would be a "change" once a month is stored.
    ...(player.birthMonth != null ? { birth_month: player.birthMonth } : {}),
    // Client-writable; sent only when the Player actually has the field, so
    // a Player built before 041 never wipes a stored term.
    ...(player.enrollmentTerm !== undefined ? { enrollment_term: player.enrollmentTerm } : {}),
    // email_verified_at / email_verified_for are NEVER written here (043:
    // privileged, set only by mark_email_verified()).
  });

  if (error?.code === "42703") {
    const { error: fallbackError } = await ctx.supabase.from("profiles").upsert(base);
    if (fallbackError) throw new Error(fallbackError.message);
    return;
  }

  if (error) throw new Error(error.message);
}

async function ensureSupabaseProfile(input: {
  userId: string;
  email: string;
  name: string;
  country: string;
  gender: PlayerGender;
  grade: number;
  role: FamilyRole;
  /** P0-8: written on INSERT only. The trigger turns it into
   * consent_status, and makes it write-once afterwards. */
  birthYear?: number | null;
  /** Migration 041: written on INSERT when known; write-once afterwards. */
  birthMonth?: number | null;
  familyCode: string;
  familyMode: "create" | "join";
}): Promise<AuthResult> {
  const supa = getSupabase();
  if (!supa) return { ok: true, familyCode: input.familyCode };

  const graduationYear = getGradYearFromGrade(input.grade);

  // --------------------------------------------------------------------
  // CREATE: this person is the first in the family, so they own the code.
  // Their membership is `profiles.family_code` — the one path migration 022
  // still allows, because it happens on INSERT.
  // --------------------------------------------------------------------
  if (input.familyMode === "create") {
    const { error: familyInsertError } = await supa
      .from("families")
      .insert({ code: input.familyCode, name: `${input.name}'s family` });
    // 23505 = someone already holds this code; the generator retries, so
    // treat it as fatal rather than silently joining a stranger's family.
    if (familyInsertError) {
      return familyInsertError.code === "23505"
        ? { ok: false, error: "Could not create your family. Try again." }
        : { ok: false, error: "Could not create your family. Try again." };
    }

    await supa
      .from("family_codes")
      .upsert({ code: input.familyCode, player_id: input.userId }, { onConflict: "code" });

    const { error: profileError } = await supa.from("profiles").insert({
      id: input.userId,
      name: input.name,
      email: input.email,
      country: input.country,
      gender: input.gender,
      role: input.role,
      birth_year: input.birthYear ?? null,
      birth_month: input.birthMonth ?? null,
      family_code: input.familyCode,
      graduation_year: graduationYear,
      commitment_date: getDefaultCommitDate(graduationYear),
      // No tournaments_goal: sign-up never asks for one, so the column's
      // NULL (049) is the truth. The diagnostic writes the player's answer
      // afterwards through writeCurrentPlayerProfile().
      onboarded: input.role === "parent",
    });
    if (profileError) return { ok: false, error: "Could not save your profile. Try again." };

    return { ok: true, familyCode: input.familyCode };
  }

  // --------------------------------------------------------------------
  // JOIN: everything about the family goes through join_family().
  //
  // Three things this deliberately does NOT do any more (P0-2, migration
  // 023 — each one used to be a hole, and each is now actively rejected by
  // the database):
  //   1. No `families` lookup to validate the code. `families` is readable
  //      by members only now, so a prospective member reads nothing and a
  //      perfectly good code would look invalid.
  //   2. No direct `parent_accounts` insert. There is no client INSERT
  //      policy; join_family() creates the row, as PENDING.
  //   3. No `family_code` on the profile. The joiner is linked through
  //      parent_accounts and stays pending until a member approves. Writing
  //      it here would both be rejected by 022 on the update path and
  //      silently grant the access the approval step exists to withhold.
  // --------------------------------------------------------------------
  const { error: profileError } = await supa.from("profiles").insert({
    id: input.userId,
    name: input.name,
    email: input.email,
    country: input.country,
    gender: input.gender,
    role: input.role,
    birth_year: input.birthYear ?? null,
    birth_month: input.birthMonth ?? null,
    graduation_year: graduationYear,
    commitment_date: getDefaultCommitDate(graduationYear),
    // No tournaments_goal — see the create branch above.
    onboarded: input.role === "parent",
  });
  if (profileError) return { ok: false, error: "Could not save your profile. Try again." };

  const join = await joinFamily(input.familyCode);

  // A wrong code is NOT a failed signup. The account exists and is usable;
  // the UI drops them on the pending screen, which offers "Wrong code?
  // Re-enter". Failing here would strand someone with an account they
  // cannot get back into.
  if (
    join.status === "invalid" ||
    join.status === "own_family" ||
    join.status === "rate_limited" ||
    // 045: the family is at its cap. Not a failed sign-up either — the
    // account exists; the screen shows join.message.
    join.status === "family_full"
  ) {
    return { ok: true, familyCode: input.familyCode, joinStatus: join.status };
  }
  if (join.status === "error") {
    return { ok: true, familyCode: input.familyCode, joinStatus: "error" };
  }

  return { ok: true, familyCode: input.familyCode, joinStatus: join.status };
}
