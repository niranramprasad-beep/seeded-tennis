import { getSupabase } from "./client";

export interface UtrEntry {
  id: string;
  utr: number;
  recordedAt: string;
  note: string;
}

async function getUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function loadUtrEntries(): Promise<UtrEntry[]> {
  const supabase = getSupabase();
  const userId = await getUserId();
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from("utr_entries")
    .select("id, utr, recorded_at, note")
    .eq("user_id", userId)
    .order("recorded_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    // Keep the dashboard usable if the migration has not been applied yet.
    if (error.code === "42P01") return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((entry: any) => ({
    id: entry.id,
    utr: Number(entry.utr),
    recordedAt: entry.recorded_at,
    note: entry.note ?? "",
  }));
}

export async function createUtrEntry(input: {
  utr: number;
  recordedAt: string;
  note?: string;
}): Promise<UtrEntry | null> {
  const supabase = getSupabase();
  const userId = await getUserId();
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from("utr_entries")
    .insert({
      user_id: userId,
      utr: input.utr,
      recorded_at: input.recordedAt,
      note: input.note?.trim() || null,
    })
    .select("id, utr, recorded_at, note")
    .single();

  if (error) throw new Error(error.message);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ current_utr: input.utr })
    .eq("id", userId);

  if (profileError) throw new Error(profileError.message);

  return {
    id: data.id,
    utr: Number(data.utr),
    recordedAt: data.recorded_at,
    note: data.note ?? "",
  };
}
