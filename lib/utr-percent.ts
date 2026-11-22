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
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return null;
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}%`;
}
