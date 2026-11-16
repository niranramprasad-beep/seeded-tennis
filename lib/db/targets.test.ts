import { describe, expect, it } from "vitest";
import { isTargetSchool, toggleTargetSchoolSlug } from "./targets";

describe("toggleTargetSchoolSlug", () => {
  it("adds a slug that isn't already present", () => {
    expect(toggleTargetSchoolSlug(["duke-w"], "unc-w")).toEqual(["duke-w", "unc-w"]);
  });

  it("removes a slug that's already present", () => {
    expect(toggleTargetSchoolSlug(["duke-w", "unc-w"], "duke-w")).toEqual(["unc-w"]);
  });

  it("adding to an empty list just returns a single-item list", () => {
    expect(toggleTargetSchoolSlug([], "duke-w")).toEqual(["duke-w"]);
  });

  it("never mutates the input array", () => {
    const original = ["duke-w"];
    toggleTargetSchoolSlug(original, "unc-w");
    expect(original).toEqual(["duke-w"]);
  });
});

describe("isTargetSchool", () => {
  it("is true when the slug is in the list", () => {
    expect(isTargetSchool(["duke-w", "unc-w"], "unc-w")).toBe(true);
  });

  it("is false when the slug isn't in the list", () => {
    expect(isTargetSchool(["duke-w"], "unc-w")).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(isTargetSchool([], "duke-w")).toBe(false);
  });
});
