"use client";

import type { UtrDataPoint } from "@/lib/utr-projection";
import { estimateOnDate, type UtrEstimatePoint } from "@/lib/fit";
import { formatPlayerUtr, hasRealUtr } from "@/lib/utils";
import { formatDate } from "@/lib/time";
import { useMeasuredWidth } from "@/components/seeded/ui/use-measured-width";
import { approxTextWidth, monthYearLabel } from "@/components/seeded/ui/chart-axis";

interface UtrVsPlanChartProps {
  actualPoints: UtrDataPoint[];
  nextCheckpoint: { date: Date; utr: number } | null;
  /** lib/fit.ts projectionPath — the same estimate /plan shades and every
   *  ProjectionNote prints. Empty once the summer before senior year has
   *  begun. */
  estimate: UtrEstimatePoint[];
}

const H = 150;
const PAD_X = 10;
const PAD_TOP = 22;
const BASELINE = H - 24;
const FONT = "var(--font-inter)";
const NUMBER_FONT = "var(--font-mono-active)";

// /today's "UTR vs plan": solid line through the player's logged ratings,
// lime dot at the latest, dashed marker at the plan's next checkpoint, and
// the typical-growth estimate (lib/fit.ts) shaded up to it.
//
// C21: the end labels used to sit at fixed offsets in a 300-wide viewBox and
// were clipped ("Jun '2", "Jun '27 · 9.0"), and the y-axis only spanned the
// first and last ratings, so a dip between them fell off the chart. The
// viewBox is now the column's real width, every label is anchored inside it,
// and the y-range covers every logged value.
export function UtrVsPlanChart({ actualPoints, nextCheckpoint, estimate }: UtrVsPlanChartProps) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>(320);
  const sorted = [...actualPoints].filter((p) => hasRealUtr(p.utr)).sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sorted.length === 0) {
    return (
      <div ref={ref} className="flex h-[120px] items-center rounded-lg border border-dashed border-line px-4 text-sm text-stone">
        Log a UTR to start your chart.
      </div>
    );
  }

  const now = sorted[sorted.length - 1];
  const start = sorted[0];
  const checkpoint = nextCheckpoint && nextCheckpoint.date.getTime() > now.date.getTime() ? nextCheckpoint : null;
  const endDate = checkpoint?.date ?? new Date(now.date.getTime() + 180 * 86_400_000);

  // The estimate between today and the right edge of this chart.
  const band = estimate.filter((p) => p.date.getTime() <= endDate.getTime());
  const edge = estimateOnDate(estimate, endDate);
  if (edge && band.length > 0 && band[band.length - 1].date.getTime() < endDate.getTime()) band.push(edge);

  const utrValues = [...sorted.map((p) => p.utr), ...(checkpoint ? [checkpoint.utr] : []), ...band.flatMap((p) => [p.low, p.high])];
  const utrMin = Math.min(...utrValues) - 0.3;
  const utrMax = Math.max(...utrValues) + 0.3;
  const dateMin = start.date.getTime();
  const dateMax = Math.max(endDate.getTime(), dateMin + 1);

  const W = Math.max(240, width);
  const x = (t: number) => PAD_X + ((t - dateMin) / (dateMax - dateMin)) * (W - 2 * PAD_X);
  const y = (utr: number) => BASELINE - ((utr - utrMin) / (utrMax - utrMin)) * (BASELINE - PAD_TOP);

  const linePoints = sorted.map((p) => `${x(p.date.getTime())},${y(p.utr)}`).join(" ");
  const bandPath =
    band.length > 1
      ? `M${band.map((p) => `${x(p.date.getTime())},${y(p.high)}`).join(" L")} L${[...band]
          .reverse()
          .map((p) => `${x(p.date.getTime())},${y(p.low)}`)
          .join(" L")} Z`
      : null;

  const endX = x(endDate.getTime());
  const checkpointText = checkpoint ? `${monthYearLabel(checkpoint.date)} · ${formatPlayerUtr(checkpoint.utr)}` : "";
  // Anchored to END at the marker, so it reads leftwards from the edge
  // instead of running off it.
  const checkpointLabelX = Math.max(PAD_X + approxTextWidth(checkpointText, 11), endX - 4);

  return (
    <div ref={ref} className="w-full">
      <svg
        role="img"
        aria-label={`UTR ${formatPlayerUtr(now.utr)} as of ${monthYearLabel(now.date)}${
          checkpoint ? `, next checkpoint ${formatPlayerUtr(checkpoint.utr)} by ${monthYearLabel(checkpoint.date)}` : ""
        }`}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-full"
      >
        {bandPath && <path d={bandPath} fill="rgb(var(--c-primary-50))" />}
        {sorted.length > 1 && <polyline points={linePoints} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="2.5" />}
        {checkpoint && (
          <>
            <line x1={endX} y1={PAD_TOP - 4} x2={endX} y2={BASELINE} stroke="rgb(var(--c-gold))" strokeDasharray="3 3" />
            <text x={checkpointLabelX} y={PAD_TOP - 8} textAnchor="end" fontSize="11" fill="rgb(var(--c-ink))" fontFamily={FONT}>
              {monthYearLabel(checkpoint.date)} · <tspan fontFamily={NUMBER_FONT}>{formatPlayerUtr(checkpoint.utr)}</tspan>
            </text>
          </>
        )}
        <circle cx={x(now.date.getTime())} cy={y(now.utr)} r="6" fill="rgb(var(--c-lime))" stroke="rgb(var(--c-ink))" strokeWidth="2" />
        <text x={PAD_X} y={H - 6} fontSize="11" fill="rgb(var(--c-stone))" fontFamily={FONT}>
          {monthYearLabel(start.date)}
        </text>
        <text x={W - PAD_X} y={H - 6} textAnchor="end" fontSize="11" fill="rgb(var(--c-stone))" fontFamily={FONT}>
          {monthYearLabel(endDate)}
        </text>
      </svg>
      <p className="mt-1.5 text-[13px] text-stone">
        {bandPath ? "Shaded: your estimate for the summer before senior year." : "Your logged UTRs."}
        {checkpoint && ` Next checkpoint: ${formatPlayerUtr(checkpoint.utr)} by ${formatDate(checkpoint.date)}.`}
      </p>
    </div>
  );
}
