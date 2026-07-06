import type { Player } from "@/lib/types";

// Neutral, identity-free player. Used as the baseline so a logged-in user never
// inherits sample tennis data, and as the signed-out default (which is never
// shown — AuthGate redirects signed-out visitors to /login).
// The old "Alex Chen" demo profiles were removed on purpose: real sessions must
// always resolve to the actual Supabase profile, never a hardcoded demo user.
export const emptyPlayer: Player = {
  name: "",
  currentUTR: 7,
  grade: 10,
  graduationYear: 2028,
  commitmentDate: "2027-09-01",
  gender: "male",
  country: "United States",
  role: "player",
  targetSchoolSlugs: [],
  weaknesses: [],
  tournamentsPlayed: 0,
  tournamentsGoal: 12,
  onboarded: false,
};
