import { describe, expect, it } from "vitest";
import { buildTodayActions, buildThisWeekItems, daysSince, isSundayCheckinDue } from "./today-actions";
import type { SchoolLite } from "./types";

function school(overrides: Partial<SchoolLite>): SchoolLite {
  return {
    id: overrides.slug ?? "s",
    slug: "s",
    name: "Test School",
    shortName: "Test",
    city: "Testville",
    state: "VA",
    conference: "Test Conf",
    division: "D3",
    gender: "women",
    primaryColor: "#000",
    secondaryColor: "#000",
    textColor: "#fff",
    avgRosterUTR: 9.5,
    minCompetitiveUTR: 8.5,
    usNewsRanking: 50,
    conferenceRank: 1,
    coachName: "Coach",
    coachEmail: "coach@example.com",
    recruitingPageUrl: "",
    ...overrides,
  };
}

const NOW = new Date("2026-11-08T12:00:00Z");

describe("buildTodayActions", () => {
  it("surfaces a newly-qualifying school with no outreach row as an email action", () => {
    const target = school({ slug: "middlebury", shortName: "Middlebury", minCompetitiveUTR: 8.8, avgRosterUTR: 10.6 });
    const actions = buildTodayActions(9.4, [target], {}, NOW);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "email", id: "email-middlebury" });
    expect(actions[0].title).toContain("Middlebury");
  });

  it("does not suggest emailing a school still out of reach", () => {
    const target = school({ slug: "emory", minCompetitiveUTR: 9.8, avgRosterUTR: 11.6 });
    const actions = buildTodayActions(9.4, [target], {}, NOW);
    expect(actions).toHaveLength(0);
  });

  it("surfaces an overdue follow-up for a contacted school with no reply after 10+ days", () => {
    const target = school({ slug: "williams", shortName: "Williams" });
    const contactedAt = new Date(NOW.getTime() - 14 * 86_400_000).toISOString();
    const actions = buildTodayActions(9.4, [target], { williams: { status: "emailed", updatedAt: contactedAt } }, NOW);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "followup", id: "followup-williams" });
    expect(actions[0].description).toContain("14 days");
  });

  it("does not flag a recently-contacted school as overdue yet", () => {
    const target = school({ slug: "richmond" });
    const contactedAt = new Date(NOW.getTime() - 2 * 86_400_000).toISOString();
    const actions = buildTodayActions(9.4, [target], { richmond: { status: "emailed", updatedAt: contactedAt } }, NOW);
    expect(actions).toHaveLength(0);
  });

  it("treats a replied school as settled, not actionable", () => {
    const target = school({ slug: "bucknell" });
    const actions = buildTodayActions(9.4, [target], { bucknell: { status: "replied", updatedAt: NOW.toISOString() } }, NOW);
    expect(actions).toHaveLength(0);
  });

  it("returns an empty list when the player has zero actions due", () => {
    const actions = buildTodayActions(9.4, [], {}, NOW);
    expect(actions).toEqual([]);
  });

  it("surfaces a reminder once its remind_at date has arrived", () => {
    const target = school({ slug: "amherst", shortName: "Amherst" });
    const remindAt = new Date(NOW.getTime() - 86_400_000).toISOString(); // yesterday
    const actions = buildTodayActions(
      9.4,
      [target],
      { amherst: { status: "researching", updatedAt: NOW.toISOString(), remindAt } },
      NOW
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "reminder", id: "reminder-amherst" });
    expect(actions[0].description).toContain("Amherst");
  });

  it("surfaces a reminder due exactly today", () => {
    const target = school({ slug: "tufts", shortName: "Tufts" });
    const actions = buildTodayActions(
      9.4,
      [target],
      { tufts: { status: "researching", updatedAt: NOW.toISOString(), remindAt: NOW.toISOString() } },
      NOW
    );
    expect(actions.some((a) => a.id === "reminder-tufts")).toBe(true);
  });

  it("does not surface a reminder whose date has not arrived yet", () => {
    const target = school({ slug: "colby", shortName: "Colby" });
    const remindAt = new Date(NOW.getTime() + 86_400_000).toISOString(); // tomorrow
    const actions = buildTodayActions(
      9.4,
      [target],
      { colby: { status: "researching", updatedAt: NOW.toISOString(), remindAt } },
      NOW
    );
    expect(actions.some((a) => a.id === "reminder-colby")).toBe(false);
  });

  it("does not surface a reminder when none was ever set", () => {
    const target = school({ slug: "hamilton", shortName: "Hamilton" });
    const actions = buildTodayActions(
      9.4,
      [target],
      { hamilton: { status: "researching", updatedAt: NOW.toISOString() } },
      NOW
    );
    expect(actions.some((a) => a.id === "reminder-hamilton")).toBe(false);
  });

  it("sorts email actions before follow-ups", () => {
    const emailTarget = school({ slug: "aaa-school", shortName: "AAA" });
    const followupTarget = school({ slug: "zzz-school", shortName: "ZZZ" });
    const contactedAt = new Date(NOW.getTime() - 20 * 86_400_000).toISOString();
    const actions = buildTodayActions(
      9.4,
      [followupTarget, emailTarget],
      { "zzz-school": { status: "emailed", updatedAt: contactedAt } },
      NOW
    );
    expect(actions.map((a) => a.kind)).toEqual(["email", "followup"]);
  });

  it("sorts reminders after both emails and follow-ups", () => {
    const emailTarget = school({ slug: "aaa-school", shortName: "AAA" });
    const followupTarget = school({ slug: "mmm-school", shortName: "MMM" });
    const reminderTarget = school({ slug: "zzz-school", shortName: "ZZZ" });
    const contactedAt = new Date(NOW.getTime() - 20 * 86_400_000).toISOString();
    const actions = buildTodayActions(
      9.4,
      [reminderTarget, followupTarget, emailTarget],
      {
        "mmm-school": { status: "emailed", updatedAt: contactedAt },
        "zzz-school": { status: "researching", updatedAt: NOW.toISOString(), remindAt: NOW.toISOString() },
      },
      NOW
    );
    expect(actions.map((a) => a.kind)).toEqual(["email", "followup", "reminder"]);
  });
});

describe("buildThisWeekItems", () => {
  it("always includes the standing weekly check-in", () => {
    const items = buildThisWeekItems([], {}, NOW);
    expect(items.some((i) => i.id === "weekly-checkin")).toBe(true);
  });

  it("includes a follow-up due within the next 7 days, not an overdue one", () => {
    const dueSoon = school({ slug: "due-soon" });
    const alreadyOverdue = school({ slug: "overdue" });
    const items = buildThisWeekItems(
      [dueSoon, alreadyOverdue],
      {
        // contacted 8 days ago -> due in 2 days (inside the 7-day window)
        "due-soon": { status: "emailed", updatedAt: new Date(NOW.getTime() - 8 * 86_400_000).toISOString() },
        // contacted 25 days ago -> was due 15 days ago, already overdue/surfaced elsewhere
        overdue: { status: "emailed", updatedAt: new Date(NOW.getTime() - 25 * 86_400_000).toISOString() },
      },
      NOW
    );
    expect(items.some((i) => i.id === "due-due-soon")).toBe(true);
    expect(items.some((i) => i.id === "due-overdue")).toBe(false);
  });
});

describe("isSundayCheckinDue", () => {
  // 2026-11-08 is a real Sunday; 2026-11-11 is a real Wednesday.
  const SUNDAY = new Date("2026-11-08T12:00:00Z");
  const WEDNESDAY = new Date("2026-11-11T12:00:00Z");

  it("is due on Sunday with no entries logged at all", () => {
    expect(isSundayCheckinDue([], SUNDAY)).toBe(true);
  });

  it("is due on Sunday even right after a recent (non-today) entry", () => {
    expect(isSundayCheckinDue([{ recordedAt: "2026-11-05" }], SUNDAY)).toBe(true);
  });

  it("is NOT due on Sunday once today's entry already exists", () => {
    expect(isSundayCheckinDue([{ recordedAt: "2026-11-08" }], SUNDAY)).toBe(false);
  });

  it("is NOT due on a weekday with a recent entry inside the 7-day window", () => {
    expect(isSundayCheckinDue([{ recordedAt: "2026-11-09" }], WEDNESDAY)).toBe(false);
  });

  it("is due on a weekday once the last entry is more than 7 days old (genuinely overdue)", () => {
    expect(isSundayCheckinDue([{ recordedAt: "2026-11-01" }], WEDNESDAY)).toBe(true);
  });

  it("is due on a weekday with no entries ever logged", () => {
    expect(isSundayCheckinDue([], WEDNESDAY)).toBe(true);
  });

  it("is NOT due on a weekday once today's entry already exists, even if other entries are old", () => {
    expect(
      isSundayCheckinDue([{ recordedAt: "2026-10-01" }, { recordedAt: "2026-11-11" }], WEDNESDAY)
    ).toBe(false);
  });

  it("uses the most recently dated entry, not just the last one in the array", () => {
    // Oldest listed last, most recent listed first — still correctly NOT overdue.
    expect(
      isSundayCheckinDue([{ recordedAt: "2026-11-09" }, { recordedAt: "2026-01-01" }], WEDNESDAY)
    ).toBe(false);
  });
});

describe("daysSince", () => {
  it("computes whole days between two dates", () => {
    expect(daysSince(new Date(NOW.getTime() - 3 * 86_400_000).toISOString(), NOW)).toBe(3);
  });

  it("never returns a negative number for a future date", () => {
    expect(daysSince(new Date(NOW.getTime() + 86_400_000).toISOString(), NOW)).toBe(0);
  });
});
