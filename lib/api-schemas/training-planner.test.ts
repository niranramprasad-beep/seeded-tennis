import { describe, expect, it } from "vitest";
import { TrainingPlannerBodySchema } from "./training-planner";

const session = {
  id: "s1",
  title: "Serve practice",
  typeId: "court",
  day: "Mon" as const,
  date: "2026-01-12",
  startTime: "16:00",
  duration: 60,
  intensity: "moderate" as const,
  notes: "",
  goals: "",
  drills: ["First serve targets"],
  completed: false,
};

const validState = {
  sessions: [session],
  sessionTypes: [{ id: "court", label: "Court", color: "#000", bg: "#fff", text: "#000" }],
  plans: [{ id: "p1", name: "My sessions", goal: "", sessionIds: ["s1"] }],
  activePlanId: "p1",
  templates: [],
};

describe("TrainingPlannerBodySchema", () => {
  it("accepts a minimal valid state", () => {
    expect(TrainingPlannerBodySchema.safeParse(validState).success).toBe(true);
  });

  it("accepts a session with a seriesId", () => {
    const result = TrainingPlannerBodySchema.safeParse({
      ...validState,
      sessions: [{ ...session, seriesId: "series-1" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a session with a null seriesId", () => {
    const result = TrainingPlannerBodySchema.safeParse({
      ...validState,
      sessions: [{ ...session, seriesId: null }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts preferences and templates when present", () => {
    const result = TrainingPlannerBodySchema.safeParse({
      ...validState,
      templates: [
        { id: "t1", name: "Serve block", templateType: "session", description: "", payload: { foo: "bar" } },
      ],
      preferences: { fullTime: false, weeklyHours: 6, primaryGoal: "Consistency", constraints: "" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid weekday", () => {
    const result = TrainingPlannerBodySchema.safeParse({
      ...validState,
      sessions: [{ ...session, day: "Someday" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid intensity", () => {
    const result = TrainingPlannerBodySchema.safeParse({
      ...validState,
      sessions: [{ ...session, intensity: "extreme" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid template type", () => {
    const result = TrainingPlannerBodySchema.safeParse({
      ...validState,
      templates: [{ id: "t1", name: "x", templateType: "workout", description: "", payload: {} }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing activePlanId", () => {
    const { activePlanId, ...rest } = validState;
    expect(TrainingPlannerBodySchema.safeParse(rest).success).toBe(false);
  });

  it("rejects drills that aren't strings", () => {
    const result = TrainingPlannerBodySchema.safeParse({
      ...validState,
      sessions: [{ ...session, drills: [1, 2, 3] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a completely malformed body", () => {
    expect(TrainingPlannerBodySchema.safeParse(null).success).toBe(false);
    expect(TrainingPlannerBodySchema.safeParse({}).success).toBe(false);
  });
});
