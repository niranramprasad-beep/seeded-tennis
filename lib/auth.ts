import type { FamilyRole, Player, PlayerGender } from "@/lib/types";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { sampledPlayer } from "@/lib/data/user";

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

export interface StoredAccount extends AccountInput {
  familyCode: string;
}

export function graduationYearForGrade(grade: number): number {
  const now = new Date();
  const schoolYearEnd =
    now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
  return schoolYearEnd + (12 - grade);
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

const LOCAL_USERS_KEY = "seeded.localUsers";
const LOCAL_FAMILIES_KEY = "seeded.localFamilies";

function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// Create an account. Uses real Supabase Auth + profile/family tables when
// configured; otherwise simulates everything in the browser so the flow works
// end-to-end before keys are added.
export async function signUp(
  input: AccountInput,
  family: FamilyChoice
): Promise<AuthResult> {
  const supa = getSupabase();

  // Resolve the family code (create new or validate join).
  let familyCode: string;
  if (family.mode === "create") {
    familyCode = generateFamilyCode(input.name);
  } else {
    familyCode = family.code.trim().toUpperCase();
    if (!familyCode) return { ok: false, error: "Enter a family code to join." };
  }

  if (supa) {
    const { data, error } = await supa.auth.signUp({
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
    if (error) return { ok: false, error: error.message };

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

  // --- Local fallback ---
  const users = readLocal<Record<string, AccountInput & { familyCode: string }>>(
    LOCAL_USERS_KEY,
    {}
  );
  if (users[input.email.toLowerCase()]) {
    return { ok: false, error: "An account with that email already exists." };
  }
  const families = readLocal<string[]>(LOCAL_FAMILIES_KEY, []);
  if (family.mode === "join" && !families.includes(familyCode)) {
    // For the demo we accept any well-formed code, but record it.
    families.push(familyCode);
  }
  if (family.mode === "create") families.push(familyCode);
  writeLocal(LOCAL_FAMILIES_KEY, families);
  users[input.email.toLowerCase()] = { ...input, familyCode };
  writeLocal(LOCAL_USERS_KEY, users);
  return { ok: true, familyCode };
}

export async function signIn(
  email: string,
  password: string
): Promise<AuthResult & { account?: StoredAccount; player?: Player }> {
  const supa = getSupabase();
  if (supa) {
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    if (data.user) {
      const metadata = data.user.user_metadata ?? {};
      const familyCode = String(metadata.family_code ?? generateFamilyCode(metadata.name ?? email));
      const grade = Number(metadata.grade ?? sampledPlayer.grade);
      const profileResult = await ensureSupabaseProfile({
        userId: data.user.id,
        email: data.user.email ?? email,
        name: String(metadata.name ?? data.user.email ?? sampledPlayer.name),
        country: String(metadata.country ?? sampledPlayer.country),
        gender: (metadata.gender ?? sampledPlayer.gender) as PlayerGender,
        grade,
        role: (metadata.role ?? sampledPlayer.role) as FamilyRole,
        familyCode,
        familyMode: (metadata.family_mode === "join" ? "join" : "create") as "create" | "join",
      });
      if (!profileResult.ok) return profileResult;
    }
    const player = data.user ? await getCurrentPlayer() : undefined;
    return { ok: true, player: player ?? undefined };
  }
  const users = readLocal<Record<string, StoredAccount>>(
    LOCAL_USERS_KEY,
    {}
  );
  const account = users[email.toLowerCase()];
  if (!account) return { ok: false, error: "No account found. Try signing up." };
  if (account.password !== password)
    return { ok: false, error: "Incorrect password." };
  return { ok: true, account };
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

export async function getCurrentPlayer(): Promise<Player | null> {
  const supa = getSupabase();
  if (!supa) return null;

  const { data: userData, error: userError } = await supa.auth.getUser();
  if (userError || !userData.user) return null;

  const { data: profile } = await supa
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    ...sampledPlayer,
    name: profile.name || userData.user.email || sampledPlayer.name,
    currentUTR: Number(profile.current_utr ?? sampledPlayer.currentUTR),
    grade: Number(profile.grade ?? sampledPlayer.grade),
    graduationYear: Number(
      profile.graduation_year ?? graduationYearForGrade(profile.grade ?? sampledPlayer.grade)
    ),
    commitmentDate:
      profile.commitment_date ??
      `${graduationYearForGrade(profile.grade ?? sampledPlayer.grade) - 1}-09-01`,
    gender: (profile.gender ?? sampledPlayer.gender) as PlayerGender,
    country: profile.country ?? sampledPlayer.country,
    role: (profile.role ?? sampledPlayer.role) as FamilyRole,
    familyCode: profile.family_code ?? undefined,
    targetSchoolSlugs:
      (profile.target_school_slugs as string[] | null) ??
      sampledPlayer.targetSchoolSlugs,
    weaknesses: profile.weaknesses ?? sampledPlayer.weaknesses,
    tournamentsPlayed: Number(
      profile.tournaments_played ?? sampledPlayer.tournamentsPlayed
    ),
    tournamentsGoal: Number(profile.tournaments_goal ?? sampledPlayer.tournamentsGoal),
    onboarded: Boolean(profile.onboarded),
  };
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
    grade: player.grade,
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
  }

  const graduationYear = graduationYearForGrade(input.grade);
  const { error: profileError } = await supa.from("profiles").upsert({
    id: input.userId,
    name: input.name,
    email: input.email,
    country: input.country,
    gender: input.gender,
    grade: input.grade,
    role: input.role,
    family_code: input.familyCode,
    graduation_year: graduationYear,
    commitment_date: `${graduationYear - 1}-09-01`,
    current_utr: 7,
    tournaments_goal: 12,
    onboarded: false,
  });

  if (profileError) return { ok: false, error: profileError.message };
  return { ok: true, familyCode: input.familyCode };
}
