import { describe, expect, it } from "vitest";
import { sampleParentDashboard } from "@/components/seeded/family/dashboard/sample-model";

/* The paywall's "Example" dashboard is labelled as an example, but its
 * numbers still have to add up: a parent deciding whether to pay is reading
 * it as a picture of what the page does. It once showed Camps $1,590 next
 * to a statement whose only camp was $640, and a season total no row
 * explained. These pin the arithmetic the real page gets by construction. */

const dollars = (s: string) => Number(s.replace(/[^0-9.-]/g, ""));

describe("the Example dashboard is internally consistent", () => {
  const model = sampleParentDashboard();
  const byKey = new Map(model.budget.categories.map((c) => [c.key, c.spent]));
  const rowsIn = (category: string) =>
    model.expenses.filter((r) => r.category === category).reduce((s, r) => s + dollars(r.amount), 0);

  it("the season total is the sum of the categories", () => {
    const sum = model.budget.categories.reduce((s, c) => s + c.spent, 0);
    expect(model.budget.total.spent).toBe(sum);
  });

  it("the season total is the sum of the statement rows shown (none hidden)", () => {
    const rows = model.expenses.reduce((s, r) => s + dollars(r.amount), 0);
    expect(rows).toBe(model.budget.total.spent);
  });

  it("Camps is the sum of its rows; Entries + Travel is theirs plus the entered tournaments", () => {
    expect(byKey.get("camps")).toBe(rowsIn("Camps"));
    expect((byKey.get("entries") ?? 0) + (byKey.get("travel") ?? 0)).toBe(
      rowsIn("Entries") + rowsIn("Travel") + rowsIn("Tournament")
    );
  });
});
