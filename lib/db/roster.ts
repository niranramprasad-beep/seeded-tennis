// The roster page data (migration 054): a program's official roster by name
// and its coaching staff, each row with the page it was read from. Public
// catalog data, read with the publishable key and no session (like
// lib/db/programs.ts). Empty — never a throw — when the program has no rows,
// 054 is not on the database, or the read fails: the page then shows what it
// showed before.

import type { SupabaseClient } from "@supabase/supabase-js";
import { publicClient } from "./programs";

export interface RosterPlayer {
  name: string;
  classLabel: string | null;
  gradYear: number | null;
  utr: number | null;
  utrReliable: boolean;
  utrProfileUrl: string | null;
  hometown: string | null;
  readDate: string;
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

/** Highest reliable rating first, then unreliable, then unrated; ties by name. */
export function sortRoster(players: RosterPlayer[]): RosterPlayer[] {
  const rank = (p: RosterPlayer) => (p.utr === null ? 2 : p.utrReliable ? 0 : 1);
  return [...players].sort(
    (a, b) => rank(a) - rank(b) || (b.utr ?? 0) - (a.utr ?? 0) || a.name.localeCompare(b.name)
  );
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
      .select("player_name, class_label, grad_year, utr, utr_reliable, utr_profile_url, hometown, read_date")
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
          hometown: r.hometown ?? null,
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
  return { players: sortRoster(players), staff: members };
}
