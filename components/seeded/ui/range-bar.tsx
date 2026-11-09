"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface RangeBarProps {
  /** Filled range, both 0–100, measured from the left edge. */
  rangeStartPct: number;
  rangeEndPct: number;
  /** Median tick position, 0–100. */
  medianPct: number;
  /** "You" dot position, 0–100. */
  youPct: number;
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
  you?: number;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
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
}: RangeBarProps) {
  const reduceMotion = useReducedMotion();
  const [tapOpen, setTapOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const hasDetail = low != null && median != null && high != null && you != null;

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
          hasDetail && "cursor-pointer"
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
        <div
          className={cn(
            "absolute h-[18px] w-[18px] rounded-full border-2 border-on-lime bg-lime-accent",
            transitionClass
          )}
          style={{ left: `calc(${youPct}% - 9px)`, top: "-4px" }}
        />

        {hasDetail && (
          <div
            role="tooltip"
            className={cn(
              "pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-10 w-max -translate-x-1/2 rounded-[8px] border border-line bg-card px-3 py-2 text-left text-xs leading-relaxed text-ink opacity-0 shadow-card transition-opacity",
              "group-hover:opacity-100",
              tapOpen && "opacity-100"
            )}
          >
            <p className="font-mono tabular-nums">
              Low {low!.toFixed(1)} · Median {median!.toFixed(1)} · High {high!.toFixed(1)}
            </p>
            <p className="mt-0.5 font-mono tabular-nums">
              You {you!.toFixed(1)} · Gap to median {signed(you! - median!)}
            </p>
          </div>
        )}
      </div>
      {caption && (
        <span className="mt-2 block font-mono text-[13px] tabular-nums text-stone">{caption}</span>
      )}
    </div>
  );
}
