// Real persisted storage for /plan's recruiting-timeline checklist
// (migration 016_recruiting_checklist.sql). Pure data access — the actual
// default-item list and date math live in lib/recruiting-checklist.ts;
// this file only ever reads/writes the player's own completed/hidden/
// custom-item state.
import type { RecruitingChecklistState } from "@/lib/recruiting-checklist";
import { getAuthedUser, getSupabase } from "./client";

interface ChecklistRow {
  item_key: string;
  is_custom: boolean;
  label: string | null;
  completed: boolean;
  hidden: boolean;
}

async function userId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await getAuthedUser(supabase);
  return data.user?.id ?? null;
}

const EMPTY_STATE: RecruitingChecklistState = { completedIds: [], hiddenIds: [], customItems: [] };

/** Every row the player has ever touched (checked, hidden, or added as
 * custom) — rows that never diverged from the default (not completed, not
 * hidden) simply don't exist, so an empty table reads as "nothing checked
 * off yet," never an error. */
export async function loadRecruitingChecklistState(
  signal?: AbortSignal
): Promise<RecruitingChecklistState> {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id) return EMPTY_STATE;

  let query = supabase
    .from("recruiting_checklist_items")
    .select("item_key, is_custom, label, completed, hidden")
    .eq("user_id", id);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) return EMPTY_STATE;

  const rows = (data ?? []) as ChecklistRow[];
  const completedIds = rows.filter((r) => r.completed).map((r) => r.item_key);
  const hiddenIds = rows.filter((r) => r.hidden).map((r) => r.item_key);
  const customItems = rows
    .filter((r) => r.is_custom)
    .map((r) => ({ id: r.item_key, label: r.label ?? "" }));

  return { completedIds, hiddenIds, customItems };
}

/** Upserts the full completed/hidden pair for one item — callers always
 * pass both (the caller already holds the merged item from
 * mergeRecruitingChecklist and is only flipping one of the two), so this
 * never has to read-then-merge against a stale row. */
export async function setRecruitingChecklistItemState(
  itemKey: string,
  patch: { completed: boolean; hidden: boolean }
): Promise<boolean> {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id) return false;

  const { error } = await supabase.from("recruiting_checklist_items").upsert(
    {
      user_id: id,
      item_key: itemKey,
      is_custom: false,
      completed: patch.completed,
      hidden: patch.hidden,
    },
    { onConflict: "user_id,item_key" }
  );
  return !error;
}

/** Adds a player-authored checklist item. Returns the real row's item_key
 * (a fresh uuid, not the custom label) so the caller can address it in
 * later toggle/remove calls — null on a real write failure. */
export async function addCustomRecruitingChecklistItem(label: string): Promise<string | null> {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id) return null;

  const itemKey =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const { error } = await supabase.from("recruiting_checklist_items").insert({
    user_id: id,
    item_key: itemKey,
    is_custom: true,
    label,
    completed: false,
    hidden: false,
  });
  return error ? null : itemKey;
}

/** Permanently deletes a custom item (not just hides it — hiding is for
 * default items the player wants out of view but could reasonably
 * un-hide; a custom item the player removes was their own addition, so a
 * real delete is the honest action). */
export async function removeCustomRecruitingChecklistItem(itemKey: string): Promise<boolean> {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id) return false;

  const { error } = await supabase
    .from("recruiting_checklist_items")
    .delete()
    .eq("user_id", id)
    .eq("item_key", itemKey)
    .eq("is_custom", true);
  return !error;
}
