import { describe, expect, it } from "vitest";
import { combinedScore, buildCoachEmail } from "./schools";
import type { Player, School } from "@/lib/types";

const school: School = {
  id: "1",
  slug: "duke-w",
  name: "Duke Blue Devils",
  shortName: "Duke",
  city: "Durham",
  state: "NC",
  conference: "ACC",
  division: "D1",
  gender: "women",
  primaryColor: "#000",
  secondaryColor: "#fff",
  textColor: "#fff",
  avgRosterUTR: 12,
  minCompetitiveUTR: 10,
  usNewsRanking: 10,
  conferenceRank: 1,
  coachName: "Jane Smith",
  coachEmail: "coach@duke.edu",
  recruitingPageUrl: "https://duke.edu",
  recentRecruits: [],
};

const player: Player = {
  name: "Maya Chen",
  currentUTR: 9,
  graduationYear: 2027,
  commitmentDate: "2026-09-01",
  gender: "female",
  country: "United States",
  role: "player",
  targetSchoolSlugs: [],
  weaknesses: [],
  tournamentsPlayed: 5,
  tournamentsGoal: 12,
  onboarded: true,
};

describe("combinedScore", () => {
  it("blends academics and tennis level into a 0-100 score", () => {
    const score = combinedScore(school);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("rewards a stronger academic ranking with a higher score, all else equal", () => {
    const strongerAcademics = { ...school, usNewsRanking: 1 };
    expect(combinedScore(strongerAcademics)).toBeGreaterThan(combinedScore(school));
  });

  it("rewards a stronger roster UTR with a higher score, all else equal", () => {
    const strongerRoster = { ...school, avgRosterUTR: 14 };
    expect(combinedScore(strongerRoster)).toBeGreaterThan(combinedScore(school));
  });
});

describe("buildCoachEmail", () => {
  it("includes the player's name, UTR, and the school's short name", () => {
    const email = buildCoachEmail(player, school);
    expect(email.subject).toContain("Maya Chen");
    expect(email.subject).toContain("Duke");
    expect(email.body).toContain("Maya Chen");
    expect(email.body).toContain("Duke");
  });

  it("addresses the coach by last name", () => {
    const email = buildCoachEmail(player, school);
    expect(email.body).toContain("Coach Smith,");
  });

  it("never fabricates results — falls back to schedule volume with none logged", () => {
    const email = buildCoachEmail(player, school, []);
    expect(email.body).toContain("full sectional and national schedule");
  });

  it("uses real logged results when provided, never invented ones", () => {
    const email = buildCoachEmail(player, school, [
      { name: "Mid-Atlantic Open", level: "L4", result: "Champion" },
    ]);
    expect(email.body).toContain("won the title");
    expect(email.body).toContain("Mid-Atlantic Open");
  });

  it("frames fit against the player's gap to the program's competitive line", () => {
    const belowLine = buildCoachEmail(player, school); // player 9.0 < school's 10.0
    expect(belowLine.body).toMatch(/below your 10\.0 competitive line/);

    const aboveLine = buildCoachEmail({ ...player, currentUTR: 11 }, school);
    expect(aboveLine.body).toMatch(/already at your 10\.0 competitive line/);
  });

  it("mentions a development focus only when the player has logged weaknesses", () => {
    const noFocus = buildCoachEmail(player, school);
    const withFocus = buildCoachEmail({ ...player, weaknesses: ["serve", "mental"] }, school);
    expect(withFocus.body).toContain("I'm specifically working on");
    expect(withFocus.body.length).toBeGreaterThan(noFocus.body.length);
  });
});
