// "Tournaments planned this season" — the player's own number, or nothing.
//
// Stored in `profiles.tournaments_goal` (the column name is kept; migration
// 049). Until 049 every account carried a 12 nobody typed: sign-up wrote it,
// emptyPlayer carried it, and screens rendered "0/12" with a progress bar.
// NULL now means "Not set", and nothing in the app may supply a number the
// player did not give (lib/no-invented-goal.test.ts fails the build).
//
// "Played this season" is NOT stored on the profile any more. It is counted
// from the player's own tournament_entries rows marked Played (047) whose
// event date falls in the current season (lib/time.ts seasonKey()).
//
// Pure — no Supabase — so the diagnostic, Settings, the dashboards and the
// tests share one rule.

import type { TournamentEntryStatus } from "@/lib/tournament-status";
import { parseLocalDate, seasonKey } from "@/lib/time";

export const TOURNAMENTS_PLANNED_LABEL = "Tournaments planned this season";
export const TOURNAMENTS_PLANNED_NOT_SET = "Not set";

/** Mirrors 049's CHECK (`tournaments_goal between 0 and 60`). A sanity
 * ceiling on what can be stored — not a target anyone is steered towards. */
export const TOURNAMENTS_PLANNED_MAX = 60;

export const TOURNAMENTS_PLANNED_ERROR = `Enter a whole number from 0 to ${TOURNAMENTS_PLANNED_MAX}.`;

/** Typed text → the count. Empty is not an error: it is "Not set". */
export function parseTournamentsPlannedText(text: string): { value: number | null; error: string | null } {
  const t = text.trim();
  if (!t) return { value: null, error: null };
  if (!/^\d{1,2}$/.test(t)) return { value: null, error: TOURNAMENTS_PLANNED_ERROR };
  const v = Number(t);
  return v <= TOURNAMENTS_PLANNED_MAX ? { value: v, error: null } : { value: null, error: TOURNAMENTS_PLANNED_ERROR };
}

/** A stored value → the count, or null. Anything that is not a whole
 * number in range is treated as not set, never coerced to a plausible one. */
export function toTournamentsPlannedOrNull(raw: unknown): number | null {
  if (raw == null) return null;
  const v = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(v) && v >= 0 && v <= TOURNAMENTS_PLANNED_MAX ? v : null;
}

/** lib/time.ts seasonKey()'s shape, mirrored by 049's CHECK on
 * profiles.tournaments_planned_season. */
export const SEASON_KEY_PATTERN = /^(fall|winter|spring|summer)-[0-9]{4}$/;

export function isSeasonKey(v: unknown): v is string {
  return typeof v === "string" && SEASON_KEY_PATTERN.test(v);
}

/** The count, ONLY if it was set for the season `now` is in. A count from
 * an earlier season is "Not set" now: a fall plan must not sit next to a
 * winter played-count that has reset to 0. Every screen reads the planned
 * count through this (lib/no-invented-goal.test.ts). */
export function plannedThisSeason(
  p: { tournamentsPlanned: number | null; tournamentsPlannedSeason: string | null },
  now: Date = new Date()
): number | null {
  if (p.tournamentsPlanned == null) return null;
  return p.tournamentsPlannedSeason === seasonKey(now) ? p.tournamentsPlanned : null;
}

/** What to save when the player sets (or clears) the count: the value plus
 * the season it is for — NULL for both when cleared. */
export function stampTournamentsPlanned(
  value: number | null,
  now: Date = new Date()
): { tournamentsPlanned: number | null; tournamentsPlannedSeason: string | null } {
  return { tournamentsPlanned: value, tournamentsPlannedSeason: value == null ? null : seasonKey(now) };
}

export function formatTournamentsPlanned(v: number | null | undefined): string {
  return v == null ? TOURNAMENTS_PLANNED_NOT_SET : String(v);
}

/** How many of these entries were PLAYED in the season `now` is in. The
 * caller passes one player's entries (never a pooled family list). */
export function countPlayedThisSeason(
  entries: ReadonlyArray<{ status: TournamentEntryStatus; eventDate: string }>,
  now: Date = new Date()
): number {
  const current = seasonKey(now);
  return entries.filter((e) => e.status === "played" && e.eventDate && seasonKey(parseLocalDate(e.eventDate)) === current)
    .length;
}
