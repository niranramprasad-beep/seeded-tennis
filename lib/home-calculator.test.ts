import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { onboardingQueryFor } from "./home-calculator";
import { prefillFromSearchParams } from "./onboarding/diagnostic";

const EXAMPLE = { utr: "9.4", gradYear: "2028", gender: "women", gpa: "3.7" };

describe("the homepage calculator never pre-answers onboarding with its example values", () => {
  it("untouched: no query at all, so onboarding asks every question", () => {
    const q = onboardingQueryFor(EXAMPLE, new Set());
    expect(q).toBe("");
    const { prefilled } = prefillFromSearchParams(Object.fromEntries(new URLSearchParams(q)));
    expect(prefilled).toEqual([]);
  });

  it("only the fields the visitor changed travel", () => {
    const q = new URLSearchParams(onboardingQueryFor({ ...EXAMPLE, utr: "8.1" }, new Set(["utr"])));
    expect(q.get("utr")).toBe("8.1");
    expect(q.has("gpa")).toBe(false);
    expect(q.has("gender")).toBe(false);
    expect(q.has("gradYear")).toBe(false);
  });

  it("the card builds its link through onboardingQueryFor, not from every field", () => {
    const src = readFileSync(join("components", "seeded", "home", "seeded-home-view.tsx"), "utf8");
    expect(src).toContain("onboardingQueryFor(");
    expect(src).not.toMatch(/new URLSearchParams\(\{\s*utr/);
  });

  it("both cards say their starting values are an example", () => {
    const src = readFileSync(join("components", "seeded", "home", "seeded-home-view.tsx"), "utf8");
    expect(src).toContain("Example output. Counts depend on your inputs."); // desktop
    expect(src).toContain("Example values. Change them to yours."); // phone
  });
});
