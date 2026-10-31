import { getAuthedUser, getSupabase } from "./client";

export interface UtrEntry {
  id: string;
  utr: number;
  recordedAt: string;
  note: string;
}

async function getUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await getAuthedUser(supabase);
  return data.user?.id ?? null;
}

// Plain read — utr_entries' RLS policy is exactly "auth.uid() = user_id",
// identical to what this query wants, so there's nothing to gain from
// resolving the user id first and filtering by it client-side: skipping
// straight to the query (RLS does the scoping) saves one whole network
// round-trip per load, and an unauthenticated/signed-out call just comes
// back empty instead of needing a separate check.
export async function loadUtrEntries(signal?: AbortSignal): Promise<UtrEntry[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase
    .from("utr_entries")
    .select("id, utr, recorded_at, note")
    .order("recorded_at", { ascending: true })
    .order("created_at", { ascending: true });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;

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

  // The profile's current_utr must always reflect whichever entry is most
  // recently DATED, not whichever one was just logged — backfilling an
  // older result (e.g. adding a missed April reading after already being
  // ahead of it) must never override a newer value already on record.
  const { data: latest, error: latestError } = await supabase
    .from("utr_entries")
    .select("utr")
    .eq("user_id", userId)
    .order("recorded_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latestError) throw new Error(latestError.message);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ current_utr: latest.utr })
    .eq("id", userId);

  if (profileError) throw new Error(profileError.message);

  return {
    id: data.id,
    utr: Number(data.utr),
    recordedAt: data.recorded_at,
    note: data.note ?? "",
  };
}
