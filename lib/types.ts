// Shared domain types for Seeded.
// These intentionally mirror what a future Supabase schema would return,
// so swapping the data layer means changing /lib/data/index.ts only.

export type Division = "D1" | "D2" | "D3";

export type Gender = "men" | "women";

export type SubscriptionTier = "free" | "player" | "family";

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
  grade: number; // 8 - 12
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

export interface Testimonial {
  id: string;
  quote: string;
  parentName: string;
  relationship: string;
  location: string;
  outcome: string;
}

export interface RoadmapYear {
  calendarYear: number; // the summer this checkpoint falls in
  gradeLabel: string; // e.g. "By summer before 11th grade"
  shortLabel: string; // compact label for charts, e.g. "Pre-11"
  utrTarget: number;
  tournamentsNeeded: number;
  milestones: string[];
}
