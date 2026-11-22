import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXAMPLE_OUTPUT_NOTE,
  heroButtonLabel,
  heroOutputNote,
  onboardingQueryFor,
  OWN_OUTPUT_NOTE,
} from "./home-calculator";
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
    expect(src).toContain("heroOutputNote(touched)"); // desktop: "Example output…" until a value changes
    expect(EXAMPLE_OUTPUT_NOTE).toBe("Example output. Counts depend on your inputs.");
    expect(src).toContain("Example values. Change them to yours."); // phone
  });
});

describe("hero footnote and button (final-check A13)", () => {
  it("says 'Example output' only while nothing was changed", () => {
    expect(heroOutputNote(new Set())).toBe(EXAMPLE_OUTPUT_NOTE);
    expect(heroOutputNote(new Set(["utr"] as const))).toBe(OWN_OUTPUT_NOTE);
    expect(OWN_OUTPUT_NOTE).not.toMatch(/example/i);
  });
  it("names no example count on the button until the visitor changes a value", () => {
    expect(heroButtonLabel("See my 10 Target and Likely schools", new Set())).not.toMatch(/\d/);
    expect(heroButtonLabel("See my 10 Target and Likely schools", new Set(["gpa"] as const))).toBe(
      "See my 10 Target and Likely schools"
    );
  });
});
