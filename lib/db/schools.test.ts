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

  // P0-3: the catalog carried an invented head-coach name per school, and the
  // draft opened and closed with it. Seeded now knows no coach names at all,
  // so the salutation has to stay generic rather than guess one.
  it("addresses the coach generically — it has no coach name to use", () => {
    const email = buildCoachEmail(player, school);
    expect(email.body).toMatch(/^Coach,\n/);
    expect(email.body).not.toMatch(/Coach \w/);
  });

  // P0-3: these sentences cited an invented conference standing, an invented
  // recruit footprint and an invented program blurb, to a real coach who
  // would know they were wrong.
  it("states no school fact beyond name, division and conference", () => {
    const email = buildCoachEmail(player, school, [
      { name: "Mid-Atlantic Open", level: "L4", result: "Champion" },
    ]);
    expect(email.body).not.toMatch(/place standing/);
    expect(email.body).not.toMatch(/recent classes|recent signees/);
    expect(email.body).not.toMatch(/\bst-place|\bnd-place|\brd-place|\bth-place/);
  });

  // P0-4: with nothing logged the draft used to claim "a full sectional and
  // national schedule" — a characterization of the player's season that they
  // never gave us and that may be flatly untrue.
  it("invents no results and no schedule description when nothing is logged", () => {
    const email = buildCoachEmail(
      { ...player, tournamentsPlayed: 0, tournamentsGoal: 0 },
      school,
      []
    );
    expect(email.body).not.toMatch(/sectional|national schedule/);
    expect(email.body).not.toMatch(/This season I/);
    // No orphaned punctuation or doubled blank lines from the dropped pieces.
    expect(email.body).not.toMatch(/\n{3,}/);
    expect(email.body).not.toMatch(/\s\./);
  });

  it("reports the player's own tournament count when they have one", () => {
    const email = buildCoachEmail({ ...player, tournamentsPlayed: 5 }, school, []);
    expect(email.body).toContain("I've played 5 tournaments so far this season.");
  });

  it("uses real logged results when provided, never invented ones", () => {
    const email = buildCoachEmail(player, school, [
      { name: "Mid-Atlantic Open", level: "L4", result: "Champion" },
    ]);
    expect(email.body).toContain("won the title");
    expect(email.body).toContain("Mid-Atlantic Open");
  });

  // P0-4: `minCompetitiveUTR` is an unverified estimate of ours. Reciting it
  // to the coach whose roster it supposedly describes states as fact a number
  // we cannot source — and the old wording went further, promising the player
  // would close the gap "well before I'd arrive on campus".
  it("never cites the program's competitive line or promises to close a gap", () => {
    for (const utr of [9, 11]) {
      const email = buildCoachEmail({ ...player, currentUTR: utr }, school);
      expect(email.body).not.toMatch(/competitive line/);
      expect(email.body).not.toMatch(/10\.0/); // the school's floor
      expect(email.body).not.toMatch(/roadmap|closing that gap|trending up/);
    }
  });

  // P0-4: every player got "I'll be at several events this spring and would be
  // glad to play in front of your staff" — including players with nothing
  // scheduled. A forward-looking claim has to come from a number they entered.
  it("makes no scheduling promise the player didn't supply", () => {
    const none = buildCoachEmail({ ...player, tournamentsGoal: 0 }, school);
    expect(none.body).not.toMatch(/I'll be at|play in front of your staff/);
    expect(none.body).not.toMatch(/My goal is/);

    const withGoal = buildCoachEmail({ ...player, tournamentsGoal: 12 }, school);
    expect(withGoal.body).toContain("My goal is 12 tournaments this season");
    expect(withGoal.body).not.toMatch(/I'll be at|play in front of your staff/);
  });

  // P0-4: the UTR is the player's own number, typed by them and never checked
  // against UTR — so it travels labeled.
  it("labels the UTR self-reported everywhere it appears", () => {
    const email = buildCoachEmail(player, school);
    expect(email.subject).toContain("UTR 9.0 (self-reported)");
    expect(email.body).toContain("My UTR is 9.0 (self-reported).");
    expect(email.body).toContain("UTR 9.0 (self-reported) · Class of 2027");
    // No bare "UTR 9.0" that isn't followed by the label.
    expect(email.body).not.toMatch(/UTR 9\.0(?! \(self-reported\))/);
  });

  // The catch-all: nothing in the draft may describe the player's game in
  // specifics they never entered.
  it("puts no invented detail about the player's game in their mouth", () => {
    const email = buildCoachEmail(
      { ...player, weaknesses: ["forehand", "backhand"] },
      school
    );
    expect(email.body).not.toMatch(/ad corner|deuce side|third sets|point-ending/);
    expect(email.body).toContain("I'm working on my forehand and my backhand.");
  });

  it("mentions a development focus only when the player has logged weaknesses", () => {
    const noFocus = buildCoachEmail(player, school);
    const withFocus = buildCoachEmail({ ...player, weaknesses: ["serve", "mental"] }, school);
    expect(withFocus.body).toContain("Right now I'm working on");
    expect(withFocus.body.length).toBeGreaterThan(noFocus.body.length);
  });
});
