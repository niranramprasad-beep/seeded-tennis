import type { FamilyRole, Player, PlayerGender } from "@/lib/types";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { emptyPlayer } from "@/lib/data/user";
import { getDefaultCommitDate, getGradYearFromGrade, resolveGraduationYear } from "@/lib/time";

export { isSupabaseConfigured };

export interface AccountInput {
  name: string;
  email: string;
  password: string;
  country: string;
  gender: PlayerGender;
  grade: number;
  role: "player" | "parent";
}

export type FamilyChoice =
  | { mode: "create" }
  | { mode: "join"; code: string };

export interface AuthResult {
  ok: boolean;
  error?: string;
  familyCode?: string;
  confirmationRequired?: boolean;
}

export function generateFamilyCode(name: string): string {
  const prefix =
    (name.split(/\s+/)[0] || "TEAM").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) ||
    "TEAM";
  const rand = Math.random()
    .toString(36)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4)
    .padEnd(4, "X");
  return `${prefix}-${rand}`;
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

// Turn raw Supabase/network error strings into something a player can act on.
// A bare "Failed to fetch" almost always means the request never reached
// Supabase — the project is paused, the URL env var is wrong, or the network
// is down — so say that instead of leaking the developer-level message.
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("fetch failed")
  ) {
    return "Can't reach the server right now. Check your connection, or the Seeded backend may be temporarily unavailable. Please try again in a moment.";
  }
  if (m.includes("not confirmed")) {
    return "Check your inbox to confirm your email.";
  }
  return message;
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
          family_code: familyCode,
          family_mode: family.mode,
        },
      },
    });
    if (res.error) return { ok: false, error: friendlyAuthError(res.error.message) };
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
  if (!userId) return { ok: false, error: "Supabase did not return a user id." };
  const profileResult = await ensureSupabaseProfile({
    userId,
    email: input.email,
    name: input.name,
    country: input.country,
    gender: input.gender,
    grade: input.grade,
    role: input.role,
    familyCode,
    familyMode: family.mode,
  });
  if (!profileResult.ok) return profileResult;

  return { ok: true, familyCode };
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
      return { ok: false, error: friendlyAuthError(res.error.message) };
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
    return { ok: false, error: "Supabase did not return a signed-in user." };
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
      const created = await ensureSupabaseProfile({
        userId: data.user.id,
        email: data.user.email ?? email,
        name,
        country,
        gender,
        grade,
        role,
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
    currentUTR: 7,
    graduationYear,
    commitmentDate: getDefaultCommitDate(graduationYear),
    gender: input.gender,
    country: input.country,
    role: input.role,
    familyCode: input.familyCode,
    targetSchoolSlugs: [],
    weaknesses: [],
    tournamentsPlayed: 0,
    tournamentsGoal: 12,
    onboarded: false,
  };
}

export async function resendConfirmationEmail(email: string): Promise<AuthResult> {
  const supa = getSupabase();
  if (!supa) return { ok: false, error: "Supabase is not configured." };

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

  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
  const { error } = await supa.auth.resetPasswordForEmail(email, {
    redirectTo:
      typeof window !== "undefined"
        ? `${window.location.origin}/reset-password`
        : undefined,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
  const { error } = await supa.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function mapProfileToPlayer(profile: any, fallbackEmail: string): Player {
  const graduationYear = resolveGraduationYear(profile) ?? emptyPlayer.graduationYear;
  return {
    ...emptyPlayer,
    name: profile.name || fallbackEmail || emptyPlayer.name,
    currentUTR: Number(profile.current_utr ?? emptyPlayer.currentUTR),
    graduationYear,
    commitmentDate: profile.commitment_date ?? getDefaultCommitDate(graduationYear),
    gender: (profile.gender ?? emptyPlayer.gender) as PlayerGender,
    country: profile.country ?? emptyPlayer.country,
    role: (profile.role ?? emptyPlayer.role) as FamilyRole,
    familyCode: profile.family_code ?? undefined,
    targetSchoolSlugs:
      (profile.target_school_slugs as string[] | null) ??
      emptyPlayer.targetSchoolSlugs,
    weaknesses: profile.weaknesses ?? emptyPlayer.weaknesses,
    tournamentsPlayed: Number(
      profile.tournaments_played ?? emptyPlayer.tournamentsPlayed
    ),
    tournamentsGoal: Number(profile.tournaments_goal ?? emptyPlayer.tournamentsGoal),
    onboarded: Boolean(profile.onboarded),
  };
}

// Throws on a real Supabase/network failure so callers can tell "no profile
// row" apart from "couldn't reach Supabase" — never silently treat the two
// the same way (the latter must never look like a normal signed-out state).
export async function getCurrentPlayer(): Promise<Player | null> {
  const supa = getSupabase();
  if (!supa) return null;

  const { data: userData, error: userError } = await supa.auth.getUser();
  if (userError || !userData.user) return null;

  const { data: profile, error: profileError } = await supa
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) return null;

  const player = mapProfileToPlayer(profile, userData.user.email ?? "");

  // One-time migration: a legacy row stored only `grade`. Persist the
  // derived graduationYear now so future loads read it directly instead of
  // re-deriving it from a `grade` value that will only get staler.
  if (profile.graduation_year == null) {
    void supa
      .from("profiles")
      .update({ graduation_year: player.graduationYear })
      .eq("id", userData.user.id);
  }

  return player;
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
    const { data: userData, error: userError } = await supa.auth.getUser();
    if (userError || !userData.user) return { status: "signed-out" };

    const player = await getCurrentPlayer();
    if (!player) return { status: "signed-out" };
    return { status: "authed", player };
  } catch (e) {
    return {
      status: "error",
      message: friendlyAuthError(e instanceof Error ? e.message : String(e)),
    };
  }
}

export async function saveCurrentPlayer(player: Player): Promise<void> {
  const supa = getSupabase();
  if (!supa) return;

  const { data } = await supa.auth.getUser();
  if (!data.user) return;

  await supa.from("profiles").upsert({
    id: data.user.id,
    email: data.user.email,
    name: player.name,
    country: player.country,
    gender: player.gender,
    role: player.role,
    family_code: player.familyCode ?? null,
    current_utr: player.currentUTR,
    graduation_year: player.graduationYear,
    commitment_date: player.commitmentDate,
    target_school_slugs: player.targetSchoolSlugs,
    weaknesses: player.weaknesses,
    tournaments_played: player.tournamentsPlayed,
    tournaments_goal: player.tournamentsGoal,
    onboarded: player.onboarded,
  });
}

async function ensureSupabaseProfile(input: {
  userId: string;
  email: string;
  name: string;
  country: string;
  gender: PlayerGender;
  grade: number;
  role: FamilyRole;
  familyCode: string;
  familyMode: "create" | "join";
}): Promise<AuthResult> {
  const supa = getSupabase();
  if (!supa) return { ok: true, familyCode: input.familyCode };

  if (input.familyMode === "join") {
    const { data: fam, error: familyLookupError } = await supa
      .from("families")
      .select("code")
      .eq("code", input.familyCode)
      .maybeSingle();
    if (familyLookupError) return { ok: false, error: familyLookupError.message };
    if (!fam) return { ok: false, error: "That family code wasn't found." };
  } else {
    const { error: familyInsertError } = await supa
      .from("families")
      .insert({ code: input.familyCode, name: `${input.name}'s family` });
    if (familyInsertError && familyInsertError.code !== "23505") {
      return { ok: false, error: familyInsertError.message };
    }
    await supa
      .from("family_codes")
      .upsert({ code: input.familyCode, player_id: input.userId }, { onConflict: "code" });
  }

  const graduationYear = getGradYearFromGrade(input.grade);
  const { error: profileError } = await supa.from("profiles").upsert({
    id: input.userId,
    name: input.name,
    email: input.email,
    country: input.country,
    gender: input.gender,
    role: input.role,
    family_code: input.familyCode,
    graduation_year: graduationYear,
    commitment_date: getDefaultCommitDate(graduationYear),
    current_utr: 7,
    tournaments_goal: 12,
    onboarded: input.role === "parent",
  });

  if (profileError) return { ok: false, error: profileError.message };

  if (input.role === "parent") {
    const { error: parentError } = await supa.from("parent_accounts").upsert(
      {
        user_id: input.userId,
        family_code: input.familyCode,
        relationship: "parent",
      },
      { onConflict: "user_id,family_code" }
    );
    if (parentError) return { ok: false, error: parentError.message };
  }

  return { ok: true, familyCode: input.familyCode };
}
