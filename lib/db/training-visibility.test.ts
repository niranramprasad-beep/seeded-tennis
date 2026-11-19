import { describe, expect, it } from "vitest";
import { HAND_ADDED_AFTER_MS, LEGACY_HAND_PLAN_NAME, isPlayerAddedSession, type PlanVisibilityRow } from "./training";

// Which training sessions /events shows (reviewer finding, PR C). The first
// version showed only sessions in a {"kind":"manual"} plan, which would have
// hidden every session a player added by hand before 2026-11-18: those went
// into the player's ACTIVE plan (usually a generated one) or into the
// "My sessions" plan withGuaranteedPlan() created with metadata {}.

const T0 = "2026-09-01T12:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(T0) + ms).toISOString();
const plan = (over: Partial<PlanVisibilityRow> = {}): PlanVisibilityRow => ({
  id: "p1",
  name: "6h personalized recruiting week",
  metadata: {},
  created_at: T0,
  ...over,
});
const session = (createdAt: string, planId = "p1") => ({ training_plan_id: planId, created_at: createdAt });

describe("isPlayerAddedSession", () => {
  it("shows every session in the manual plan, whenever it was created", () => {
    const p = plan({ name: "anything", metadata: { kind: "manual" } });
    expect(isPlayerAddedSession(session(T0), p)).toBe(true);
    expect(isPlayerAddedSession(session(at(5 * 86400_000)), p)).toBe(true);
  });

  it('shows every session in the old "My sessions" plan (metadata {})', () => {
    expect(LEGACY_HAND_PLAN_NAME).toBe("My sessions");
    const p = plan({ name: "My sessions", metadata: {} });
    expect(isPlayerAddedSession(session(T0), p)).toBe(true);
    // the name must match exactly — not a generator name that contains it
    expect(isPlayerAddedSession(session(T0), plan({ name: "My sessions (generated)" }))).toBe(false);
  });

  it("shows a session added to a generated plan more than a minute after the plan", () => {
    expect(isPlayerAddedSession(session(at(HAND_ADDED_AFTER_MS + 1)), plan())).toBe(true);
    expect(isPlayerAddedSession(session(at(3 * 86400_000)), plan())).toBe(true);
  });

  it("hides generator rows: created with their plan (same instant, or within the minute)", () => {
    expect(isPlayerAddedSession(session(T0), plan())).toBe(false);
    expect(isPlayerAddedSession(session(at(800)), plan())).toBe(false);
    expect(isPlayerAddedSession(session(at(HAND_ADDED_AFTER_MS)), plan())).toBe(false);
    // and a "manual"-looking metadata in any other shape is not the manual plan
    expect(isPlayerAddedSession(session(T0), plan({ metadata: ["manual"] }))).toBe(false);
    expect(isPlayerAddedSession(session(T0), plan({ metadata: { kind: "generated" } }))).toBe(false);
  });

  it("never shows a session whose plan is unknown or is a different plan", () => {
    expect(isPlayerAddedSession(session(at(10 * 86400_000)), undefined)).toBe(false);
    expect(isPlayerAddedSession(session(at(10 * 86400_000), "p2"), plan())).toBe(false);
    expect(isPlayerAddedSession(session("not a date"), plan())).toBe(false);
  });
});
