// Real storage for tournaments a family is tracking or has entered — the
// "Upcoming tournaments" list on /events. Backed by `tournament_entries`
// (migration 013_tournament_entries.sql — not yet applied to the live
// database, see that file's header, same discipline as
// 011_outreach_stages.sql). Until the migration is run, loadTournamentEntries
// degrades to [] the same way every other not-yet-existing table does
// elsewhere in this file's siblings (loadMatches, loadDailyCheckins).
import { LEVELS, UTR_MAX, UTR_MIN, type FitLevel } from "@/lib/tournament-fit";
import { getAuthedUser, getSupabase } from "./client";

export type TournamentEntryStatus = "saved" | "entered";

export interface TournamentEntry {
  id: string;
  name: string;
  level: FitLevel;
  eventDate: string; // ISO date (yyyy-mm-dd)
  city: string;
  state: string;
  travelHours: number | null;
  distanceMiles: number | null;
  drawUtr: number | null;
  goalUtr: number | null;
  entryCost: number | null;
  travelCost: number | null;
  status: TournamentEntryStatus;
  createdAt: string;
}

export interface NewTournamentEntryInput {
  name: string;
  level: FitLevel;
  eventDate: string;
  city: string;
  state: string;
  travelHours?: number | null;
  distanceMiles?: number | null;
  drawUtr?: number | null;
  goalUtr?: number | null;
  entryCost?: number | null;
  travelCost?: number | null;
}

/**
 * Validates a tournament-entry save before it ever reaches Supabase. Pure —
 * no network, no auth — so both /events and the (separately rebuilt)
 * Tournament Fit screen's "Add to my events" button can check an entry
 * client-side before calling saveTournamentEntry, and so this logic is
 * unit-testable without a live database. Returns a user-facing error
 * string, or null when the input is valid.
 */
export function validateTournamentEntryInput(input: NewTournamentEntryInput): string | null {
  if (!input.name || !input.name.trim()) return "Tournament name is required.";
  if (!LEVELS.some((l) => l.value === input.level)) return "Choose a valid tournament level.";
  if (!input.eventDate || Number.isNaN(Date.parse(input.eventDate))) {
    return "Enter a valid tournament date.";
  }
  if (!input.city || !input.city.trim()) return "City is required.";
  if (!input.state || !input.state.trim()) return "State is required.";

  const utrFields: [string, number | null | undefined][] = [
    ["Draw UTR", input.drawUtr],
    ["Goal UTR", input.goalUtr],
  ];
  for (const [label, value] of utrFields) {
    if (value != null && (!Number.isFinite(value) || value < UTR_MIN || value > UTR_MAX)) {
      return `${label} must be between ${UTR_MIN} and ${UTR_MAX}.`;
    }
  }

  const nonNegativeFields: [string, number | null | undefined][] = [
    ["Travel hours", input.travelHours],
    ["Distance", input.distanceMiles],
    ["Entry cost", input.entryCost],
    ["Travel cost", input.travelCost],
  ];
  for (const [label, value] of nonNegativeFields) {
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      return `${label} can't be negative.`;
    }
  }

  return null;
}

// Mirrors userIdAndProfile() in features.ts — kept as a local copy rather
// than a shared export so this file has the same "no hidden cross-module
// coupling" shape as training.ts/utr.ts, which each define their own user
// resolution too.
async function userIdAndProfile(): Promise<{ id: string | null; profile: any | null }> {
  const supabase = getSupabase();
  if (!supabase) return { id: null, profile: null };
  const { data: userData } = await getAuthedUser(supabase);
  const id = userData.user?.id ?? null;
  if (!id) return { id: null, profile: null };
  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return { id, profile: profileData };
}

function mapTournamentEntry(row: any): TournamentEntry {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    eventDate: row.event_date,
    city: row.city ?? "",
    state: row.state ?? "",
    travelHours: row.travel_hours == null ? null : Number(row.travel_hours),
    distanceMiles: row.distance_miles == null ? null : Number(row.distance_miles),
    drawUtr: row.draw_utr == null ? null : Number(row.draw_utr),
    goalUtr: row.goal_utr == null ? null : Number(row.goal_utr),
    entryCost: row.entry_cost == null ? null : Number(row.entry_cost),
    travelCost: row.travel_cost == null ? null : Number(row.travel_cost),
    status: row.status === "entered" ? "entered" : "saved",
    createdAt: row.created_at,
  };
}

/**
 * Loads the signed-in player's (or their family's) saved/entered
 * tournaments, soonest first, for /events' "Upcoming tournaments" list.
 */
export async function loadTournamentEntries(signal?: AbortSignal): Promise<TournamentEntry[]> {
  const supabase = getSupabase();
  const { id, profile: p } = await userIdAndProfile();
  if (!supabase || !id) return [];
  let query = supabase
    .from("tournament_entries")
    .select("*")
    .order("event_date", { ascending: true });
  query = p?.role === "parent" && p?.family_code ? query.eq("family_code", p.family_code) : query.eq("user_id", id);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map(mapTournamentEntry);
}

/**
 * Saves (adds, or updates when `id` is passed) a tournament the player is
 * tracking or has entered. This is the single real write path behind
 * /events' own "Upcoming tournaments" list — and it's the function the
 * (separately rebuilt) Tournament Fit screen's "Add to my events" button
 * should call, passing the same tournament it just scored with
 * evaluateTournamentFit, so the two screens never disagree about what
 * "saved" means.
 *
 * Throws if `input` fails validateTournamentEntryInput, or if the Supabase
 * write itself fails — including "relation does not exist" until migration
 * 013_tournament_entries.sql is applied, the same way saveMatch/
 * saveCoachOutreachStatus already surface write failures to their callers.
 * Returns null only when there's no signed-in user to save against.
 */
export async function saveTournamentEntry(
  input: NewTournamentEntryInput & { id?: string; status?: TournamentEntryStatus }
): Promise<TournamentEntry | null> {
  const validationError = validateTournamentEntryInput(input);
  if (validationError) throw new Error(validationError);

  const supabase = getSupabase();
  const { id: userId, profile: p } = await userIdAndProfile();
  if (!supabase || !userId) return null;

  const row = {
    id: input.id,
    user_id: userId,
    family_code: p?.family_code ?? null,
    name: input.name.trim(),
    level: input.level,
    event_date: input.eventDate,
    city: input.city.trim(),
    state: input.state.trim(),
    travel_hours: input.travelHours ?? null,
    distance_miles: input.distanceMiles ?? null,
    draw_utr: input.drawUtr ?? null,
    goal_utr: input.goalUtr ?? null,
    entry_cost: input.entryCost ?? null,
    travel_cost: input.travelCost ?? null,
    status: input.status ?? "saved",
  };
  const { data, error } = await supabase.from("tournament_entries").upsert(row).select("*").single();
  if (error) throw new Error(error.message);
  return mapTournamentEntry(data);
}

/**
 * Flips a saved tournament to "entered" (or back to "saved") — the real
 * action behind /events' Enter/Save buttons. A thin update rather than a
 * full saveTournamentEntry() call so toggling status never risks
 * clobbering the rest of a row with stale client state.
 */
export async function setTournamentEntryStatus(id: string, status: TournamentEntryStatus): Promise<void> {
  const supabase = getSupabase();
  const { id: userId } = await userIdAndProfile();
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from("tournament_entries")
    .update({ status })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Removes a tracked tournament entirely (not surfaced in /events yet — kept for symmetry with the rest of this module's CRUD). */
export async function deleteTournamentEntry(id: string): Promise<void> {
  const supabase = getSupabase();
  const { id: userId } = await userIdAndProfile();
  if (!supabase || !userId) return;
  const { error } = await supabase.from("tournament_entries").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
