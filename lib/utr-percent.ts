import { hasRealUtr } from "@/lib/utils";

/**
 * The percent change between two logged UTRs, shown BESIDE the number
 * ("+0.85 (+8.6%)"), never instead of it (design polish round 1, Figma
 * "WD — NiranRamprasad — Seeded", 03 Stat tile).
 *
 * Returns null — and the caller shows nothing extra — unless both ratings are
 * real (hasRealUtr: the 0 sentinel means "not logged") and they differ.
 * One decimal; U+2212 minus, like utrKpi's deltaAmount. This is growth of a
 * rating the player entered, not a chance of anything: fit bands are never a
 * percent.
 */
export function formatUtrPercentChange(
  fromUtr: number | null | undefined,
  toUtr: number | null | undefined
): string | null {
  if (!hasRealUtr(fromUtr) || !hasRealUtr(toUtr)) return null;
  const pct = ((toUtr - fromUtr) / fromUtr) * 100;
  // Round the magnitude, half up, so a gain and a loss of the same size print
  // the same digits: Math.round(-62.5) is -62 but Math.round(62.5) is 63, and
  // float noise (1.19 − 1.12 = 0.06999…) pushes exact halves either way.
  const magnitude = Math.round(Math.abs(pct) * 10 + 1e-9) / 10;
  if (magnitude === 0) return null;
  return `${pct > 0 ? "+" : "−"}${magnitude.toFixed(1)}%`;
}
