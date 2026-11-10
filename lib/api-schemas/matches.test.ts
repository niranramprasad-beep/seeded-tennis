import { describe, expect, it } from "vitest";
import { MatchesBodySchema } from "./matches";

const prepPlan = {
  warmup: ["warm up"],
  tactics: ["tactic"],
  mental: ["mental"],
  matchDay: ["match day"],
  generatedAt: "2026-01-15T00:00:00.000Z",
};

describe("MatchesBodySchema (save)", () => {
  const validSave = {
    kind: "save" as const,
    matchDate: "2026-01-15",
    surface: "hard" as const,
    prepPlan,
  };

  it("accepts a minimal valid save", () => {
    expect(MatchesBodySchema.safeParse(validSave).success).toBe(true);
  });

  it("accepts a full save with every optional field set", () => {
    const result = MatchesBodySchema.safeParse({
      ...validSave,
      id: "match-1",
      opponent: "Jane Doe",
      opponentUtr: 11.2,
      tournamentName: "Spring Open",
      notificationRequested: true,
      result: "win",
      score: "6-4 6-2",
      worked: "serve",
      needsWork: "backhand",
      notes: "Good match",
      videoUrl: "https://example.com/video",
      aiAnalysis: {
        summary: "Solid win",
        takeaways: ["Keep attacking second serves"],
        drills: ["Cross-court rally"],
        nextWeekFocus: "Footwork",
        source: "ai" as const,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a null result and null aiAnalysis", () => {
    const result = MatchesBodySchema.safeParse({ ...validSave, result: null, aiAnalysis: null });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid surface", () => {
    const result = MatchesBodySchema.safeParse({ ...validSave, surface: "concrete" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid result", () => {
    const result = MatchesBodySchema.safeParse({ ...validSave, result: "tie" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing matchDate", () => {
    const { matchDate, ...rest } = validSave;
    expect(MatchesBodySchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty matchDate", () => {
    expect(MatchesBodySchema.safeParse({ ...validSave, matchDate: "" }).success).toBe(false);
  });

  it("rejects a missing prepPlan", () => {
    const { prepPlan: _prepPlan, ...rest } = validSave;
    expect(MatchesBodySchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a malformed prepPlan", () => {
    const result = MatchesBodySchema.safeParse({ ...validSave, prepPlan: { warmup: "not an array" } });
    expect(result.success).toBe(false);
  });
});

describe("MatchesBodySchema (delete)", () => {
  it("accepts a valid delete", () => {
    expect(MatchesBodySchema.safeParse({ kind: "delete", id: "match-1" }).success).toBe(true);
  });

  it("rejects a delete with no id", () => {
    expect(MatchesBodySchema.safeParse({ kind: "delete" }).success).toBe(false);
  });

  it("rejects a delete with an empty id", () => {
    expect(MatchesBodySchema.safeParse({ kind: "delete", id: "" }).success).toBe(false);
  });
});

describe("MatchesBodySchema (malformed)", () => {
  it("rejects an unknown kind", () => {
    expect(MatchesBodySchema.safeParse({ kind: "archive", id: "1" }).success).toBe(false);
  });

  it("rejects a completely malformed body", () => {
    expect(MatchesBodySchema.safeParse(null).success).toBe(false);
    expect(MatchesBodySchema.safeParse({}).success).toBe(false);
  });
});
