// Target-school management. There is no dedicated table for this — a
// player's target list IS `profiles.target_school_slugs` (written through
// lib/auth.ts's saveCurrentPlayer/updatePlayer, the generic profile-patch
// path every onboarding/settings/star-toggle flow already goes through) —
// so this module's job is narrower than the other lib/db areas: own the
// pure add/remove-slug logic every "star to target" UI (Schools browser,
// School Profile, Plan) shares, previously inlined directly inside
// lib/hooks/use-star-schools.ts.

export function isTargetSchool(slugs: string[], slug: string): boolean {
  return slugs.includes(slug);
}

/** Pure add-or-remove toggle over a target-slug list — add when absent,
 * remove when present. No React, no Supabase: lib/hooks/use-star-schools.ts
 * calls this and then persists the result via updatePlayer(), the same
 * mechanism it always used; this just gives the array logic one real,
 * unit-testable home instead of being inlined in the hook. */
export function toggleTargetSchoolSlug(current: string[], slug: string): string[] {
  return current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug];
}
