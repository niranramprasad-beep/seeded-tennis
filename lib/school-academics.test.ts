import { describe, expect, it } from "vitest";
import { academicTier, ACADEMIC_TIER_LABEL } from "./school-academics";

describe("academicTier", () => {
  it("buckets by usNewsRanking thresholds", () => {
    expect(academicTier(1)).toBe("top25");
    expect(academicTier(25)).toBe("top25");
    expect(academicTier(26)).toBe("top50");
    expect(academicTier(50)).toBe("top50");
    expect(academicTier(51)).toBe("top100");
    expect(academicTier(100)).toBe("top100");
    expect(academicTier(101)).toBe("unranked");
    expect(academicTier(150)).toBe("unranked");
  });

  it("has a label for every tier", () => {
    for (const tier of Object.keys(ACADEMIC_TIER_LABEL) as (keyof typeof ACADEMIC_TIER_LABEL)[]) {
      expect(ACADEMIC_TIER_LABEL[tier]).toBeTruthy();
    }
  });
});
