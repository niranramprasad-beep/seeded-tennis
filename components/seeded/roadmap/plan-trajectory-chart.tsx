"use client";

import { useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import type { UtrDataPoint } from "@/lib/utr-projection";
import { chartEndLabels, type PlanCheckpoint, type UtrEstimatePoint } from "@/lib/fit";
import { formatCheckpointUtr, formatPlayerUtr } from "@/lib/utils";
import { useMeasuredWidth } from "@/components/seeded/ui/use-measured-width";
import { approxTextWidth, monthTicks, monthYearLabel, utrTicks } from "@/components/seeded/ui/chart-axis";
import { chartLegendItems } from "@/lib/chart-legend";
import { ChartLegend } from "@/components/seeded/ui/chart-legend";
import {
  buildChartSeries,
  clientXToViewBoxX,
  cursorAfterKey,
  cursorTime,
  readoutAt,
  seriesPaths,
  type ChartCursor,
  type ReadoutRow,
} from "./plan-trajectory-values";

// Every text element sets its font-family explicitly — SVG text does not
// reliably inherit the page's font cascade.
const LABEL_FONT = "var(--font-inter)";
const NUMBER_FONT = "var(--font-mono-active)";

interface PlanTrajectoryChartProps {
  actualPoints: UtrDataPoint[];
  /** lib/fit planCheckpoints — the quarterly checkpoint line to the Plan
   *  UTR. Empty without a plan. */
  checkpoints: PlanCheckpoint[];
  /** The Plan UTR the line ends at, or null. */
  planUtr: number | null;
  /** lib/fit.ts projectionPath — THE estimate. Pass it only while no Plan
   *  UTR is set (the chart then shows where Seeded expects the player to
   *  be); empty otherwise. */
  estimate: UtrEstimatePoint[];
  /** Where "logged" ends for the readout. Defaults to the current date. */
  today?: Date;
}

const H = 240;
const PAD_L = 36;
const PAD_R = 16;
const PAD_TOP = 24;
const BASELINE = H - 30;

// "Your plan to senior summer". Solid line with a dot per entry: the
// player's logged ratings. Dashed with gold diamonds: the quarterly
// checkpoints to the Plan UTR (lib/fit planCheckpoints, 2026-11-27).
// Dotted: the estimate from lib/fit.ts, drawn only while no Plan UTR is set.
// Hovering, tapping or arrow-keying the chart reads every line at that date:
// a logged rating's exact UTR and date, and the plan's value there.
//
// Drawn in a viewBox as wide as the column (useMeasuredWidth), so labels
// stay legible at 320px and never run off the edge (C21).
export function PlanTrajectoryChart({ actualPoints, checkpoints: planLine, planUtr, estimate, today }: PlanTrajectoryChartProps) {
  const goal = planUtr != null ? { value: planUtr } : null;
  const { ref, width } = useMeasuredWidth<HTMLDivElement>(900);
  // The cursor is a DATE (an anchor plus keyboard month steps), so it
  // survives a resize and the arrow keys never drift the day; its x is
  // derived below.
  const [cursorState, setCursorState] = useState<ChartCursor>(null);
  // What the aria-live region says — set on KEYBOARD steps only, so a
  // screen reader is not flooded on every pointer move.
  const [announcement, setAnnouncement] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  // Every line, diamond and readout dot comes from this one series
  // (plan-trajectory-values.ts) — the chart builds no series of its own.
  const series = buildChartSeries({ actualPoints, checkpoints: planLine, estimate, today });
  if (!series) {
    return (
      <div ref={ref} className="flex h-[120px] items-center rounded-lg border border-dashed border-line px-4 text-sm text-stone">
        Log a UTR to start your plan chart.
      </div>
    );
  }
  const { logged: sortedActual, now, checkpoints } = series;

  const estimateEnd = estimate[estimate.length - 1];
  const endLabels = chartEndLabels(estimate, []);
  // The last checkpoint sits on the same date as the estimate's end, with
  // its label above-left of its diamond: the estimate's label then goes
  // below the band end so the two never print on top of each other.
  const checkpointAtEnd =
    estimateEnd != null && checkpoints.some((c) => Math.abs(c.date.getTime() - estimateEnd.date.getTime()) < 2 * 86_400_000);
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
  const geometry = { x, y };
  const clampX = (cx: number, textW: number, anchor: "start" | "end") =>
    anchor === "start" ? Math.min(cx, W - PAD_R - textW) : Math.max(cx, PAD_L + textW);

  const paths = seriesPaths(series, geometry);

  const yTicks = utrTicks(utrMin, utrMax);
  const xTicks = monthTicks(dateMin, dateMax, plotW);

  // The readout at the cursor's date (readoutAt): Logged is the real entry
  // in force, its dot on that entry; Plan and Planning estimate are read off
  // their own lines, their dots under the crosshair.
  const bounds = { min: dateMin, max: dateMax };
  const cursor = cursorTime(cursorState, bounds);
  const hoverX = cursor != null ? x(cursor) : null;
  const readout = cursor != null ? readoutAt(series, cursor, geometry, goal?.value) : null;
  const rows = readout?.rows ?? [];

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const vx = clientXToViewBoxX(e.clientX, e.currentTarget.getBoundingClientRect(), W);
    const t = dateMin + ((Math.min(Math.max(vx, PAD_L), W - PAD_R) - PAD_L) / plotW) * (dateMax - dateMin);
    setCursorState({ anchor: t, months: 0 });
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    // Keys pressed on a checkpoint button are that button's, not the cursor's.
    if (e.target !== e.currentTarget) return;
    const next = cursorAfterKey(cursorState, e.key, bounds, now.date.getTime());
    if (next === undefined) return;
    e.preventDefault();
    setCursorState(next);
    const t = cursorTime(next, bounds);
    setAnnouncement(t == null ? "" : readoutAt(series, t, geometry, goal?.value).sentence);
  };
  const onBlur = (e: FocusEvent<SVGSVGElement>) => {
    // Focus moving onto a checkpoint button inside the chart keeps the cursor.
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    setCursorState(null);
  };

  const nowX = x(now.date.getTime());
  const nowY = y(now.utr);
  const nowText = `Now ${formatPlayerUtr(now.utr)}`;
  const sel = selected != null ? checkpoints[selected] : null;

  return (
    <div ref={ref} className="w-full">
      {/* Focusable: Left/Right step the cursor a month, Home/End jump to
          the ends, Escape clears it. role="group" (not "img", whose
          children are presentational) so the checkpoint buttons stay
          reachable. touch-action pan-y pinch-zoom: a vertical finger drag
          still scrolls and pinch still zooms; a horizontal drag scrubs. */}
      <svg
        role="group"
        aria-roledescription="chart"
        tabIndex={0}
        aria-label={`UTR ${formatPlayerUtr(now.utr)} as of ${monthYearLabel(now.date)}${
          checkpoints.length
            ? `, plan checkpoints: ${checkpoints.map((c) => `${formatCheckpointUtr(c.utr, goal?.value)} by ${monthYearLabel(c.date)}`).join(", ")}`
            : ""
        }. Use the left and right arrow keys to read the chart month by month.`}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        style={{ touchAction: "pan-y pinch-zoom" }}
        className="block max-w-full cursor-crosshair rounded-md focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setCursorState(null);
        }}
        onPointerCancel={() => setCursorState(null)}
        onKeyDown={onKey}
        onBlur={onBlur}
      >
        {yTicks.map((v) => (
          <g key={v} aria-hidden="true">
            <line x1={PAD_L} y1={y(v)} x2={W - PAD_R} y2={y(v)} stroke="rgb(var(--c-line))" strokeWidth="1" />
            <text x={PAD_L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fontFamily={NUMBER_FONT} fill="rgb(var(--c-stone))">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        ))}

        {xTicks.map((d, i) => {
          const text = monthYearLabel(d);
          const tw = approxTextWidth(text, 11);
          const cx = Math.min(Math.max(x(d.getTime()), PAD_L + tw / 2), W - PAD_R - tw / 2);
          return (
            <text key={i} aria-hidden="true" x={cx} y={H - 8} textAnchor="middle" fontSize="11" fontFamily={LABEL_FONT} fill="rgb(var(--c-stone))">
              {text}
            </text>
          );
        })}

        {paths.band && <path d={paths.band} fill="rgb(var(--c-primary-50))" />}
        {/* The estimate's own line, dotted (dashes are the checkpoints). A
            logged-pace estimate has low === high, so the band alone has no
            area and drew nothing under a caption saying "Shaded" (PR-POLISH). */}
        {paths.estimate && (
          <polyline points={paths.estimate} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="2.5" strokeDasharray="0.5 6" strokeLinecap="round" />
        )}
        {paths.logged && <polyline points={paths.logged} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="3" />}
        {paths.plan && <polyline points={paths.plan} fill="none" stroke={PLAN_STROKE} strokeWidth="2" strokeDasharray="6 5" />}

        {/* Every logged rating gets a dot, so each point the hover readout
            names (its exact UTR and date) is visible on the line. */}
        {sortedActual.length > 1 &&
          sortedActual.map((p) => (
            <circle
              key={`logged-${p.date.getTime()}`}
              aria-hidden="true"
              cx={x(p.date.getTime())}
              cy={y(p.utr)}
              r="3.5"
              fill="rgb(var(--c-primary))"
              stroke="rgb(var(--c-card))"
              strokeWidth="1.5"
            />
          ))}

        {checkpoints.map((c, i) => {
          const cx = x(c.date.getTime());
          const cy = y(c.utr);
          // Quarterly checkpoints (2026-11-27) are too many to label: only
          // the last one (the Plan UTR) and a selected one print a label;
          // the rest are small diamonds the readout and the checkpoint strip
          // under the chart name.
          const isLast = i === checkpoints.length - 1;
          const showLabel = isLast || selected === i;
          const size = isLast ? 14 : 9;
          const text = `${monthYearLabel(c.date)} · ${formatCheckpointUtr(c.utr, goal?.value)}`;
          const tw = approxTextWidth(text, 12);
          // The dashed line rises to the right of each diamond, so its label
          // sits ABOVE-LEFT of it — off the line (C21: labels sat on it). A
          // diamond too close to the left edge takes its label below-right.
          const fitsLeft = cx - 10 - tw >= PAD_L;
          const lx = fitsLeft ? cx - 10 : clampX(cx + 10, tw, "start");
          const ly = fitsLeft ? Math.max(PAD_TOP - 6, cy - 10) : Math.min(BASELINE - 4, cy + 22);
          return (
            <g key={c.date.getTime()}>
              {/* The diamond is 14px; the group around it carries a 56-unit
                  transparent hit area — the chart scales down on a phone, and
                  56 units is still 44px at 320 (C29). */}
              <g
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`${c.label}: ${formatCheckpointUtr(c.utr, goal?.value)} by ${monthYearLabel(c.date)}`}
                onClick={() => setSelected(selected === i ? null : i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(selected === i ? null : i);
                  }
                }}
              >
                <rect x={cx - 28} y={cy - 28} width="56" height="56" fill="transparent" />
                <rect
                  x={cx - size / 2}
                  y={cy - size / 2}
                  width={size}
                  height={size}
                  fill="rgb(var(--c-gold))"
                  stroke={selected === i ? "rgb(var(--c-ink))" : "transparent"}
                  strokeWidth="2"
                  transform={`rotate(45 ${cx} ${cy})`}
                />
              </g>
              {/* Hidden while the readout is open: at 375 its box sat over
                  "Jun '27 · 9.30" (final-check A12). The readout's Plan row
                  carries the same value at the crosshair. */}
              <text
                aria-hidden="true"
                x={lx}
                y={ly}
                textAnchor={fitsLeft ? "end" : "start"}
                fontSize="12"
                fill="rgb(var(--c-ink))"
                fontFamily={LABEL_FONT}
                opacity={!showLabel || (hoverX != null && readout) ? 0 : 1}
              >
                {monthYearLabel(c.date)} · <tspan fontFamily={NUMBER_FONT}>{formatCheckpointUtr(c.utr, goal?.value)}</tspan>
              </text>
            </g>
          );
        })}

        {/* End label: the estimate at the end of its line (drawn only while
            no Plan UTR is set) — lib/fit.ts chartEndLabels, the number the
            report prints. */}
        {estimateEnd && endLabels.plan && (
          <text
            aria-hidden="true"
            x={W - PAD_R}
            y={Math.max(14, Math.min(BASELINE - 4, y(estimateEnd.value) + (checkpointAtEnd ? 20 : -9)))}
            textAnchor="end"
            fontSize="12"
            fontWeight="600"
            fontFamily={NUMBER_FONT}
            fill="rgb(var(--c-primary))"
          >
            {endLabels.plan}
          </text>
        )}

        <circle aria-hidden="true" cx={nowX} cy={nowY} r="7" fill="rgb(var(--c-lime))" stroke="rgb(var(--c-ink))" strokeWidth="2" />
        {/* Below-right of the dot: the logged line arrives from the left and
            the plan leaves up-right, so this corner is clear of both. */}
        <text
          aria-hidden="true"
          x={clampX(nowX + 10, approxTextWidth(nowText, 12), "start")}
          y={Math.min(BASELINE - 4, nowY + 22)}
          fontSize="12"
          fontWeight="600"
          fill="rgb(var(--c-ink))"
          fontFamily={LABEL_FONT}
        >
          Now <tspan fontFamily={NUMBER_FONT}>{formatPlayerUtr(now.utr)}</tspan>
        </text>

        {hoverX != null && readout && (
          <g pointerEvents="none" aria-hidden="true">
            <line x1={hoverX} y1={PAD_TOP} x2={hoverX} y2={BASELINE} stroke="rgb(var(--c-ink))" strokeOpacity="0.25" strokeWidth="1" />
            {rows.map((r) => (
              <ReadoutDot key={r.key} row={r} cx={r.dot.cx} cy={r.dot.cy} r={4.5} />
            ))}
            {(() => {
              const rowH = 16;
              const textW = Math.max(
                approxTextWidth(readout.date, 11),
                ...rows.map((r) => approxTextWidth(`${r.label} ${r.text}`, 12) + 14),
                rows.length ? 0 : approxTextWidth("Not tracked", 12)
              );
              const boxW = Math.min(textW + 16, W - PAD_L - PAD_R);
              const boxH = 22 + Math.max(1, rows.length) * rowH;
              // Right of the crosshair, or left of it when that would run
              // off the edge — never over the dots on the crosshair.
              const bx = hoverX + 8 + boxW <= W - PAD_R ? hoverX + 8 : Math.max(PAD_L, hoverX - 8 - boxW);
              return (
                <g transform={`translate(${bx}, ${PAD_TOP - 18})`}>
                  <rect width={boxW} height={boxH} rx="6" fill="rgb(var(--c-card))" stroke="rgb(var(--c-line))" />
                  <text x="8" y="15" fontSize="11" fontFamily={LABEL_FONT} fill="rgb(var(--c-stone))">
                    {readout.date}
                  </text>
                  {rows.length ? (
                    rows.map((r, i) => (
                      <g key={r.key} transform={`translate(8, ${22 + i * rowH})`}>
                        <ReadoutDot row={r} cx={4} cy={8} r={4} />
                        <text x="14" y="12" fontSize="12" fontFamily={LABEL_FONT} fill="rgb(var(--c-stone))">
                          {r.label}{" "}
                          <tspan fontWeight="600" fontFamily={NUMBER_FONT} fill="rgb(var(--c-ink))">
                            {r.text}
                          </tspan>
                        </text>
                      </g>
                    ))
                  ) : (
                    <text x="8" y="34" fontSize="12" fontFamily={LABEL_FONT} fill="rgb(var(--c-stone))">
                      Not tracked
                    </text>
                  )}
                </g>
              );
            })()}
          </g>
        )}
      </svg>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {/* The same swatches as /today's chart (lib/chart-legend.ts,
          final-check A3): each line style means one thing on both charts. */}
      <ChartLegend
        items={chartLegendItems({
          estimate: Boolean(paths.estimate),
          planUtr: checkpoints.length > 0 && goal ? formatPlayerUtr(goal.value) : null,
        })}
      />

      {sel && goal && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-grass-50 p-4 text-sm">
          <p className="min-w-0 flex-1 text-ink">
            <strong>By {sel.label}:</strong> <span className="font-mono">{formatCheckpointUtr(sel.utr, goal?.value)}</span>. It sits on
            a straight line from today&apos;s <span className="font-mono">{formatPlayerUtr(now.utr)}</span> to your plan UTR of{" "}
            <span className="font-mono">{formatPlayerUtr(goal.value)}</span> by {checkpoints[checkpoints.length - 1]?.label}.
          </p>
          <div className="flex shrink-0 gap-3">
            <button type="button" onClick={() => setSelected(null)} className="min-h-6 text-xs font-semibold text-stone hover:text-ink">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The dashed plan line's colour — its readout dot matches it. */
const PLAN_STROKE = "rgb(var(--c-primary))";

/** A readout dot, styled like its line: Logged a solid ink dot on the
 *  entry, Plan a filled dot in the dashed line's colour, Planning estimate
 *  a hollow ring like the dotted line. */
function ReadoutDot({ row, cx, cy, r }: { row: ReadoutRow; cx: number; cy: number; r: number }) {
  if (row.key === "estimate") {
    return <circle cx={cx} cy={cy} r={r} fill="rgb(var(--c-card))" stroke="rgb(var(--c-primary))" strokeWidth="2" />;
  }
  const fill = row.key === "plan" ? PLAN_STROKE : "rgb(var(--c-ink))";
  return <circle cx={cx} cy={cy} r={r} fill={fill} stroke="rgb(var(--c-card))" strokeWidth="1.5" />;
}
