import { describe, expect, it } from "vitest";
import { formatUtrPercentChange } from "./utr-percent";

describe("formatUtrPercentChange", () => {
  it("formats a gain to one decimal with an explicit plus", () => {
    expect(formatUtrPercentChange(9.9, 10.75)).toBe("+8.6%");
  });

  it("formats a loss with the U+2212 minus", () => {
    expect(formatUtrPercentChange(10, 9.79)).toBe("−2.1%");
  });

  it("hides an unchanged rating", () => {
    expect(formatUtrPercentChange(10, 10)).toBeNull();
  });

  it.each([0, null, undefined, NaN])("hides missing or invalid input %s in either position", (value) => {
    expect(formatUtrPercentChange(value, 10)).toBeNull();
    expect(formatUtrPercentChange(10, value)).toBeNull();
  });

  it.each([10.001, 9.999])("hides a tiny change to %s that rounds to zero", (value) => {
    expect(formatUtrPercentChange(10, value)).toBeNull();
  });
});
