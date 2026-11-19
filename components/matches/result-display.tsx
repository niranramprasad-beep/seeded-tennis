import type { MatchRecord } from "@/lib/db/events";
import { cn, formatPlayerUtr, hasRealUtr } from "@/lib/utils";

// How a logged result reads, wherever it is shown (/matches, /events).
// Wins are green, losses neutral — a loss is not an error, and the old
// "win" chip was clay.

/** Opponent UTR with two decimals (8.20, 9.00) — lib/utils.ts
 * formatPlayerUtr, the one formatter for a logged rating. */
export function opponentUtrLabel(v: number | null): string | null {
  return hasRealUtr(v) ? formatPlayerUtr(v) : null;
}

/** "vs Alex Kim (8.20)", "vs Alex Kim", "vs an opponent rated 8.20", or
 * null when neither is known. Never "vs opponent 6.10". */
export function opponentLine(m: Pick<MatchRecord, "opponent" | "opponentUtr">): string | null {
  const name = m.opponent.trim();
  const utr = opponentUtrLabel(m.opponentUtr);
  if (name) return utr ? `vs ${name} (${utr})` : `vs ${name}`;
  if (utr) return `vs an opponent rated ${utr}`;
  return null;
}

export function ResultChip({ result }: { result: MatchRecord["result"] }) {
  if (!result) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill border px-2 py-0.5 text-xs font-semibold",
        result === "win" ? "border-grass-100 bg-grass-50 text-grass" : "border-line bg-card text-stone"
      )}
    >
      {result === "win" ? "Win" : "Loss"}
    </span>
  );
}

