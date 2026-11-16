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

// ---------------------------------------------------------------------
// NCAA RECRUITING-CONTACT CALENDAR — general rules, not tennis-specific
// ---------------------------------------------------------------------
// Tennis has no sport-specific NCAA recruiting calendar, so the dates below
// are the GENERAL contact-period rules that apply across sports. They are
// real, verified-at-the-time-of-writing NCAA bylaws, but recruiting rules
// do change — every UI surface that shows one of these dates must caption
// it as general guidance and point the player to ncaa.org to confirm the
// current rule, never present it as a permanently fixed calendar.

// D1: coaches may initiate recruiting correspondence/calls starting June 15
// following a recruit's sophomore year (i.e. the summer before 11th grade).
export const CONTACT_PERIOD_OPEN_MONTH = 6; // June (1-indexed)
export const CONTACT_PERIOD_OPEN_DAY = 15;
export const CONTACT_PERIOD_OPENS_BEFORE_GRADE = 11;

// D1: off-campus contact, official visits, and unofficial visits with
// athletics-staff involvement may begin August 1 of junior year — modeled
// as Aug 1 of the same "summer before 11th grade" calendar year as the
// contact-period date above (that Aug 1 is the day junior year's school
// year begins).
export const D1_OFFCAMPUS_CONTACT_MONTH = 8;
export const D1_OFFCAMPUS_CONTACT_DAY = 1;
export const D1_OFFCAMPUS_CONTACT_BEFORE_GRADE = 11;

// D1: written offers of athletic aid may be provided from August 1 of
// senior year — Aug 1 of the "summer before 12th grade" calendar year.
export const D1_WRITTEN_OFFER_MONTH = 8;
export const D1_WRITTEN_OFFER_DAY = 1;
export const D1_WRITTEN_OFFER_BEFORE_GRADE = 12;

// D3: in-person off-campus contact may begin once the prospect has
// completed sophomore year — modeled as June 1 of the same "summer before
// 11th grade" window the D1 dates above use (sophomore year wraps up
// around then).
export const D3_OFFCAMPUS_CONTACT_MONTH = 6;
export const D3_OFFCAMPUS_CONTACT_DAY = 1;
export const D3_OFFCAMPUS_CONTACT_BEFORE_GRADE = 11;

// D3: official visits may begin January 1 of junior year — the January
// that falls INSIDE the junior-year school year, one calendar year after
// the "summer before 11th grade" window above.
export const D3_OFFICIAL_VISIT_MONTH = 1;
export const D3_OFFICIAL_VISIT_DAY = 1;
export const D3_OFFICIAL_VISIT_BEFORE_GRADE = 11;
export const D3_OFFICIAL_VISIT_YEAR_OFFSET = 1;

// D3: unofficial visits are unrestricted throughout — no date gate, kept
// here only so callers have a single named constant to point to rather
// than hardcoding "no restriction" prose in more than one place.
export const D3_UNOFFICIAL_VISITS_UNRESTRICTED = true;

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
