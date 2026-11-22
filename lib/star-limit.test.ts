import { describe, expect, it } from "vitest";
import { starLimitToast } from "./star-limit";

describe("starLimitToast (final-check B22)", () => {
  it("never tells a signed-out visitor about their 'Free' plan or to upgrade", () => {
    const t = starLimitToast(false, 3);
    expect(t.message).not.toMatch(/^Free\b|Upgrade/);
    expect(t.message).toContain("3 schools");
  });
  it("keeps the upgrade sentence for a signed-in Free account", () => {
    expect(starLimitToast(true, 3)).toEqual({
      message: "Free tracks 3 schools. Upgrade to Player to track more.",
      action: { label: "See plans", href: "/pricing" },
    });
  });
});
