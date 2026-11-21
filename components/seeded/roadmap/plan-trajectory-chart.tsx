"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { UtrDataPoint } from "@/lib/utr-projection";
import { chartEndLabels, type PlanGoal, type UtrEstimatePoint } from "@/lib/fit";
import type { RoadmapYear } from "@/lib/types";
import { formatCheckpointUtr, formatPlayerUtr, formatUtrEstimate } from "@/lib/utils";
import { formatDate } from "@/lib/time";
import { useMeasuredWidth } from "@/components/seeded/ui/use-measured-width";
import { approxTextWidth, monthTicks, monthYearLabel, utrTicks } from "@/components/seeded/ui/chart-axis";
import { chartValuesAt, clientXToViewBoxX, stepMonths } from "./plan-trajectory-values";

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
  /** lib/fit.ts upsideProjectionPath — the player's own pace when it is
   *  faster than the planning cap. A dashed "Estimate" line; empty otherwise.
   *  Never what the bands or the goal read. */
  upside?: UtrEstimatePoint[];
  /** Opens the goal editor above the chart. */
  onChangeGoal?: () => void;
  /** Where "logged" ends for the readout. Defaults to the current date. */
  today?: Date;
}

const H = 240;
const PAD_L = 36;
const PAD_R = 16;
const PAD_TOP = 24;
const BASELINE = H - 30;

// "Your plan to senior summer". Solid line: the player's logged ratings.
// Dashed: the plan's checkpoints to the goal (buildRoadmap). Shaded: the
// planning estimate from lib/fit.ts — the same projection the
// ProjectionNote and the school pages print, labelled at its end. Grey
// dashed, labelled "Estimate": the upside at the player's own pace, drawn
// only when that pace is faster than the planning cap (PR D, D1). It used to shade a regression
// through the logged ratings instead, a second projection for the same
// date (C8).
//
// Drawn in a viewBox as wide as the column (useMeasuredWidth), so labels
// stay legible at 320px and never run off the edge (C21).
export function PlanTrajectoryChart({ actualPoints, roadmap, goal, estimate, upside = [], onChangeGoal, today }: PlanTrajectoryChartProps) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>(900);
  // The cursor is a DATE, so it survives a resize and the arrow keys can
  // step it by calendar month; its x is derived below.
  const [cursorT, setCursorT] = useState<number | null>(null);
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
  const upsideEnd = upside[upside.length - 1];
  const endLabels = chartEndLabels(estimate, upside);
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
    ...upside.map((p) => p.value),
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

  const estimateLine = estimate.length > 1 ? estimate.map((p) => `${x(p.date.getTime())},${y(p.value)}`).join(" ") : null;
  const upsideLine = upside.length > 1 ? upside.map((p) => `${x(p.date.getTime())},${y(p.value)}`).join(" ") : null;

  const yTicks = utrTicks(utrMin, utrMax);
  const xTicks = monthTicks(dateMin, dateMax, plotW);

  // The readout at the cursor's date — each value read off the line the
  // chart draws for it (plan-trajectory-values.ts): Logged only up to the
  // last log and never past today; Plan only along the dashed line, which
  // stops at the last checkpoint; Estimate only along projectionPath.
  const planLine = checkpoints.length > 0 ? [now, ...checkpoints] : [];
  const series = { logged: sortedActual, plan: planLine, estimate, today: today ?? new Date() };
  const clampT = (t: number) => Math.min(Math.max(t, dateMin), dateMax);
  const tAtX = (vx: number) => dateMin + ((vx - PAD_L) / plotW) * (dateMax - dateMin);
  const cursor = cursorT != null ? clampT(cursorT) : null;
  const hoverX = cursor != null ? x(cursor) : null;
  const at = cursor != null ? chartValuesAt(series, cursor) : null;
  const readout: { key: string; label: string; text: string; color: string; vy: number }[] = [];
  if (at?.logged != null) {
    readout.push({ key: "logged", label: "Logged", text: formatPlayerUtr(at.logged), color: "rgb(var(--c-ink))", vy: y(at.logged) });
  }
  if (at?.plan != null) {
    readout.push({ key: "plan", label: "Plan", text: formatCheckpointUtr(at.plan, goal?.value), color: "rgb(var(--c-gold))", vy: y(at.plan) });
  }
  if (at?.estimate) {
    const e = at.estimate;
    const band = e.high - e.low >= 0.05 ? ` (${formatUtrEstimate(e.low)}–${formatUtrEstimate(e.high)})` : "";
    readout.push({ key: "estimate", label: "Estimate", text: `${formatUtrEstimate(e.value)}${band}`, color: "rgb(var(--c-primary))", vy: y(e.value) });
  }
  const readoutDate = cursor != null ? monthYearLabel(new Date(cursor)) : "";
  const readoutSentence =
    cursor == null
      ? ""
      : `${readoutDate}: ${readout.length ? readout.map((r) => `${r.label} ${r.text}`).join(", ") : "Not tracked"}`;

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const vx = clientXToViewBoxX(e.clientX, e.currentTarget.getBoundingClientRect(), W);
    setCursorT(tAtX(Math.min(Math.max(vx, PAD_L), W - PAD_R)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const from = cursor ?? now.date.getTime();
    let next: number | null = null;
    if (e.key === "ArrowRight") next = cursor == null ? from : stepMonths(from, 1);
    else if (e.key === "ArrowLeft") next = cursor == null ? from : stepMonths(from, -1);
    else if (e.key === "Home") next = dateMin;
    else if (e.key === "End") next = dateMax;
    else if (e.key === "Escape") {
      setCursorT(null);
      return;
    }
    if (next == null) return;
    e.preventDefault();
    setCursorT(clampT(next));
  };

  const nowX = x(now.date.getTime());
  const nowY = y(now.utr);
  const nowText = `Now ${formatPlayerUtr(now.utr)}`;
  const sel = selected != null ? checkpoints[selected] : null;

  return (
    <div ref={ref} className="w-full">
      {/* Focusable: Left/Right step the cursor a month, Home/End jump to
          the ends, Escape clears it. touch-pan-y: a vertical finger drag
          still scrolls the page, a horizontal one scrubs the cursor. */}
      <svg
        role="img"
        tabIndex={0}
        aria-label={`UTR ${formatPlayerUtr(now.utr)} as of ${monthYearLabel(now.date)}${
          checkpoints.length
            ? `, plan checkpoints: ${checkpoints.map((c) => `${formatCheckpointUtr(c.utr, goal?.value)} by ${monthYearLabel(c.date)}`).join(", ")}`
            : ""
        }. Use the left and right arrow keys to read the chart month by month.`}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-full cursor-crosshair touch-pan-y rounded-md focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setCursorT(null);
        }}
        onPointerCancel={() => setCursorT(null)}
        onKeyDown={onKey}
        onBlur={() => setCursorT(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
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
            <text key={i} x={cx} y={H - 8} textAnchor="middle" fontSize="11" fontFamily={LABEL_FONT} fill="rgb(var(--c-stone))">
              {text}
            </text>
          );
        })}

        {bandPath && <path d={bandPath} fill="rgb(var(--c-primary-50))" />}
        {/* The estimate's own line, dotted (dashes are the checkpoints). A
            logged-pace estimate has low === high, so the band alone has no
            area and drew nothing under a caption saying "Shaded" (PR-POLISH). */}
        {estimateLine && (
          <polyline points={estimateLine} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="2.5" strokeDasharray="0.5 6" strokeLinecap="round" />
        )}
        {upsideLine && (
          <polyline points={upsideLine} fill="none" stroke="rgb(var(--c-stone))" strokeWidth="1.5" strokeDasharray="3 4" />
        )}
        {sortedActual.length > 1 && <polyline points={actualLine} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="3" />}
        {checkpoints.length > 0 && (
          <polyline points={dashedLine} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="2" strokeDasharray="6 5" />
        )}

        {checkpoints.map((c, i) => {
          const cx = x(c.date.getTime());
          const cy = y(c.utr);
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
                {monthYearLabel(c.date)} · <tspan fontFamily={NUMBER_FONT}>{formatCheckpointUtr(c.utr, goal?.value)}</tspan>
              </text>
            </g>
          );
        })}

        {/* End labels: the planning estimate at the end of the shaded band,
            and "Estimate 9.40" at the end of the upside line — both from
            lib/fit.ts chartEndLabels, the numbers the report prints. */}
        {estimateEnd && endLabels.plan && (
          <text
            x={W - PAD_R}
            y={Math.max(14, Math.min(BASELINE - 4, y(estimateEnd.value) + (upsideEnd || checkpointAtEnd ? 20 : -9)))}
            textAnchor="end"
            fontSize="12"
            fontWeight="600"
            fontFamily={NUMBER_FONT}
            fill="rgb(var(--c-primary))"
          >
            {endLabels.plan}
          </text>
        )}
        {upsideEnd && endLabels.upside && (
          <text
            x={W - PAD_R}
            y={Math.max(PAD_TOP - 6, y(upsideEnd.value) - 8)}
            textAnchor="end"
            fontSize="12"
            fontFamily={LABEL_FONT}
            fill="rgb(var(--c-stone))"
          >
            {endLabels.upside}
          </text>
        )}

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

        {hoverX != null && (
          <g pointerEvents="none">
            <line x1={hoverX} y1={PAD_TOP} x2={hoverX} y2={BASELINE} stroke="rgb(var(--c-ink))" strokeOpacity="0.25" strokeWidth="1" />
            {readout.map((r) => (
              <circle key={r.key} cx={hoverX} cy={r.vy} r="4.5" fill={r.color} stroke="rgb(var(--c-card))" strokeWidth="1.5" />
            ))}
            {(() => {
              const rowH = 16;
              const textW = Math.max(
                approxTextWidth(readoutDate, 11),
                ...readout.map((r) => approxTextWidth(`${r.label} ${r.text}`, 12) + 14),
                readout.length ? 0 : approxTextWidth("Not tracked", 12)
              );
              const boxW = Math.min(textW + 16, W - PAD_L - PAD_R);
              const boxH = 22 + Math.max(1, readout.length) * rowH;
              // Right of the crosshair, or left of it when that would run
              // off the edge — never over the dots on the crosshair.
              const bx = hoverX + 8 + boxW <= W - PAD_R ? hoverX + 8 : Math.max(PAD_L, hoverX - 8 - boxW);
              return (
                <g transform={`translate(${bx}, ${PAD_TOP - 18})`}>
                  <rect width={boxW} height={boxH} rx="6" fill="rgb(var(--c-card))" stroke="rgb(var(--c-line))" />
                  <text x="8" y="15" fontSize="11" fontFamily={LABEL_FONT} fill="rgb(var(--c-stone))">
                    {readoutDate}
                  </text>
                  {readout.length ? (
                    readout.map((r, i) => (
                      <g key={r.key} transform={`translate(8, ${22 + i * rowH})`}>
                        <circle cx="4" cy="8" r="4" fill={r.color} />
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
        {readoutSentence}
      </p>

      <p className="mt-2 text-sm text-stone">
        Solid: the UTRs you&apos;ve logged.
        {checkpoints.length > 0 && " Dashed: your plan's checkpoints."}
        {bandPath && ` Dotted: your estimate for the summer before senior year${endLabels.plan ? `, ${endLabels.plan}` : ""}.`}
        {upsideLine && " Grey dashes: Estimate at your own pace, not used for your bands."}
      </p>

      {sel && goal && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-grass-50 p-4 text-sm">
          <p className="min-w-0 flex-1 text-ink">
            <strong>{sel.label}:</strong> <span className="font-mono">{formatCheckpointUtr(sel.utr, goal?.value)}</span>. It sits on a
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
