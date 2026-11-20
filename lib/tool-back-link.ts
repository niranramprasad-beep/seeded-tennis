import type { FamilyRole } from "@/lib/types";

// Where the back link on a Tools page (Results, Tournament checker) goes.
// Both sit in the "Tools" group under the five primary items (DECISIONS
// 2026-11-18), so "back" is the primary page each one belongs to:
//   - Results → Events, whose "Recent results" card links here.
//   - Tournament checker → Events for a player (where "Add to my events"
//     puts a tournament); the family Overview for a parent, who cannot open
//     /events (AuthGate sends a parent away). It said "← Events" to
//     everyone, so a parent's back link bounced.
// A signed-out visitor gets no back link: the checker is public, and the
// site header is their navigation. lib/tool-back-link.test.ts checks every
// answer against lib/route-access.ts.

export interface BackLink {
  href: string;
  label: string;
}

export function toolBackLink(who: { isAuthed: boolean; role: FamilyRole }): BackLink | null {
  if (!who.isAuthed) return null;
  return who.role === "parent" ? { href: "/family", label: "Overview" } : { href: "/events", label: "Events" };
}
