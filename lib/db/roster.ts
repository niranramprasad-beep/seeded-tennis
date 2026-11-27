// The roster page data (migration 054): a program's official roster by name
// and its coaching staff, each row with the page it was read from. Public
// catalog data, read with the publishable key and no session (like
// lib/db/programs.ts). Empty — never a throw — when the program has no rows,
// 054 is not on the database, or the read fails: the page then shows what it
// showed before.

import type { SupabaseClient } from "@supabase/supabase-js";
import { publicClient } from "./programs";

/** A roster row as the database holds it — server-side only. Its exact
 *  `utr` sorts the roster and never leaves this module: see RosterPlayer. */
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
    client
      .from("program_roster")
      .select("player_name, class_label, grad_year, utr, utr_reliable, utr_profile_url, read_date")
      .eq("program_id", id),
    client.from("program_staff").select("name, title, email, is_head, source_url, read_date").eq("program_id", id),
  ]);
  const players = roster.error
    ? []
    : (roster.data ?? []).map((r) => {
        const profile = httpUrl(r.utr_profile_url);
        return {
          name: String(r.player_name),
          classLabel: r.class_label ?? null,
          gradYear: r.grad_year ?? null,
          // A rating only with the profile it was read from (054's CHECK, again).
          utr: profile && r.utr !== null ? Number(r.utr) : null,
          utrReliable: Boolean(profile && r.utr !== null && r.utr_reliable),
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
