import { hasRealUtr } from "@/lib/utils";

// The ONE helper for "how much did this number change", shown to users as a
// percent that LEADS ("+1.3%") with the raw change beside it as smaller
// secondary text ("+0.12") — never the percent alone (docs/DECISIONS.md,
// 2026-11-22, Design polish round 1). components/seeded/ui/change-figure.tsx
// is the one way it is drawn.
//
// This is growth of a number the family entered, never a chance of anything:
// fit bands are never a percent, and nothing here is ever fed a band.

/** U+2212 minus, the same sign every delta on the site uses. */
const MINUS = "−";

/**
 * Percent change from `from` to `to`, one decimal, explicit sign:
 * "+8.6%", "−2.1%". Returns null — the caller shows no percent — when:
 *  - either value is missing or not a finite number (no "NaN%");
 *  - `from` is zero or negative (no "Infinity%", no percent of nothing);
 *  - the change rounds to 0.0% (a flat line is not "+0.0%");
 *  - the figure is absurd (≥ 1,000,000%: a near-zero base).
 *
 * The magnitude is rounded half-up before the sign is applied, so a gain and
 * a loss of the same size print the same digits (Math.round(-62.5) is -62
 * but Math.round(62.5) is 63, and float noise pushes exact halves either way).
 */
export function formatPercentChange(
  from: number | null | undefined,
  to: number | null | undefined
): string | null {
  if (typeof from !== "number" || typeof to !== "number") return null;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return null;
  const pct = ((to - from) / from) * 100;
  const magnitude = Math.round(Math.abs(pct) * 10 + 1e-9) / 10;
  if (magnitude === 0) return null;
  // A near-zero base gives a meaningless (and, past 1e21, exponent-printed)
  // figure; there is no honest percent of almost nothing.
  if (!Number.isFinite(magnitude) || magnitude >= 1e6) return null;
  return `${pct > 0 ? "+" : MINUS}${magnitude.toFixed(1)}%`;
}

/**
 * The same, for two logged UTRs. Both must be real ratings (hasRealUtr: the
 * in-memory 0 sentinel means "not logged") — a percent of a placeholder is
 * never shown.
 */
export function formatUtrPercentChange(
  fromUtr: number | null | undefined,
  toUtr: number | null | undefined
): string | null {
  if (!hasRealUtr(fromUtr) || !hasRealUtr(toUtr)) return null;
  return formatPercentChange(fromUtr, toUtr);
}

/**
 * A raw change with an explicit sign, "+0.12" / "−0.12"; "0.00" when it
 * rounds to nothing. Rounds the magnitude half-up like the percent does.
 */
export function formatSignedAmount(delta: number, decimals = 2): string {
  const f = 10 ** decimals;
  const magnitude = Math.round(Math.abs(delta) * f + 1e-9) / f;
  if (magnitude === 0) return (0).toFixed(decimals);
  return `${delta > 0 ? "+" : MINUS}${magnitude.toFixed(decimals)}`;
}

export interface NumberChange {
  /** The raw change, "+0.12" — always shown, as the secondary text when a percent leads. */
  amount: string;
  /** "+1.3%", or null when there is no honest percent (see formatPercentChange). */
  percent: string | null;
  direction: "up" | "down" | "flat";
}

/**
 * Both halves of a UTR change between two logged ratings, or null when
 * either rating is not real (nothing to compare).
 */
export function utrChange(
  fromUtr: number | null | undefined,
  toUtr: number | null | undefined
): NumberChange | null {
  if (!hasRealUtr(fromUtr) || !hasRealUtr(toUtr)) return null;
  const amount = formatSignedAmount(toUtr - fromUtr, 2);
  const direction = amount === "0.00" ? "flat" : toUtr > fromUtr ? "up" : "down";
  // A change too small to show in the raw number has no percent either:
  // "+0.4% (0.00)" would contradict itself.
  return { amount, percent: direction === "flat" ? null : formatUtrPercentChange(fromUtr, toUtr), direction };
}
