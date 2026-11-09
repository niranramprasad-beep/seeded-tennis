import { describe, expect, it } from "vitest";
import { utrDeltaOverMonths, utrDeltaWithBaseline, winLossRecord, buildPlanChecklist } from "./plan-stats";
import type { UtrEntry } from "@/lib/db/plan";
import type { MatchRecord } from "@/lib/db/events";

const entry = (utr: number, daysAgo: number, now: Date): UtrEntry => ({
  id: `e-${daysAgo}`,
  utr,
  recordedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
  note: "",
});

const match = (result: MatchRecord["result"]): MatchRecord =>
  ({ result } as MatchRecord);

describe("utrDeltaOverMonths", () => {
  const now = new Date("2026-11-08T00:00:00Z");

  it("returns null with no entries", () => {
    expect(utrDeltaOverMonths([], 6, now)).toBeNull();
  });

  it("returns null when no entry is old enough to compare against", () => {
    const entries = [entry(9.0, 10, now), entry(9.2, 2, now)];
    expect(utrDeltaOverMonths(entries, 6, now)).toBeNull();
  });

  it("computes a real delta against the most recent entry at/before the cutoff", () => {
    const entries = [entry(9.0, 200, now), entry(9.3, 190, now), entry(9.8, 5, now)];
    expect(utrDeltaOverMonths(entries, 6, now)).toBeCloseTo(0.5, 5);
  });

  it("picks the entry closest to (but not after) the cutoff when several qualify", () => {
    const entries = [entry(8.5, 400, now), entry(9.0, 200, now), entry(9.8, 1, now)];
    expect(utrDeltaOverMonths(entries, 6, now)).toBeCloseTo(0.8, 5);
  });
});

describe("utrDeltaWithBaseline", () => {
  const now = new Date("2026-11-08T00:00:00Z");

  it("returns the same delta as utrDeltaOverMonths plus the real baseline entry's date", () => {
    const entries = [entry(9.0, 200, now), entry(9.3, 190, now), entry(9.8, 5, now)];
    const result = utrDeltaWithBaseline(entries, 6, now);
    expect(result?.delta).toBeCloseTo(0.5, 5);
    expect(result?.baselineDate).toBe(entries[1].recordedAt);
  });

  it("returns null under the same conditions utrDeltaOverMonths does", () => {
    expect(utrDeltaWithBaseline([], 6, now)).toBeNull();
    expect(utrDeltaWithBaseline([entry(9.0, 10, now)], 6, now)).toBeNull();
  });
});

describe("winLossRecord", () => {
  it("counts wins and losses, ignoring unresolved matches", () => {
    const matches = [match("win"), match("win"), match("loss"), match(null)];
    expect(winLossRecord(matches)).toEqual({ wins: 2, losses: 1 });
  });

  it("handles an empty list", () => {
    expect(winLossRecord([])).toEqual({ wins: 0, losses: 0 });
  });
});

describe("buildPlanChecklist", () => {
  it("marks items done only when the real counts clear the threshold", () => {
    const items = buildPlanChecklist(12, 8);
    expect(items.find((i) => i.id === "save-schools")?.done).toBe(true);
    expect(items.find((i) => i.id === "email-coaches")?.done).toBe(true);
  });

  it("marks items undone when counts fall short, and reflects the real count in the label", () => {
    const items = buildPlanChecklist(4, 2);
    expect(items.find((i) => i.id === "save-schools")?.done).toBe(false);
    const email = items.find((i) => i.id === "email-coaches");
    expect(email?.done).toBe(false);
    expect(email?.label).toContain("2 sent");
  });

  it("only returns the two items with a real computable boolean", () => {
    expect(buildPlanChecklist(0, 0).map((i) => i.id)).toEqual(["save-schools", "email-coaches"]);
  });
});
