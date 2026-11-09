// Shared domain types for Seeded.
// These intentionally mirror what a future Supabase schema would return,
// so swapping the data layer means changing /lib/data/index.ts only.

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

export interface Recruit {
  name: string;
  hometown: string;
  classYear: number;
  utr: number;
}

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
  conferenceRank: number;
  coachName: string;
  coachEmail: string;
  recruitingPageUrl: string;
  recentRecruits: Recruit[];
  // Optional richer program detail used by the (rewritten) coach email generator.
  programNote?: string;
}

// `recentRecruits` (an array per school) and `programNote` are the heaviest
// fields in the catalog and are only ever read by the coach-email generator
// (/coaches). Pages that just list/compare/filter schools — dashboard,
// roadmap, cost calculator — never touch either, so they use this lighter
// shape instead of shipping the full catalog (with every school's recruit
// history) down to the browser on every load.
export type SchoolLite = Omit<School, "recentRecruits" | "programNote">;

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
