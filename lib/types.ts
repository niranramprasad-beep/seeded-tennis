// Shared domain types for Seeded.
// These intentionally mirror what a future Supabase schema would return,
// so swapping the data layer means changing lib/db/schools.ts (or lib/db/plan.ts) only.

export type Division = "D1" | "D2" | "D3";

export type Gender = "men" | "women";

export type SubscriptionTier = "free" | "player" | "family";

// Shared ordering so "is this tier at least as good as that one" is answered
// the same way everywhere — client-side gating (tier-context) and the Whop
// webhook's tier-assignment guard (which must never let a stale event for
// an old membership downgrade a currently active higher-tier one) both key
// off this instead of keeping their own copy.
export const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  player: 1,
  family: 2,
};

// How many schools a Free account may track. Paid tiers are uncapped.
//
// The REAL enforcement is the trigger in migration 024 — `target_school_slugs`
// lives on `profiles`, which `authenticated` can PATCH directly through
// PostgREST, so a limit that exists only in /api/profile or in the UI is one
// a user can route straight around (the same mistake as P0-1). This constant
// exists so the route's error message, the star button's disabled state and
// the pricing table all quote the number the database actually enforces.
// Change it here and in migration 024 together, or they will disagree.
export const FREE_TIER_TARGET_SCHOOL_LIMIT = 3;

// The tier each gated feature requires. These mirror the `has_tier(...)`
// calls in the RLS policies — the two must agree, or the UI offers something
// the database then refuses.
//
// P1-PRICE-1 (2026-11-11): outreach moved from "family" to "player".
// Outreach is the core recruiting loop; gating it at the top tier put the
// product's whole point behind the most expensive plan, while the tournament
// fit checker (already free and public) was advertised as a Family feature.
export const FEATURE_TIER = {
  /** /outreach, /coaches — draft and track coach emails. Migration 024. */
  outreach: "player",
  /** /plan, /training, /events — the personal plan. Migration 019. */
  plan: "player",
  /** /family — parent dashboard and season budget. Migration 019. */
  family: "family",
} as const satisfies Record<string, SubscriptionTier>;

export type Weakness =
  | "forehand"
  | "backhand"
  | "serve"
  | "fitness"
  | "mental";

export type WeekdayShort =
  | "Mon"
  | "Tue"
  | "Wed"
  | "Thu"
  | "Fri"
  | "Sat"
  | "Sun";

export type ActivityType =
  | "court"
  | "gym"
  | "match"
  | "recovery"
  | "mental";

export type Intensity = "low" | "moderate" | "high";

export type TournamentLevel =
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L5"
  | "L6"
  | "L7";

// A school program in the catalog.
//
// Every field here must be a real, checkable fact about the program. P0-3
// removed `coachName`, `coachEmail`, `recruitingPageUrl`, `recentRecruits`,
// `programNote` and `conferenceRank`, which were invented placeholder values
// rendered to users as facts (and, via the coach-email draft, asserted to
// real college coaches). Coach contact is now typed by the user per message;
// see buildCoachEmail in lib/db/schools.ts.
//
// `avgRosterUTR` and `minCompetitiveUTR` are the two exceptions still in
// flight: they are unverified estimates, so anything that renders them must
// also render UTR_RANGE_SOURCE_LABEL. P1-DATA-1 replaces them with sourced,
// dated roster data.
export interface School {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  conference: string;
  division: Division;
  gender: Gender;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  avgRosterUTR: number;
  minCompetitiveUTR: number;
  usNewsRanking: number;
}

// Kept as a distinct name because ~30 components and lib/school-fit.ts type
// their props against it. It used to drop the per-school recruit history and
// program blurb from the payload shipped to the browser; both fields are gone
// from `School` entirely now (P0-3), so the two shapes are identical. The
// alias stays as the seam for P1-DATA-1, when the full `School` grows sourced
// roster rows and list pages will again want a narrower row.
export type SchoolLite = School;

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  hours: number;
  intensity: Intensity;
  detail: string;
  focusAreas: Weakness[];
}

export interface TrainingDay {
  day: WeekdayShort;
  activities: Activity[];
}

export interface TrainingPlan {
  utrLevel: number;
  label: string;
  summary: string;
  weeklyHours: number;
  days: TrainingDay[];
}

export type PlayerGender = "male" | "female";
export type FamilyRole = "player" | "parent";

export interface Player {
  name: string;
  currentUTR: number;
  // Grade is never stored — it's derived from graduationYear + today's date
  // via lib/time.ts getCurrentGrade(). Storing it would go stale every
  // August when the school year rolls over.
  graduationYear: number;
  commitmentDate: string; // ISO date — the realistic verbal-commit target
  gender: PlayerGender;
  country: string;
  role: FamilyRole;
  familyCode?: string;
  targetSchoolSlugs: string[];
  weaknesses: Weakness[];
  tournamentsPlayed: number;
  tournamentsGoal: number;
  onboarded: boolean;
  // Profile tab fields on /settings (migration 014_profile_fields_and_
  // deletion.sql: profiles.home_area/utr_profile_link/gpa). Optional so
  // older in-memory Player values built before this migration (and rows
  // read from a database that hasn't had it applied yet) stay valid.
  homeArea?: string;
  utrProfileLink?: string;
  gpa?: number | null;
  // Set by /settings' "Delete account" flow (migration 014's
  // profiles.deletion_requested_at). Null/undefined means no deletion is
  // pending. This is ONLY ever a timestamp marker — nothing in the app
  // reads this to actually delete data; the real 30-day purge is a
  // separate operational job outside the app's scope.
  deletionRequestedAt?: string | null;
}

// Maps a player's gender to the school program gender they recruit into.
export function programGenderFor(g: PlayerGender): Gender {
  return g === "female" ? "women" : "men";
}

export interface Tournament {
  id: string;
  name: string;
  level: TournamentLevel;
  date: string; // ISO
  city: string;
  state: string;
  surface: "Hard" | "Clay" | "Indoor";
  status: "completed" | "registered" | "upcoming";
  result?: string;
}

export interface RoadmapYear {
  calendarYear: number; // the summer this checkpoint falls in
  gradeLabel: string; // e.g. "By summer before 11th grade"
  shortLabel: string; // compact label for charts, e.g. "Pre-11"
  utrTarget: number;
  tournamentsNeeded: number;
  milestones: string[];
}
