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
}

// Signature component, pixel-exact to DesignSystem.dc.html's "Range bar":
// 10px pill track, filled team-range segment, 2px median tick, 18px "you"
// dot (ball-yellow fill, 2px ink border).
export function RangeBar({
  rangeStartPct,
  rangeEndPct,
  medianPct,
  youPct,
  caption,
  className,
}: RangeBarProps) {
  return (
    <div className={className}>
      <div className="relative mt-2 h-2.5 rounded-pill bg-line">
        <div
          className="absolute inset-y-0 rounded-pill bg-[#9CC8B0]"
          style={{ left: `${rangeStartPct}%`, right: `${100 - rangeEndPct}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-grass"
          style={{ left: `${medianPct}%` }}
        />
        <div
          className="absolute h-[18px] w-[18px] rounded-full border-2 border-ink bg-lime-accent"
          style={{ left: `calc(${youPct}% - 9px)`, top: "-4px" }}
        />
      </div>
      {caption && (
        <span className={cn("mt-2 block font-mono text-[13px] tabular-nums text-stone")}>
          {caption}
        </span>
      )}
    </div>
  );
}
