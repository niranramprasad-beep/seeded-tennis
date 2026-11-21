"use client";

import type { UtrDataPoint } from "@/lib/utr-projection";
import { chartEndLabels, estimateOnDate, type UtrEstimatePoint } from "@/lib/fit";
import { formatCheckpointUtr, formatPlayerUtr, hasRealUtr } from "@/lib/utils";
import { useMeasuredWidth } from "@/components/seeded/ui/use-measured-width";
import { approxTextWidth, monthTicks, monthYearLabel, utrTicks } from "@/components/seeded/ui/chart-axis";

interface UtrVsPlanChartProps {
  actualPoints: UtrDataPoint[];
  nextCheckpoint: { date: Date; utr: number } | null;
  /** The player's own goal — the last checkpoint IS this number and prints
   *  exactly as typed (lib/utils.ts formatCheckpointUtr). */
  goalValue?: number | null;
  /** lib/fit.ts projectionPath — the same estimate /plan shades and every
   *  ProjectionNote prints. Empty once the summer before senior year has
   *  begun. */
  estimate: UtrEstimatePoint[];
  /** lib/fit.ts upsideProjectionPath — the player's own pace when it is
   *  faster than the planning cap: a grey dashed "Estimate" line. */
  upside?: UtrEstimatePoint[];
}

// 220 tall (was 150) since PR-POLISH: the card now sits in the main column,
// so the chart is ~750px wide at 1440 instead of ~280, with a y-axis and
// month ticks. Height is fixed, so measuring the width never shifts the page.
const H = 220;
const PAD_L = 34;
const PAD_R = 10;
const PAD_TOP = 26;
const BASELINE = H - 28;
const AXIS_FONT_SIZE = 12;
const FONT = "var(--font-inter)";
const NUMBER_FONT = "var(--font-mono-active)";

// /today's "UTR vs plan": solid line through the player's logged ratings,
// lime dot at the latest, dashed marker at the plan's next checkpoint, and
// the planning estimate (lib/fit.ts) shaded up to it. With no checkpoint
// (no goal set) the chart runs to the summer before senior year, so its end
// label is the planning estimate every screen prints; the upside, when there
// is one, is a grey dashed line labelled "Estimate" (PR D, D1).
//
// C21: the end labels used to sit at fixed offsets in a 300-wide viewBox and
// were clipped ("Jun '2", "Jun '27 · 9.0"), and the y-axis only spanned the
// first and last ratings, so a dip between them fell off the chart. The
// viewBox is the column's real width, every label is anchored inside it, and
// the y-range covers every logged value.
//
// The card's one data note (design system v2, rule 2) is rendered by the
// card in seeded-dashboard-layout.tsx, not here — this draws only.
export function UtrVsPlanChart({ actualPoints, nextCheckpoint, goalValue, estimate, upside = [] }: UtrVsPlanChartProps) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>(320);
  const sorted = [...actualPoints].filter((p) => hasRealUtr(p.utr)).sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sorted.length === 0) {
    return (
      <div ref={ref} className="flex h-[120px] items-center rounded-lg border border-dashed border-line px-4 text-[15px] text-stone">
        Log a UTR to start your chart.
      </div>
    );
  }

  const now = sorted[sorted.length - 1];
  const start = sorted[0];
  const checkpoint = nextCheckpoint && nextCheckpoint.date.getTime() > now.date.getTime() ? nextCheckpoint : null;
  const estimateEnd = estimate[estimate.length - 1];
  const endDate = checkpoint?.date ?? estimateEnd?.date ?? new Date(now.date.getTime() + 180 * 86_400_000);

  // The estimate between today and the right edge of this chart.
  const band = estimate.filter((p) => p.date.getTime() <= endDate.getTime());
  const edge = estimateOnDate(estimate, endDate);
  if (edge && band.length > 0 && band[band.length - 1].date.getTime() < endDate.getTime()) band.push(edge);
  const up = upside.filter((p) => p.date.getTime() <= endDate.getTime());
  const upEdge = estimateOnDate(upside, endDate);
  if (upEdge && up.length > 0 && up[up.length - 1].date.getTime() < endDate.getTime()) up.push(upEdge);
  // Labels only when the chart reaches the summer before senior year — a
  // value part-way along is not the number the report prints.
  const reachesTarget = !checkpoint && estimateEnd != null;
  const endLabels = reachesTarget ? chartEndLabels(estimate, upside) : { plan: null, upside: null };

  const utrValues = [
    ...sorted.map((p) => p.utr),
    ...(checkpoint ? [checkpoint.utr] : []),
    ...band.flatMap((p) => [p.low, p.high]),
    ...up.map((p) => p.value),
  ];
  // Snapped to half points so the gridlines land on round numbers.
  const utrMin = Math.floor((Math.min(...utrValues) - 0.3) * 2) / 2;
  const utrMax = Math.ceil((Math.max(...utrValues) + 0.3) * 2) / 2;
  const dateMin = start.date.getTime();
  const dateMax = Math.max(endDate.getTime(), dateMin + 1);

  const W = Math.max(240, width);
  const plotW = W - PAD_L - PAD_R;
  const x = (t: number) => PAD_L + ((t - dateMin) / (dateMax - dateMin)) * plotW;
  const y = (utr: number) => BASELINE - ((utr - utrMin) / (utrMax - utrMin)) * (BASELINE - PAD_TOP);

  const linePoints = sorted.map((p) => `${x(p.date.getTime())},${y(p.utr)}`).join(" ");
  const bandPath =
    band.length > 1
      ? `M${band.map((p) => `${x(p.date.getTime())},${y(p.high)}`).join(" L")} L${[...band]
          .reverse()
          .map((p) => `${x(p.date.getTime())},${y(p.low)}`)
          .join(" L")} Z`
      : null;

  const estimateLine = band.length > 1 ? band.map((p) => `${x(p.date.getTime())},${y(p.value)}`).join(" ") : null;
  const upLine = up.length > 1 ? up.map((p) => `${x(p.date.getTime())},${y(p.value)}`).join(" ") : null;
  const bandEnd = band[band.length - 1];
  const upEnd = up[up.length - 1];

  const yTicks = utrTicks(utrMin, utrMax);
  // Month ticks spaced for a 12px label; a phone gets fewer.
  const xTicks = monthTicks(dateMin, dateMax, plotW, 76);

  const endX = x(endDate.getTime());
  const checkpointUtrText = checkpoint ? formatCheckpointUtr(checkpoint.utr, goalValue) : "";
  const checkpointText = checkpoint ? `${monthYearLabel(checkpoint.date)} · ${checkpointUtrText}` : "";
  // Anchored to END at the marker, so it reads leftwards from the edge
  // instead of running off it.
  const checkpointLabelX = Math.max(PAD_L + approxTextWidth(checkpointText, AXIS_FONT_SIZE), endX - 4);

  return (
    <div ref={ref} className="w-full">
      <svg
        role="img"
        aria-label={`UTR ${formatPlayerUtr(now.utr)} as of ${monthYearLabel(now.date)}${
          checkpoint ? `, next checkpoint ${checkpointUtrText} by ${monthYearLabel(checkpoint.date)}` : ""
        }`}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-full"
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} y1={y(v)} x2={W - PAD_R} y2={y(v)} stroke="rgb(var(--c-line))" strokeWidth="1" />
            <text
              x={PAD_L - 6}
              y={y(v) + 4}
              textAnchor="end"
              fontSize={AXIS_FONT_SIZE}
              fontFamily={NUMBER_FONT}
              fill="rgb(var(--c-stone))"
            >
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        ))}
        {xTicks.map((d, i) => {
          const text = monthYearLabel(d);
          const tw = approxTextWidth(text, AXIS_FONT_SIZE);
          const cx = Math.min(Math.max(x(d.getTime()), PAD_L + tw / 2), W - PAD_R - tw / 2);
          return (
            <text key={i} x={cx} y={H - 8} textAnchor="middle" fontSize={AXIS_FONT_SIZE} fontFamily={FONT} fill="rgb(var(--c-stone))">
              {text}
            </text>
          );
        })}

        {bandPath && <path d={bandPath} fill="rgb(var(--c-primary-50))" />}
        {/* The estimate's own line, dashed. A logged-pace estimate has
            low === high, so the shaded band alone has no area and drew
            nothing at all — the old caption said "Shaded" over an empty
            stretch of chart. */}
        {estimateLine && (
          <polyline points={estimateLine} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="2" strokeDasharray="6 5" />
        )}
        {upLine && <polyline points={upLine} fill="none" stroke="rgb(var(--c-stone))" strokeWidth="1.5" strokeDasharray="3 4" />}
        {endLabels.plan && bandEnd && (
          <text
            x={W - PAD_R}
            // Above the dashed line's end (below it when the upside label
            // takes the space above), so the number never sits on the line.
            y={Math.max(14, Math.min(BASELINE - 4, y(bandEnd.value) + (endLabels.upside ? 20 : -9)))}
            textAnchor="end"
            fontSize="13"
            fontWeight="600"
            fill="rgb(var(--c-primary))"
            fontFamily={NUMBER_FONT}
          >
            {endLabels.plan}
          </text>
        )}
        {endLabels.upside && upEnd && (
          <text
            x={W - PAD_R}
            y={Math.max(PAD_TOP - 6, y(upEnd.value) - 8)}
            textAnchor="end"
            fontSize={AXIS_FONT_SIZE}
            fill="rgb(var(--c-stone))"
            fontFamily={FONT}
          >
            {endLabels.upside}
          </text>
        )}
        {sorted.length > 1 && <polyline points={linePoints} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="2.5" />}
        {checkpoint && (
          <>
            <line x1={endX} y1={PAD_TOP - 4} x2={endX} y2={BASELINE} stroke="rgb(var(--c-gold))" strokeDasharray="3 3" />
            <text
              x={checkpointLabelX}
              y={PAD_TOP - 10}
              textAnchor="end"
              fontSize={AXIS_FONT_SIZE}
              fill="rgb(var(--c-ink))"
              fontFamily={FONT}
            >
              {monthYearLabel(checkpoint.date)} · <tspan fontFamily={NUMBER_FONT}>{checkpointUtrText}</tspan>
            </text>
          </>
        )}
        <circle cx={x(now.date.getTime())} cy={y(now.utr)} r="6" fill="rgb(var(--c-lime))" stroke="rgb(var(--c-ink))" strokeWidth="2" />
      </svg>
    </div>
  );
}
