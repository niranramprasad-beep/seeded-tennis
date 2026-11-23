"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn, formatPlayerUtr, formatUtrEstimate, formatUtrFor } from "@/lib/utils";
import { rangeBarYouLine } from "@/lib/fit-copy";

interface RangeBarProps {
  /** Filled range, both 0–100, measured from the left edge. */
  rangeStartPct: number;
  rangeEndPct: number;
  /** Median tick position, 0–100. */
  medianPct: number;
  /** "You" dot position, 0–100. */
  /** Where the player sits on the bar, or null when they have no real UTR
   *  yet — the marker is then simply not drawn, rather than parked at 0%
   *  where it would read as "this player is off the bottom of the scale". */
  youPct: number | null;
  caption?: string;
  className?: string;
  /** Raw UTR values behind the positions above — optional only for a
   * couple of illustrative/dev-only usages with no real numbers behind
   * them. Every real caller passes these so the shared hover (desktop) /
   * tap (touch) tooltip can show real low/median/high/your-value/gap
   * numbers — one implementation, every place this component is used
   * gets it for free. */
  low?: number;
  median?: number;
  high?: number;
  you?: number | null;
  /** Whose rating the dot is. Defaults to "You"; a parent viewing their
   *  child's fit must pass the child's name, or the tooltip tells them
   *  their own rating is 9.4 when they have none. */
  youLabel?: string;
  /**
   * A second, muted dot for the player's rating TODAY, shown when the bar's
   * primary dot is a projection to the summer before senior year and the two differ. Without
   * it the bar silently presents a projected position as the player's
   * current one — the same conflation that made the fit report tell four
   * stories at once. Omit (or pass null) when there is nothing to compare.
   */
  todayPct?: number | null;
  today?: number | null;
  /** True when `you` is the projection to the summer before senior year
   *  (lib/fit.ts) rather than a logged rating: it prints with one decimal,
   *  a logged rating with two (lib/utils.ts formatPlayerUtr — C10). */
  youIsEstimate?: boolean;
  /** The team range is a checked roster's (lib/catalog/merge.ts): the
   *  tooltip says floor / middle / top, not "average". */
  checked?: boolean;
  /** Which rating the dot is, in lib/fit-copy.ts ratingBasisLabel's words —
   *  "today", "by summer 2027, estimate", "by summer 2027, what-if". Printed
   *  after the number in the tooltip so a gap is never read as the wrong
   *  rating's (final-check A2). */
  youBasis?: string | null;
}

// Signature component, pixel-exact to DesignSystem.dc.html's "Range bar":
// 10px pill track, filled team-range segment, 2px median tick, 18px "you"
// dot (ball-yellow fill, 2px ink border). The positions transition smoothly
// when they move live (the what-if slider dragging the "you" dot across the
// whole list) unless prefers-reduced-motion is set, same precedent
// components/shared/animated-number.tsx and components/seeded/ui/toast.tsx
// already follow.
export function RangeBar({
  rangeStartPct,
  rangeEndPct,
  medianPct,
  youPct,
  caption,
  className,
  low,
  median,
  high,
  you,
  youLabel = "You",
  todayPct,
  today,
  youIsEstimate = false,
  youBasis = null,
  checked = false,
}: RangeBarProps) {
  const reduceMotion = useReducedMotion();
  const [tapOpen, setTapOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  // `you != null` was not enough: the "not tracked" sentinel is 0, and
  // `0 != null` is true, so the tooltip rendered "You 0.0 · Gap to median
  // -12.1" on every school row. Hiding the dot without hiding the tooltip
  // fixed the picture and left the claim.
  const hasRealYou = you != null && you > 0;
  const hasDetail = low != null && median != null && high != null && hasRealYou;

  // Touch has no real :hover — tap toggles the tooltip instead, and any
  // tap outside the bar dismisses it (the "tap-elsewhere-to-dismiss"
  // pattern this needs on mobile since hover never fires there).
  useEffect(() => {
    if (!tapOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (trackRef.current && !trackRef.current.contains(e.target as Node)) setTapOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [tapOpen]);

  const transitionClass = reduceMotion ? "" : "transition-[left,right] duration-200 ease-out";

  return (
    <div className={className}>
      <div
        ref={trackRef}
        // Its ::after extends the hit area to 50px (see below); the harness
        // reads this marker instead of the 10px visual track.
        data-hit-area={hasDetail ? "50" : undefined}
        role={hasDetail ? "button" : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        aria-label={hasDetail ? "Show range details" : undefined}
        aria-expanded={hasDetail ? tapOpen : undefined}
        onClick={
          hasDetail
            ? (e) => {
                e.stopPropagation();
                setTapOpen((v) => !v);
              }
            : undefined
        }
        onKeyDown={
          hasDetail
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setTapOpen((v) => !v);
                } else if (e.key === "Escape") {
                  setTapOpen(false);
                }
              }
            : undefined
        }
        className={cn(
          "group relative mt-2 h-2.5 rounded-pill bg-line",
          hasDetail &&
            "cursor-pointer after:absolute after:-inset-y-5 after:inset-x-0 after:content-[''] sm:after:hidden"
        )}
      >
        <div
          className={cn("absolute inset-y-0 rounded-pill bg-grass-300", transitionClass)}
          style={{ left: `${rangeStartPct}%`, right: `${100 - rangeEndPct}%` }}
        />
        <div
          className={cn("absolute inset-y-0 w-0.5 bg-grass", transitionClass)}
          style={{ left: `${medianPct}%` }}
        />
        {todayPct != null && today != null && today > 0 && youPct != null && Math.abs(todayPct - youPct) > 0.5 && (
          <div
            aria-hidden
            className={cn(
              "absolute h-[14px] w-[14px] rounded-full border-2 border-dashed border-stone bg-cream",
              transitionClass
            )}
            style={{ left: `calc(${todayPct}% - 7px)`, top: "-2px" }}
          />
        )}
        {youPct != null && hasRealYou && (
          <div
            className={cn(
              "absolute h-[18px] w-[18px] rounded-full border-2 border-on-lime bg-lime-accent",
              transitionClass
            )}
            style={{ left: `calc(${youPct}% - 9px)`, top: "-4px" }}
          />
        )}

        {hasDetail && (
          <div
            role="tooltip"
            className={cn(
              "pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-10 w-max max-w-[min(20rem,calc(100vw-2.5rem))] -translate-x-1/2 rounded-[8px] border border-line bg-card px-3 py-2 text-left text-xs leading-relaxed text-ink opacity-0 shadow-card transition-opacity",
              "group-hover:opacity-100",
              tapOpen && "opacity-100"
            )}
          >
            <p className="font-mono tabular-nums">
              Floor {formatUtrEstimate(low!)} · {checked ? "Middle" : "Average"} {formatUtrEstimate(median!)} · Top of range {formatUtrEstimate(high!)}
            </p>
            <p className="mt-0.5 font-mono tabular-nums">
              {/* "0.3 below the team average", never a signed "gap" a
                  family has to decode (A-007). The helper takes (rating,
                  line) and decides the side itself. */}
              {rangeBarYouLine({ youLabel, you: you!, youIsEstimate, youBasis, median: median!, checked })}
            </p>
            {today != null && today > 0 && Math.abs(today - you!) > 0.05 && (
              <p className="mt-0.5 font-mono tabular-nums text-stone">
                Today {formatPlayerUtr(today)} (hollow marker)
              </p>
            )}
          </div>
        )}
      </div>
      {caption && (
        <span className="mt-2 block font-mono text-[13px] tabular-nums text-stone">{caption}</span>
      )}
    </div>
  );
}
