import { describe, expect, it } from "vitest";
import { regionForState, ALL_REGIONS } from "./school-regions";

describe("regionForState", () => {
  it("maps a few known states correctly", () => {
    expect(regionForState("VT")).toBe("Northeast");
    expect(regionForState("VA")).toBe("Mid-Atlantic");
    expect(regionForState("GA")).toBe("Southeast");
    expect(regionForState("IL")).toBe("Midwest");
    expect(regionForState("TX")).toBe("South");
    expect(regionForState("CA")).toBe("West");
  });

  it("is case-insensitive", () => {
    expect(regionForState("va")).toBe("Mid-Atlantic");
  });

  it("returns null for an unknown code", () => {
    expect(regionForState("ZZ")).toBeNull();
  });

  it("every region appears in ALL_REGIONS", () => {
    expect(ALL_REGIONS).toContain("Northeast");
    expect(ALL_REGIONS).toHaveLength(6);
  });
});
