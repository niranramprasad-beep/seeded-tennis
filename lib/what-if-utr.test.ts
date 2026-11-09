import { describe, expect, it } from "vitest";
import {
  clampToRealisticUtr,
  computeMyPaceUTR,
  computePlusPaceUTR,
  whatIfProjectionFor,
  WHAT_IF_HYPOTHETICAL_PACE_PER_YEAR,
} from "./what-if-utr";
import type { UtrDataPoint } from "./utr-projection";

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

describe("clampToRealisticUtr", () => {
  it("passes a value already inside the realistic range through unchanged", () => {
    expect(clampToRealisticUtr(10, "male")).toBe(10);
  });

  it("clamps to the gender's realistic ceiling", () => {
    expect(clampToRealisticUtr(99, "male")).toBe(14);
    expect(clampToRealisticUtr(99, "female")).toBe(12.5);
  });

  it("clamps to the realistic floor", () => {
    expect(clampToRealisticUtr(-5, "male")).toBe(1.0);
  });
});

describe("computeMyPaceUTR", () => {
  it("returns null with fewer than 3 real history points", () => {
    const history: UtrDataPoint[] = [
      { date: d("2024-01-01"), utr: 8 },
      { date: d("2024-06-01"), utr: 8.5 },
    ];
    expect(
      computeMyPaceUTR({ utrHistory: history, graduationYear: 2027, gender: "male" })
    ).toBeNull();
  });

  it("projects a real upward trend forward to the senior-summer milestone", () => {
    // Steady +1/yr trend. Graduation 2026 -> senior summer is June 2025.
    const history: UtrDataPoint[] = [
      { date: d("2023-06-01"), utr: 7 },
      { date: d("2023-12-01"), utr: 7.5 },
      { date: d("2024-06-01"), utr: 8 },
    ];
    const result = computeMyPaceUTR({
      utrHistory: history,
      graduationYear: 2026,
      gender: "male",
      now: d("2024-06-01"),
    });
    expect(result).not.toBeNull();
    // Trend is +1/yr; one more year to June 2025 should land near 9.
    expect(result!).toBeGreaterThan(8);
    expect(result!).toBeLessThan(10);
  });

  it("never exceeds the gender's realistic ceiling even with a hot streak", () => {
    const history: UtrDataPoint[] = [
      { date: d("2023-01-01"), utr: 10 },
      { date: d("2023-06-01"), utr: 13 },
      { date: d("2023-12-01"), utr: 16 },
    ];
    const result = computeMyPaceUTR({
      utrHistory: history,
      graduationYear: 2030,
      gender: "female",
      now: d("2023-12-01"),
    });
    expect(result).not.toBeNull();
    expect(result!).toBeLessThanOrEqual(12.5 + 0.31); // ceiling + soft-cap slack
  });
});

describe("computePlusPaceUTR", () => {
  it("adds the default +1.5/yr rate over the real years remaining", () => {
    // Exactly 2 years from "now" to the June-of-senior-year milestone.
    const value = computePlusPaceUTR({
      currentUTR: 7,
      graduationYear: 2026,
      gender: "male",
      now: d("2023-06-01"),
    });
    // 7 + 1.5*2 = 10
    expect(value).toBeCloseTo(10, 1);
  });

  it("supports a custom rate", () => {
    const value = computePlusPaceUTR({
      currentUTR: 7,
      graduationYear: 2026,
      gender: "male",
      ratePerYear: 1,
      now: d("2023-06-01"),
    });
    expect(value).toBeCloseTo(9, 1);
  });

  it("never goes backward in time once the milestone has passed", () => {
    const value = computePlusPaceUTR({
      currentUTR: 7,
      graduationYear: 2020,
      gender: "male",
      now: d("2024-01-01"),
    });
    expect(value).toBe(7);
  });

  it("clamps the result to the realistic ceiling", () => {
    const value = computePlusPaceUTR({
      currentUTR: 13,
      graduationYear: 2030,
      gender: "male",
      ratePerYear: 10,
      now: d("2020-01-01"),
    });
    expect(value).toBe(14);
  });

  it("exports the documented default rate", () => {
    expect(WHAT_IF_HYPOTHETICAL_PACE_PER_YEAR).toBe(1.5);
  });
});

describe("whatIfProjectionFor", () => {
  const real = { utrHistory: [], graduationYear: 2026, gender: "male" as const };

  it("passes real history through for 'mine'", () => {
    expect(whatIfProjectionFor("mine", real)).toBe(real);
  });

  it("omits the projection for '+1.5/yr' — no real trend backs it", () => {
    expect(whatIfProjectionFor("plus1.5", real)).toBeUndefined();
  });

  it("omits the projection for 'custom' — no real trend backs it either", () => {
    expect(whatIfProjectionFor("custom", real)).toBeUndefined();
  });
});
