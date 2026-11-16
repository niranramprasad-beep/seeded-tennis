import { describe, expect, it } from "vitest";
import {
  MAX_SERIES_WEEKS,
  addDaysToDateKey,
  generateWeeklySeriesDates,
  resizedDuration,
  snapToQuarterHour,
  startTimeFromPointer,
} from "./calendar-interactions";

describe("snapToQuarterHour", () => {
  it("rounds to the nearest 15 minutes", () => {
    expect(snapToQuarterHour(7)).toBe(0);
    expect(snapToQuarterHour(8)).toBe(15);
    expect(snapToQuarterHour(22)).toBe(15);
    expect(snapToQuarterHour(23)).toBe(30);
  });
});

describe("startTimeFromPointer", () => {
  it("converts a pixel offset at the grid top into the grid's start hour", () => {
    expect(startTimeFromPointer(0)).toBe("06:00");
  });

  it("converts one full hour of pixels into +1 hour", () => {
    // HOUR_HEIGHT is 64px — one hour down from the grid top.
    expect(startTimeFromPointer(64)).toBe("07:00");
  });

  it("subtracts the original grab offset so the block's top (not the cursor) lands at the drop point", () => {
    // Grabbed 32px (half an hour) into the block, dropped 96px down the
    // grid — the block's top should land at 96 - 32 = 64px, i.e. 07:00.
    expect(startTimeFromPointer(96, 32)).toBe("07:00");
  });

  it("snaps to the nearest 15 minutes", () => {
    // 5px ≈ 4.7 minutes past the grid start → snaps down to 06:00.
    expect(startTimeFromPointer(5)).toBe("06:00");
    // 70px ≈ 65.6 minutes past the grid start → snaps up to 07:00.
    expect(startTimeFromPointer(70)).toBe("07:00");
  });

  it("never returns a time before the grid's start hour", () => {
    expect(startTimeFromPointer(-500)).toBe("00:00");
  });
});

describe("resizedDuration", () => {
  it("grows duration when dragging the bottom edge down", () => {
    // 64px = 1 hour at HOUR_HEIGHT=64.
    expect(resizedDuration(60, 64)).toBe(120);
  });

  it("shrinks duration when dragging the bottom edge up", () => {
    expect(resizedDuration(60, -32)).toBe(30);
  });

  it("never shrinks below the minimum duration", () => {
    expect(resizedDuration(60, -1000)).toBe(15);
  });

  it("snaps the resulting duration to 15 minutes", () => {
    // 60 + (10/64)*60 ≈ 69.4 → snaps to 75.
    expect(resizedDuration(60, 10)).toBe(75);
  });

  it("respects a custom minimum duration", () => {
    expect(resizedDuration(30, -1000, 30)).toBe(30);
  });
});

describe("addDaysToDateKey", () => {
  it("adds days within the same month", () => {
    expect(addDaysToDateKey("2026-11-02", 7)).toBe("2026-11-09");
  });

  it("rolls over a month boundary", () => {
    expect(addDaysToDateKey("2026-11-28", 7)).toBe("2026-12-05");
  });

  it("rolls over a year boundary", () => {
    expect(addDaysToDateKey("2026-12-29", 7)).toBe("2027-01-05");
  });

  it("handles leap-day rollover", () => {
    expect(addDaysToDateKey("2028-02-25", 7)).toBe("2028-03-03");
  });
});

describe("generateWeeklySeriesDates", () => {
  it("returns exactly one date for a count of 1", () => {
    expect(generateWeeklySeriesDates("2026-11-02", 1)).toEqual(["2026-11-02"]);
  });

  it("generates weekly-spaced dates starting from the base date", () => {
    expect(generateWeeklySeriesDates("2026-11-02", 3)).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
    ]);
  });

  it("clamps a requested count above the bound to MAX_SERIES_WEEKS", () => {
    const dates = generateWeeklySeriesDates("2026-11-02", 999);
    expect(dates).toHaveLength(MAX_SERIES_WEEKS);
    expect(dates[dates.length - 1]).toBe(addDaysToDateKey("2026-11-02", (MAX_SERIES_WEEKS - 1) * 7));
  });

  it("clamps a requested count below 1 up to 1", () => {
    expect(generateWeeklySeriesDates("2026-11-02", 0)).toEqual(["2026-11-02"]);
    expect(generateWeeklySeriesDates("2026-11-02", -5)).toEqual(["2026-11-02"]);
  });

  it("rounds a non-integer count", () => {
    expect(generateWeeklySeriesDates("2026-11-02", 2.6)).toHaveLength(3);
  });
});
