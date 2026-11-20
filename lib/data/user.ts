import type { Player } from "@/lib/types";

// Neutral, identity-free player. Used as the baseline so a logged-in user never
// inherits sample tennis data, and as the signed-out default (which is never
// shown — AuthGate redirects signed-out visitors to /login).
// The old "Alex Chen" demo profiles were removed on purpose: real sessions must
// always resolve to the actual Supabase profile, never a hardcoded demo user.
export const emptyPlayer: Player = {
  name: "",
  // 0, NOT 7. An independent review found the old placeholder reaching a
  // college coach's inbox: buildCoachEmail() renders "My UTR is 7.0
  // (self-reported)" for a player who has never entered one, in an email
  // they sign their name to. That is the P0-4 rule broken as directly as it
  // can be.
  //
  // 0 is not a valid UTR (the scale starts around 1), and `currentUTR <= 0`
  // is ALREADY this codebase's convention for "no real UTR logged yet" —
  // see lib/fit.ts:94 and the note in lib/school-fit.ts above
  // explainSchoolFit(). This aligns the placeholder with that convention
  // instead of inventing a plausible-looking rating.
  currentUTR: 0,
  graduationYear: 2028,
  commitmentDate: "2027-09-01",
  gender: "male",
  country: "United States",
  role: "player",
  targetSchoolSlugs: [],
  weaknesses: [],
  // Not 12. Nobody is asked for a number at sign-up, so there is none
  // (migration 049; lib/no-invented-goal.test.ts).
  tournamentsPlanned: null,
  onboarded: false,
  homeArea: "",
  utrProfileLink: "",
  gpa: null,
  deletionRequestedAt: null,
  birthMonth: null,
  enrollmentTerm: null,
  emailVerified: false,
};
