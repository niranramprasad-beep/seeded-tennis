import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatCheckpointUtr, formatPlayerUtr, formatTargetUtr } from "./utils";
import { chartEndLabels, paceUpsideSentence, type UtrEstimatePoint } from "./fit";

// PR-POLISH (2026-11-20): a UTR Seeded computed as a TARGET (plan checkpoints,
// the upside "Estimate", "We plan with …") prints at the nearest 0.05. A
// rating the player logged or typed keeps its exact two decimals.
describe("formatTargetUtr — nearest 0.05, two decimals", () => {
  it.each([
    [6.59, "6.60"],
    [6.57, "6.55"],
    [6.575, "6.60"], // half rounds up despite 131.49999… in floating point
    [6.524, "6.50"],
    [7.12, "7.10"],
    [7.13, "7.15"],
    [8.1, "8.10"],
    [9, "9.00"],
    [16.49, "16.50"],
    [1, "1.00"],
  ])("%s → %s", (v, out) => {
    expect(formatTargetUtr(v)).toBe(out);
  });

  it("a logged rating is NOT rounded — formatPlayerUtr keeps what was entered", () => {
    expect(formatPlayerUtr(6.59)).toBe("6.59");
    expect(formatPlayerUtr(5.97)).toBe("5.97");
  });
});

describe("formatCheckpointUtr", () => {
  it("rounds a checkpoint on the way to the goal", () => {
    expect(formatCheckpointUtr(6.59, 8.73)).toBe("6.60");
    expect(formatCheckpointUtr(6.59, null)).toBe("6.60");
    expect(formatCheckpointUtr(6.59)).toBe("6.60");
  });

  it("prints the final checkpoint — the player's own goal — exactly as typed", () => {
    expect(formatCheckpointUtr(8.73, 8.73)).toBe("8.73");
  });
});

describe("the computed labels go through it", () => {
  const pt = (value: number): UtrEstimatePoint =>
    ({ date: new Date(2027, 5, 1), value, low: value, high: value }) as UtrEstimatePoint;

  it("chartEndLabels' upside reads 'Estimate 9.45' for 9.43; the plan end keeps one decimal", () => {
    const labels = chartEndLabels([pt(8.1)], [pt(9.43)]);
    expect(labels.upside).toBe("Estimate 9.45");
    expect(labels.plan).toBe("8.1");
  });

  it("paceUpsideSentence prints both targets through formatTargetUtr", () => {
    const s = paceUpsideSentence({ value: 8.1, upside: { value: 9.4, perYear: 2 } } as never);
    expect(s).toContain("reach 9.40. We plan with 8.10 ");
  });

  it("/plan and /today print checkpoints with formatCheckpointUtr, never formatPlayerUtr", () => {
    const plan = readFileSync("components/seeded/roadmap/plan-trajectory-chart.tsx", "utf8");
    expect(plan).not.toMatch(/formatPlayerUtr\((c|sel)\.utr\)/);
    expect(plan).toMatch(/formatCheckpointUtr\(c\.utr/);
    const chart = readFileSync("components/seeded/dashboard/utr-vs-plan-chart.tsx", "utf8");
    expect(chart).not.toMatch(/formatPlayerUtr\(checkpoint\.utr\)/);
    expect(chart).toMatch(/formatCheckpointUtr\(checkpoint\.utr/);
    const today = readFileSync("components/seeded/dashboard/seeded-dashboard-layout.tsx", "utf8");
    expect(today).not.toMatch(/formatPlayerUtr\(nextCheckpoint\.utr\)/);
    expect(today).toMatch(/formatCheckpointUtr\(nextCheckpoint\.utr/);
  });
});
