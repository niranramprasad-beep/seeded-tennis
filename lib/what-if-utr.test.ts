import { describe, expect, it } from "vitest";
import {
  clampToRealisticUtr,
  computeMyPaceUTR,
  computePlusPaceUTR,
  resolveWhatIfDisplay,
  whatIfProjectionFor,
  WHAT_IF_HYPOTHETICAL_PACE_PER_YEAR,
} from "./what-if-utr";
import { computeUtrProjection, type UtrDataPoint } from "./utr-projection";
import { summerBeforeSeniorYear } from "./school-fit";

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

describe("resolveWhatIfDisplay", () => {
  // P1-FIT-2: the panel seeded its state from props on first render — which
  // happens before the player loads — and kept the placeholder forever. A
  // 5.81 player saw "You 7.0" on every row of /schools.
  it("tracks currentUTR while the player hasn't touched the panel", () => {
    const beforeLoad = resolveWhatIfDisplay(null, {
      currentUTR: 7, // the lib/data/user.ts placeholder
      defaultMode: "plus1.5",
    });
    expect(beforeLoad.hypotheticalUTR).toBe(7);

    // The real player arrives. Nothing was stored, so nothing is stale.
    const afterLoad = resolveWhatIfDisplay(null, {
      currentUTR: 5.81,
      defaultMode: "mine",
    });
    expect(afterLoad.hypotheticalUTR).toBe(5.81);
    expect(afterLoad.paceMode).toBe("mine");
  });

  it("lights no pace button until the player picks one", () => {
    // The old panel highlighted the default mode on mount, so "+1.5/yr"
    // appeared selected next to a value that was just the current UTR.
    expect(resolveWhatIfDisplay(null, { currentUTR: 7, defaultMode: "plus1.5" }).activePaceMode)
      .toBeNull();
    expect(resolveWhatIfDisplay(null, { currentUTR: 7, defaultMode: "mine" }).activePaceMode)
      .toBeNull();
  });

  it("reports the untouched panel as being at the player's real current UTR", () => {
    expect(resolveWhatIfDisplay(null, { currentUTR: 9.42, defaultMode: "mine" }).isAtRealCurrent)
      .toBe(true);
  });

  it("honours an explicit choice over the props", () => {
    const chosen = resolveWhatIfDisplay(
      { mode: "custom", utr: 11.2 },
      { currentUTR: 5.81, defaultMode: "mine" }
    );
    expect(chosen.hypotheticalUTR).toBe(11.2);
    expect(chosen.paceMode).toBe("custom");
    expect(chosen.activePaceMode).toBe("custom");
    expect(chosen.isAtRealCurrent).toBe(false);
  });

  it("treats a choice that happens to equal the current UTR as still chosen", () => {
    // Otherwise Reset would vanish the moment a player dragged back to their
    // own number, stranding them in a mode they can't see or clear.
    const chosen = resolveWhatIfDisplay(
      { mode: "custom", utr: 5.81 },
      { currentUTR: 5.81, defaultMode: "mine" }
    );
    expect(chosen.isAtRealCurrent).toBe(false);
    expect(chosen.activePaceMode).toBe("custom");
  });
});

describe("whatIfProjectionFor", () => {
  // Grad year 2028 → senior-summer milestone is 2027-06-01, comfortably
  // ahead of `now`, so there is a real window to project across.
  const now = new Date("2026-01-01T00:00:00Z");
  const real = {
    utrHistory: [],
    graduationYear: 2028,
    gender: "male" as const,
    now,
  };
  const hypothetical = { currentUTR: 5.8, hypotheticalUTR: 9 };

  it("passes real history through for 'mine'", () => {
    expect(whatIfProjectionFor("mine", real, hypothetical)).toBe(real);
  });

  // P1-FIT-1: these two returned `undefined`, which doesn't abstain — it
  // makes classifySchoolFit answer "reach" for every school below the floor.
  it("always returns a projection, so a band can be 'out-of-range'", () => {
    for (const mode of ["plus1.5", "custom"] as const) {
      const result = whatIfProjectionFor(mode, real, hypothetical);
      expect(result).toBeDefined();
      expect(result.utrHistory.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("builds a line that actually arrives at the hypothetical UTR", () => {
    const result = whatIfProjectionFor("plus1.5", real, hypothetical);
    const computed = computeUtrProjection(result.utrHistory);
    expect(computed).not.toBeNull();
    const atMilestone = computed!.predict(summerBeforeSeniorYear(2028));
    expect(atMilestone).toBeCloseTo(9, 4);
  });

  it("keeps the real grad year and gender — only the history is synthetic", () => {
    const result = whatIfProjectionFor("custom", real, hypothetical);
    expect(result.graduationYear).toBe(2028);
    expect(result.gender).toBe("male");
    expect(result.utrHistory).not.toBe(real.utrHistory);
  });

  it("never mutates or borrows the player's real entries", () => {
    const withHistory = {
      ...real,
      utrHistory: [{ date: new Date("2025-06-01"), utr: 5.2 }],
    };
    const result = whatIfProjectionFor("plus1.5", withHistory, hypothetical);
    expect(withHistory.utrHistory).toHaveLength(1);
    expect(result.utrHistory.some((p) => p.utr === 5.2)).toBe(false);
  });

  it("represents a passed milestone as a flat line at the hypothetical", () => {
    // Grad year 2020 — the senior-summer milestone is long gone, so there is
    // no future window. classifySchoolFit evaluates at `now` in that case.
    const past = { ...real, graduationYear: 2020 };
    const result = whatIfProjectionFor("custom", past, hypothetical);
    expect(result.utrHistory.every((p) => p.utr === 9)).toBe(true);
    const computed = computeUtrProjection(result.utrHistory);
    expect(computed!.predict(now)).toBeCloseTo(9, 4);
  });

  it("handles a downward hypothetical as honestly as an upward one", () => {
    const downward = { currentUTR: 9, hypotheticalUTR: 6 };
    const result = whatIfProjectionFor("custom", real, downward);
    const computed = computeUtrProjection(result.utrHistory);
    expect(computed!.predict(summerBeforeSeniorYear(2028))).toBeCloseTo(6, 4);
  });
});
