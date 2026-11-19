import { describe, expect, it } from "vitest";
import { isRealDateKey, MAX_SESSIONS_PER_WRITE, TrainingSessionsBodySchema } from "./training-sessions";
import { weekdayOf } from "@/lib/db/training";

const session = {
  id: "8f9c1c1e-0d5b-4c43-9a51-2f7f3f5f0a11",
  date: "2026-11-18",
  startTime: "16:30",
  duration: 60,
  typeId: "tennis",
  notes: "",
  seriesId: null,
};

describe("TrainingSessionsBodySchema", () => {
  it("accepts a create, an update and a delete", () => {
    expect(TrainingSessionsBodySchema.safeParse({ kind: "create", sessions: [session] }).success).toBe(true);
    expect(TrainingSessionsBodySchema.safeParse({ kind: "update", session }).success).toBe(true);
    expect(TrainingSessionsBodySchema.safeParse({ kind: "delete", ids: [session.id] }).success).toBe(true);
  });

  it("refuses a date that is not a real calendar day", () => {
    for (const date of ["2026-02-30", "2026-13-01", "18/11/2026", ""]) {
      expect(TrainingSessionsBodySchema.safeParse({ kind: "update", session: { ...session, date } }).success, date).toBe(false);
    }
  });

  it("refuses a malformed start time and a length outside 15 min – 8 h", () => {
    expect(TrainingSessionsBodySchema.safeParse({ kind: "update", session: { ...session, startTime: "25:00" } }).success).toBe(false);
    expect(TrainingSessionsBodySchema.safeParse({ kind: "update", session: { ...session, duration: 10 } }).success).toBe(false);
    expect(TrainingSessionsBodySchema.safeParse({ kind: "update", session: { ...session, duration: 600 } }).success).toBe(false);
  });

  it("refuses a session type that is not in the fixed list", () => {
    expect(TrainingSessionsBodySchema.safeParse({ kind: "update", session: { ...session, typeId: "ai-plan" } }).success).toBe(false);
  });

  it("caps one write at a season's worth of weekly repeats", () => {
    const many = Array.from({ length: MAX_SESSIONS_PER_WRITE + 1 }, () => session);
    expect(TrainingSessionsBodySchema.safeParse({ kind: "create", sessions: many }).success).toBe(false);
  });

  it("has no whole-state shape: a planner state is refused", () => {
    expect(
      TrainingSessionsBodySchema.safeParse({ sessions: [], plans: [], activePlanId: "", sessionTypes: [], templates: [] }).success
    ).toBe(false);
  });
});

describe("date-only helpers", () => {
  it("isRealDateKey", () => {
    expect(isRealDateKey("2028-02-29")).toBe(true);
    expect(isRealDateKey("2027-02-29")).toBe(false);
  });

  it("weekdayOf reads the date as a calendar day, not a UTC instant", () => {
    expect(weekdayOf("2026-11-18")).toBe("Wed");
    expect(weekdayOf("2026-11-22")).toBe("Sun");
    expect(weekdayOf("2027-01-01")).toBe("Fri");
  });
});
