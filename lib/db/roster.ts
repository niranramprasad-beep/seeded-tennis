// The roster page data (migrations 054, 055): a program's official roster by
// name and its coaching staff, each row with the page it was read from.
// Public catalog data, read with the publishable key and no session (like
// lib/db/programs.ts). Empty — never a throw — when the program has no rows,
// 054/055 is not on the database, or the read fails: the page then shows
// what it showed before.
//
// The roster is read ONLY through program_roster_page() (055), which returns
// each rating as floor(utr) — the exact `utr` column (and the old home-town
// column) is not granted to anon/authenticated at all since 055 (Niran, 2026-11-27).
// lib/db/roster-private-ratings.test.ts fails the build if this file selects
// `utr` from the table again.

import type { SupabaseClient } from "@supabase/supabase-js";
import { publicClient } from "./programs";

/** A roster row on the server, before it is handed to the page. Since 055
 *  the loader fills `utr` with the WHOLE number program_roster_page()
 *  returns — the database never gives this module the exact rating.
 *  toRosterPlayer's floor is a second guard, not the only one. */
export interface RosterRow {
  name: string;
  classLabel: string | null;
  gradYear: number | null;
  utr: number | null;
  utrReliable: boolean;
  utrProfileUrl: string | null;
  readDate: string;
}

/**
 * A roster row as a page receives it (Niran, 2026-11-27): a college
 * player's rating as its WHOLE-NUMBER band only — 12.37 is 12, shown
 * "12.xx" — never the exact number. The exact rating stays in the database
 * for the team range; it is dropped here, on the server, so it is in
 * neither the page nor its source (this object is serialized into the
 * client school page). The player's UTR profile link is kept: it opens the
 * player's own public profile. Hometown is gone from the page entirely,
 * and from this read.
 */
export interface RosterPlayer {
  name: string;
  classLabel: string | null;
  gradYear: number | null;
  /** Math.floor of the exact rating, or null without one. */
  utrWhole: number | null;
  utrReliable: boolean;
  utrProfileUrl: string | null;
  readDate: string;
}

/** 12.37 → 12. The one banding rule for a college player's rating. */
export function rosterUtrWhole(utr: number | null): number | null {
  return utr === null || !Number.isFinite(utr) ? null : Math.floor(utr);
}

/** Drops the exact rating: what leaves the server. */
export function toRosterPlayer(row: RosterRow): RosterPlayer {
  return {
    name: row.name,
    classLabel: row.classLabel,
    gradYear: row.gradYear,
    utrWhole: rosterUtrWhole(row.utr),
    utrReliable: row.utrReliable,
    utrProfileUrl: row.utrProfileUrl,
    readDate: row.readDate,
  };
}

export interface StaffMember {
  name: string;
  title: string | null;
  email: string | null;
  isHead: boolean;
  sourceUrl: string;
  readDate: string;
}

export interface ProgramRosterPage {
  players: RosterPlayer[];
  staff: StaffMember[];
}

/** One row of program_roster_page() (055). There is no exact rating in it. */
interface RosterPageRow {
  player_name: string;
  class_label: string | null;
  grad_year: number | null;
  utr_whole: number | null;
  utr_reliable: boolean | null;
  utr_profile_url: string | null;
  read_date: string;
}

const httpUrl = (v: unknown): string | null => (typeof v === "string" && /^https?:\/\//i.test(v) ? v : null);

/**
 * Reliable ratings first, then unreliable, then unrated; within each, by
 * WHOLE number (highest first), then by name — never by the exact rating.
 * Ordering by the exact rating would let a reader match the top "13.xx" row
 * to the team range's exact top printed on the same page, which is that
 * player's exact rating (verifier MEDIUM, 2026-11-27).
 */
export function sortRoster(players: RosterRow[]): RosterRow[] {
  const rank = (p: RosterRow) => (p.utr === null ? 2 : p.utrReliable ? 0 : 1);
  const whole = (p: RosterRow) => rosterUtrWhole(p.utr) ?? 0;
  return [...players].sort((a, b) => rank(a) - rank(b) || whole(b) - whole(a) || a.name.localeCompare(b.name));
}

export async function loadProgramRosterPage(programSlug: string | undefined): Promise<ProgramRosterPage> {
  const empty: ProgramRosterPage = { players: [], staff: [] };
  const client = publicClient() as unknown as SupabaseClient | null;
  if (!client || !programSlug) return empty;
  const program = await client.from("programs").select("id").eq("slug", programSlug).maybeSingle();
  if (program.error || !program.data) return empty;
  const id = (program.data as { id: string }).id;
  const [roster, staff] = await Promise.all([
    // Whole numbers only (055): never a select on program_roster's `utr`.
    client.rpc("program_roster_page", { p_slug: programSlug }),
    client.from("program_staff").select("name, title, email, is_head, source_url, read_date").eq("program_id", id),
  ]);
  const rosterRows: RosterPageRow[] = roster.error ? [] : ((roster.data ?? []) as RosterPageRow[]);
  const players = rosterRows.map((r) => {
    const profile = httpUrl(r.utr_profile_url);
    const whole = r.utr_whole === null || r.utr_whole === undefined ? null : Number(r.utr_whole);
    return {
      name: String(r.player_name),
      classLabel: r.class_label ?? null,
      gradYear: r.grad_year ?? null,
      // A rating only with the profile it was read from (054's CHECK, again).
      utr: profile && whole !== null && Number.isFinite(whole) ? whole : null,
      utrReliable: Boolean(profile && whole !== null && r.utr_reliable),
      utrProfileUrl: profile,
      readDate: String(r.read_date),
    };
  });
  const members = staff.error
    ? []
    : (staff.data ?? [])
        .filter((s) => httpUrl(s.source_url))
        .map((s) => ({
          name: String(s.name),
          title: s.title ?? null,
          email: s.email ?? null,
          isHead: Boolean(s.is_head),
          sourceUrl: String(s.source_url),
          readDate: String(s.read_date),
        }))
        .sort((a, b) => Number(b.isHead) - Number(a.isHead) || a.name.localeCompare(b.name));
  return { players: sortRoster(players).map(toRosterPlayer), staff: members };
}
