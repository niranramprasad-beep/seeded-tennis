"use client";

import { useState } from "react";
import type { UtrDataPoint } from "@/lib/utr-projection";
import type { PlanGoal, UtrEstimatePoint } from "@/lib/fit";
import type { RoadmapYear } from "@/lib/types";
import { formatPlayerUtr } from "@/lib/utils";
import { formatDate } from "@/lib/time";
import { useMeasuredWidth } from "@/components/seeded/ui/use-measured-width";
import { approxTextWidth, monthTicks, monthYearLabel, utrTicks } from "@/components/seeded/ui/chart-axis";

// Every text element sets its font-family explicitly — SVG text does not
// reliably inherit the page's font cascade.
const LABEL_FONT = "var(--font-inter)";
const NUMBER_FONT = "var(--font-mono-active)";

interface Checkpoint {
  date: Date;
  utr: number;
  label: string;
}

interface PlanTrajectoryChartProps {
  actualPoints: UtrDataPoint[];
  /** lib/hooks/use-plan-goal.ts — checkpoints on the line to the goal. */
  roadmap: RoadmapYear[];
  goal: PlanGoal | null;
  /** lib/fit.ts projectionPath — THE estimate, the same one every screen
   *  prints. Empty once the summer before senior year has begun. */
  estimate: UtrEstimatePoint[];
  /** Opens the goal editor above the chart. */
  onChangeGoal?: () => void;
}

const H = 240;
const PAD_L = 36;
const PAD_R = 16;
const PAD_TOP = 24;
const BASELINE = H - 30;

// "Your plan to senior summer". Solid line: the player's logged ratings.
// Dashed: the plan's checkpoints to the goal (buildRoadmap). Shaded: the
// typical-growth estimate from lib/fit.ts — the same projection the
// ProjectionNote and the school pages print. It used to shade a regression
// through the logged ratings instead, a second projection for the same
// date (C8).
//
// Drawn in a viewBox as wide as the column (useMeasuredWidth), so labels
// stay legible at 320px and never run off the edge (C21).
export function PlanTrajectoryChart({ actualPoints, roadmap, goal, estimate, onChangeGoal }: PlanTrajectoryChartProps) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>(900);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const sortedActual = [...actualPoints].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sortedActual.length === 0) {
    return (
      <div ref={ref} className="flex h-[120px] items-center rounded-lg border border-dashed border-line px-4 text-sm text-stone">
        Log a UTR to start your plan chart.
      </div>
    );
  }
  const now = sortedActual[sortedActual.length - 1];

  const checkpoints: Checkpoint[] = roadmap
    .map((y) => ({ date: new Date(y.calendarYear, 5, 1), utr: y.utrTarget, label: y.gradeLabel }))
    .filter((c) => c.date.getTime() > now.date.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const estimateEnd = estimate[estimate.length - 1];
  const horizonTime = Math.max(
    checkpoints[checkpoints.length - 1]?.date.getTime() ?? 0,
    estimateEnd?.date.getTime() ?? 0,
    now.date.getTime() + 180 * 86_400_000
  );

  // The y-axis covers EVERY logged rating (C21: the lowest one fell off),
  // every checkpoint and the whole estimate band.
  const utrValues = [
    ...sortedActual.map((p) => p.utr),
    ...checkpoints.map((c) => c.utr),
    ...estimate.flatMap((p) => [p.low, p.high]),
  ];
  const utrMin = Math.floor((Math.min(...utrValues) - 0.3) * 2) / 2;
  const utrMax = Math.ceil((Math.max(...utrValues) + 0.3) * 2) / 2;
  const dateMin = sortedActual[0].date.getTime();
  const dateMax = Math.max(horizonTime, dateMin + 1);

  const W = Math.max(280, width);
  const plotW = W - PAD_L - PAD_R;
  const x = (t: number) => PAD_L + ((t - dateMin) / (dateMax - dateMin)) * plotW;
  const y = (utr: number) => BASELINE - ((utr - utrMin) / (utrMax - utrMin)) * (BASELINE - PAD_TOP);
  const clampX = (cx: number, textW: number, anchor: "start" | "end") =>
    anchor === "start" ? Math.min(cx, W - PAD_R - textW) : Math.max(cx, PAD_L + textW);

  const actualLine = sortedActual.map((p) => `${x(p.date.getTime())},${y(p.utr)}`).join(" ");
  const dashedLine = [now, ...checkpoints].map((c) => `${x(c.date.getTime())},${y(c.utr)}`).join(" ");

  const bandPath =
    estimate.length > 1
      ? `M${estimate.map((p) => `${x(p.date.getTime())},${y(p.high)}`).join(" L")} L${[...estimate]
          .reverse()
          .map((p) => `${x(p.date.getTime())},${y(p.low)}`)
          .join(" L")} Z`
      : null;

  const yTicks = utrTicks(utrMin, utrMax);
  const xTicks = monthTicks(dateMin, dateMax, plotW);

  // Hover reads only the solid line — real logged values, interpolated
  // along the segment the chart already draws between them.
  const actualValueAt = (t: number) => {
    if (sortedActual.length === 1) return sortedActual[0];
    const clamped = Math.min(Math.max(t, dateMin), now.date.getTime());
    let i = 0;
    while (i < sortedActual.length - 2 && sortedActual[i + 1].date.getTime() < clamped) i++;
    const a = sortedActual[i];
    const b = sortedActual[i + 1];
    const span = b.date.getTime() - a.date.getTime();
    const f = span === 0 ? 0 : (clamped - a.date.getTime()) / span;
    return { date: new Date(clamped), utr: a.utr + (b.utr - a.utr) * f };
  };
  const hoverT = hoverX != null ? dateMin + ((hoverX - PAD_L) / plotW) * (dateMax - dateMin) : null;
  const hoverPoint = hoverT != null ? actualValueAt(hoverT) : null;
  const onMove = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    setHoverX(Math.min(Math.max(clientX - rect.left, PAD_L), W - PAD_R));
  };

  const nowX = x(now.date.getTime());
  const nowY = y(now.utr);
  const nowText = `Now ${formatPlayerUtr(now.utr)}`;
  const sel = selected != null ? checkpoints[selected] : null;

  return (
    <div ref={ref} className="w-full">
      <svg
        role="img"
        aria-label={`UTR ${formatPlayerUtr(now.utr)} as of ${monthYearLabel(now.date)}${
          checkpoints.length
            ? `, plan checkpoints: ${checkpoints.map((c) => `${formatPlayerUtr(c.utr)} by ${monthYearLabel(c.date)}`).join(", ")}`
            : ""
        }`}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-full cursor-crosshair"
        onMouseMove={(e) => onMove(e.clientX, e.currentTarget)}
        onMouseLeave={() => setHoverX(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} y1={y(v)} x2={W - PAD_R} y2={y(v)} stroke="rgb(var(--c-line))" strokeWidth="1" />
            <text x={PAD_L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fontFamily={NUMBER_FONT} fill="rgb(var(--c-stone-light))">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        ))}

        {xTicks.map((d, i) => {
          const text = monthYearLabel(d);
          const tw = approxTextWidth(text, 11);
          const cx = Math.min(Math.max(x(d.getTime()), PAD_L + tw / 2), W - PAD_R - tw / 2);
          return (
            <text key={i} x={cx} y={H - 8} textAnchor="middle" fontSize="11" fontFamily={LABEL_FONT} fill="rgb(var(--c-stone))">
              {text}
            </text>
          );
        })}

        {bandPath && <path d={bandPath} fill="rgb(var(--c-primary-50))" />}
        {sortedActual.length > 1 && <polyline points={actualLine} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="3" />}
        {checkpoints.length > 0 && (
          <polyline points={dashedLine} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="2" strokeDasharray="6 5" />
        )}

        {checkpoints.map((c, i) => {
          const cx = x(c.date.getTime());
          const cy = y(c.utr);
          const text = `${monthYearLabel(c.date)} · ${formatPlayerUtr(c.utr)}`;
          const tw = approxTextWidth(text, 12);
          // The dashed line rises to the right of each diamond, so its label
          // sits ABOVE-LEFT of it — off the line (C21: labels sat on it). A
          // diamond too close to the left edge takes its label below-right.
          const fitsLeft = cx - 10 - tw >= PAD_L;
          const lx = fitsLeft ? cx - 10 : clampX(cx + 10, tw, "start");
          const ly = fitsLeft ? Math.max(PAD_TOP - 6, cy - 10) : Math.min(BASELINE - 4, cy + 22);
          return (
            <g key={c.date.getTime()}>
              {/* The diamond is 14px; the group around it carries a 44px
                  transparent hit area, so a phone tap lands (C29). */}
              <g
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`${c.label}: ${formatPlayerUtr(c.utr)} by ${monthYearLabel(c.date)}`}
                onClick={() => setSelected(selected === i ? null : i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(selected === i ? null : i);
                  }
                }}
              >
                <rect x={cx - 22} y={cy - 22} width="44" height="44" fill="transparent" />
                <rect
                  x={cx - 7}
                  y={cy - 7}
                  width="14"
                  height="14"
                  fill="rgb(var(--c-gold))"
                  stroke={selected === i ? "rgb(var(--c-ink))" : "transparent"}
                  strokeWidth="2"
                  transform={`rotate(45 ${cx} ${cy})`}
                />
              </g>
              <text x={lx} y={ly} textAnchor={fitsLeft ? "end" : "start"} fontSize="12" fill="rgb(var(--c-ink))" fontFamily={LABEL_FONT}>
                {monthYearLabel(c.date)} · <tspan fontFamily={NUMBER_FONT}>{formatPlayerUtr(c.utr)}</tspan>
              </text>
            </g>
          );
        })}

        <circle cx={nowX} cy={nowY} r="7" fill="rgb(var(--c-lime))" stroke="rgb(var(--c-ink))" strokeWidth="2" />
        {/* Below-right of the dot: the logged line arrives from the left and
            the plan leaves up-right, so this corner is clear of both. */}
        <text
          x={clampX(nowX + 10, approxTextWidth(nowText, 12), "start")}
          y={Math.min(BASELINE - 4, nowY + 22)}
          fontSize="12"
          fontWeight="600"
          fill="rgb(var(--c-ink))"
          fontFamily={LABEL_FONT}
        >
          Now <tspan fontFamily={NUMBER_FONT}>{formatPlayerUtr(now.utr)}</tspan>
        </text>

        {hoverX != null && hoverPoint && (
          <g pointerEvents="none">
            <line x1={hoverX} y1={PAD_TOP} x2={hoverX} y2={BASELINE} stroke="rgb(var(--c-ink))" strokeOpacity="0.25" strokeWidth="1" />
            <circle cx={hoverX} cy={y(hoverPoint.utr)} r="4" fill="rgb(var(--c-ink))" />
            <g transform={`translate(${hoverX > W - 140 ? hoverX - 130 : hoverX + 8}, ${PAD_TOP})`}>
              <rect width="122" height="38" rx="6" fill="rgb(var(--c-card))" stroke="rgb(var(--c-line))" />
              <text x="8" y="15" fontSize="11" fontFamily={LABEL_FONT} fill="rgb(var(--c-stone))">
                {monthYearLabel(hoverPoint.date)}
              </text>
              <text x="8" y="30" fontSize="13" fontWeight="600" fontFamily={NUMBER_FONT} fill="rgb(var(--c-ink))">
                {formatPlayerUtr(hoverPoint.utr)} UTR
              </text>
            </g>
          </g>
        )}
      </svg>

      <p className="mt-2 text-[13px] text-stone">
        Solid: the UTRs you&apos;ve logged.
        {checkpoints.length > 0 && " Dashed: your plan's checkpoints."}
        {bandPath && " Shaded: your estimate for the summer before senior year."}
      </p>

      {sel && goal && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-grass-50 p-4 text-sm">
          <p className="min-w-0 flex-1 text-ink">
            <strong>{sel.label}:</strong> <span className="font-mono">{formatPlayerUtr(sel.utr)}</span>. It sits on a
            straight line from today&apos;s <span className="font-mono">{formatPlayerUtr(now.utr)}</span> to your goal of{" "}
            <span className="font-mono">{formatPlayerUtr(goal.value)}</span>
            {roadmap.length > 0 && ` by ${formatDate(new Date(roadmap[roadmap.length - 1].calendarYear, 5, 1))}`}.
          </p>
          <div className="flex shrink-0 gap-3">
            {onChangeGoal && (
              <button type="button" onClick={onChangeGoal} className="min-h-6 text-xs font-semibold text-grass">
                Change goal
              </button>
            )}
            <button type="button" onClick={() => setSelected(null)} className="min-h-6 text-xs font-semibold text-stone hover:text-ink">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
