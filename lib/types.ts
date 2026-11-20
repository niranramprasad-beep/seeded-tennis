import { SUPPORT_EMAIL } from "@/lib/config/contact";

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

// How often a paid plan bills. Whop models monthly and yearly as two
// separate plans (variants) on the same product, so this is the second half
// of the key into the plan registry in lib/whop.ts.
export type BillingInterval = "monthly" | "yearly";

export const BILLING_INTERVALS: readonly BillingInterval[] = ["monthly", "yearly"] as const;

// The current list prices, in one place.
//
// Display AND reporting: the pricing page, the paywall copy, the billing tab
// and the GA4 purchase event all read from here, so a price change is one
// edit rather than a grep. They must match what the Whop plans actually
// charge — a unit test cannot check that (Whop is the source of truth and is
// not reachable from one), so when these change, change them with a plan id
// in hand.
//
// 2026-11-14: Player moved $19 -> $12/mo and gained $99/yr; Family moved
// $39 -> $19/mo and gained $159/yr. **The new Family monthly price is the
// same number as the OLD Player monthly price** — a grep for "19" finds both
// and they mean different things. That is exactly why nothing should carry a
// bare price string any more.
export const TIER_PRICE_USD: Record<SubscriptionTier, Record<BillingInterval, number>> = {
  free: { monthly: 0, yearly: 0 },
  player: { monthly: 12, yearly: 99 },
  family: { monthly: 19, yearly: 159 },
};

// Migration 045 (owner decision 2026-11-19, docs/DECISIONS.md): a Family
// plan unlocks ONE family — the one the paying account belongs to — and a
// family holds at most this many players and parent accounts. The database
// enforces both (family_member_cap(), join_family(), approve_family_join());
// lib/family-plan-scope.test.ts fails the build if these drift from it.
export const FAMILY_PLAN_MAX_PLAYERS = 4;
export const FAMILY_PLAN_MAX_PARENTS = 2;

/** "For one family: up to 4 players and 2 parents" — /pricing's one wording. */
export const FAMILY_PLAN_SCOPE_LABEL =
  `For one family: up to ${FAMILY_PLAN_MAX_PLAYERS} players and ${FAMILY_PLAN_MAX_PARENTS} parents`;

/** What someone over the cap is told, by join or by approval. */
export function familyFullMessage(role: "player" | "parent"): string {
  const n = role === "player" ? FAMILY_PLAN_MAX_PLAYERS : FAMILY_PLAN_MAX_PARENTS;
  return `This family already has ${n} ${role}s. Contact ${SUPPORT_EMAIL}`;
}

/** "$12" / "$99" — no cents, because none of the prices have any. */
export function formatTierPrice(tier: SubscriptionTier, interval: BillingInterval): string {
  return `$${TIER_PRICE_USD[tier][interval]}`;
}

/** What a yearly plan saves against twelve months of the monthly one, as a
 * whole-number percentage. Derived, never written down: a hand-typed
 * "save 30%" is a claim that goes stale the moment a price moves. */
export function yearlySavingsPercent(tier: SubscriptionTier): number {
  const monthlyYear = TIER_PRICE_USD[tier].monthly * 12;
  if (monthlyYear === 0) return 0;
  return Math.round(((monthlyYear - TIER_PRICE_USD[tier].yearly) / monthlyYear) * 100);
}

/**
 * How many months of the monthly price a year's subscription saves — floored,
 * and minimised across every paid tier, so the number is true for whichever
 * plan the visitor picks.
 *
 * The mockup's toggle reads "Yearly · 2 months free". At today's prices that
 * is wrong in the customer's favour (Player saves 3.75 months, Family 3.6),
 * and a promise that understates is still a promise nobody checked. Computed
 * like this it holds for both tiers and moves on its own when a price does.
 */
export function yearlyMonthsFree(): number {
  const paid: SubscriptionTier[] = ["player", "family"];
  return Math.min(
    ...paid.map((tier) => {
      const { monthly, yearly } = TIER_PRICE_USD[tier];
      if (monthly === 0) return 0;
      return Math.floor((monthly * 12 - yearly) / monthly);
    })
  );
}

/** "About $8.25 a month" — the yearly price expressed monthly, for the
 * spec's price note. Two decimals only when they are not .00. */
export function yearlyAsMonthlyLabel(tier: SubscriptionTier): string {
  const perMonth = TIER_PRICE_USD[tier].yearly / 12;
  const rounded = Math.round(perMonth * 100) / 100;
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
}

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

export type PlayerGender = "male" | "female";
export type FamilyRole = "player" | "parent";

/** When the player plans to start college (migration 041,
 * profiles.enrollment_term). Mirrors the column's CHECK constraint. */
export const ENROLLMENT_TERMS = ["fall_after_grad", "spring_after_grad", "not_sure"] as const;
export type EnrollmentTerm = (typeof ENROLLMENT_TERMS)[number];

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
  // Migration 041 (diagnostic onboarding). Month + year only, never a day.
  // birth_month is WRITE-ONCE from the client, like birth_year: the 041
  // trigger refuses any change once it is set (42501), so
  // writeCurrentPlayerProfile() only sends it when it is non-null — which
  // round-trips the stored value unchanged. Null = not answered, never a
  // default.
  birthMonth: number | null;
  enrollmentTerm: EnrollmentTerm | null;
  // Migration 043. True when the account has PROVEN it owns its current
  // email: a magic-link/OTP session called mark_email_verified(), or the
  // account signs in with a Google identity for that address. NOT
  // auth.users.email_confirmed_at — production auto-confirms at sign-up, so
  // that proves nothing. Read-only: email_verified_at is a privileged column.
  // The database's own check (email_is_verified) is what gates parents;
  // this is for the UI to decide whether to show "Confirm your email".
  emailVerified?: boolean;
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
