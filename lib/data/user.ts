import type { Player } from "@/lib/types";

// Default sample player. Used as the fallback profile when a visitor signs in
// without completing onboarding, and as the seed the onboarding flow edits.
export const sampledPlayer: Player = {
  name: "Alex Chen",
  currentUTR: 7.5,
  grade: 10,
  graduationYear: 2028,
  commitmentDate: "2027-09-01",
  gender: "male",
  country: "United States",
  role: "player",
  familyCode: "CHEN-7K4P",
  targetSchoolSlugs: ["cornell-m", "duke-m", "northwestern-m"],
  weaknesses: ["backhand", "serve", "fitness"],
  tournamentsPlayed: 4,
  tournamentsGoal: 12,
  onboarded: true,
};

// Used to seed a brand-new onboarding session (nothing chosen yet).
export const blankPlayer: Player = {
  name: "Alex Chen",
  currentUTR: 7.5,
  grade: 10,
  graduationYear: 2028,
  commitmentDate: "2027-09-01",
  gender: "male",
  country: "United States",
  role: "player",
  targetSchoolSlugs: [],
  weaknesses: [],
  tournamentsPlayed: 4,
  tournamentsGoal: 12,
  onboarded: false,
};
