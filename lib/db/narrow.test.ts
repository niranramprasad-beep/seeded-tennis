import { describe, expect, it } from "vitest";
import { narrowLiteral, narrowNullableLiteral, narrowOptionalLiteral } from "./narrow";

describe("narrowLiteral", () => {
  it("returns the value when it's one of the allowed literals", () => {
    expect(narrowLiteral("clay", ["hard", "clay", "grass", "indoor"], "hard")).toBe("clay");
  });

  it("falls back when the value isn't allowed", () => {
    expect(narrowLiteral("concrete", ["hard", "clay", "grass", "indoor"], "hard")).toBe("hard");
  });

  it("falls back on an empty string", () => {
    expect(narrowLiteral("", ["low", "moderate", "high"], "moderate")).toBe("moderate");
  });
});

describe("narrowNullableLiteral", () => {
  it("returns the value when allowed", () => {
    expect(narrowNullableLiteral("win", ["win", "loss"])).toBe("win");
  });

  it("passes null straight through regardless of fallback", () => {
    expect(narrowNullableLiteral(null, ["win", "loss"], "win")).toBeNull();
  });

  it("falls back (default null) when the non-null value isn't allowed", () => {
    expect(narrowNullableLiteral("tie", ["win", "loss"])).toBeNull();
  });

  it("falls back to a caller-supplied non-null default when given one", () => {
    expect(narrowNullableLiteral("tie", ["win", "loss"], "win")).toBe("win");
  });
});

describe("narrowOptionalLiteral", () => {
  it("returns the value when allowed", () => {
    expect(narrowOptionalLiteral("male", ["male", "female"])).toBe("male");
  });

  it("returns undefined for null", () => {
    expect(narrowOptionalLiteral(null, ["male", "female"])).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(narrowOptionalLiteral(undefined, ["male", "female"])).toBeUndefined();
  });

  it("returns undefined when the value isn't allowed", () => {
    expect(narrowOptionalLiteral("nonbinary", ["male", "female"])).toBeUndefined();
  });
});
