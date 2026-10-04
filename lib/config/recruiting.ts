// Single source of truth for recruiting-calendar rules. If an NCAA rule
// changes (e.g. the contact-period open date), update it here only —
// nothing else in the app should hardcode a recruiting-calendar date.

import type { PlayerGender } from "@/lib/types";

// Realistic ceiling on UTR goals/projections — top-of-college-tennis level
// per gender on the real UTR scale (max 16.50). Used as the roadmap's
// default goal when no target schools are picked, and as a cap on the
// projected-trajectory line so a hot recent streak never extrapolates into a
// number that doesn't exist on the real scale.
export const REALISTIC_UTR_CEILING: Record<PlayerGender, number> = {
  female: 12.5,
  male: 14,
};

// The school year advances a grade on this date. August 1 is used because
// most US high seasons/semesters are underway by then even though the
// calendar start date varies by district.
export const SCHOOL_YEAR_ROLLOVER_MONTH = 8; // August (1-indexed)
export const SCHOOL_YEAR_ROLLOVER_DAY = 1;

// NCAA Division I coaches may initiate off-campus recruiting contact
// starting June 15 following a recruit's sophomore year (i.e. the summer
// before 11th grade).
export const CONTACT_PERIOD_OPEN_MONTH = 6; // June (1-indexed)
export const CONTACT_PERIOD_OPEN_DAY = 15;
export const CONTACT_PERIOD_OPENS_BEFORE_GRADE = 11;

// Default verbal-commitment target shown on the roadmap: September 1 of
// senior year. A realistic planning target, not a hard rule.
export const DEFAULT_COMMIT_MONTH = 9; // September (1-indexed)
export const DEFAULT_COMMIT_DAY = 1;
export const DEFAULT_COMMIT_BEFORE_GRADE = 12;

// Roadmap milestones, keyed by the grade the summer precedes — e.g. "10"
// means "the summer before 10th grade". 13 means the summer before college.
export const MILESTONES_BEFORE_GRADE: Record<number, string[]> = {
  9: [
    "Lock in a year-round training base",
    "Bank 6+ sectional results before the season",
    "Have a dependable second serve",
  ],
  10: [
    "Be a fixture in sectional L4-L5 main draws",
    "Own one weapon you can win points with",
    "Start a realistic target-school shortlist",
  ],
  11: [
    "Be ready for 2+ national L1/L2 events this year",
    "NCAA contact opens June 15 — have your email ready",
    "Take unofficial visits to top-choice campuses",
  ],
  12: [
    "Hit your target UTR by the summer before senior year",
    "Send personalized notes to target coaches",
    "Convert interest into official-visit invitations",
  ],
  13: [
    "Lock in your verbal commitment",
    "Hold your UTR through the signing window",
    "Arrive on campus physically college-ready",
  ],
};
