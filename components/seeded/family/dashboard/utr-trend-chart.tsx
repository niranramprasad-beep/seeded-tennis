"use client";

import { useEffect, useRef, useState } from "react";
import type { UtrChartModel } from "@/lib/parent-dashboard";
import { formatPlayerUtr, formatUtrEstimate } from "@/lib/utils";
import { CHART_LINE_NAMES } from "@/lib/chart-legend";

// Board 22's hero chart. Draws a model lib/parent-dashboard.ts built — it
// computes nothing. Logged ratings are solid (line + dots); the estimate is
// dashed (line + band) and labelled "≈ X estimate"; today is the lime dot
// ("you" — here, the child) on a dotted "Today" line; the clay dashed line is
// where the child's target schools start.
//
// Fixed 240px tall at every width: the box the skeleton reserves is the box
// this fills, so nothing below moves when it draws (rule 6). The width is
// measured rather than scaled from a viewBox, so the labels stay 11–12px on
// a 320px phone instead of shrinking to 5px.

const CHART_HEIGHT = 240;
const LABEL_FONT = "var(--font-inter)";
const NUMBER_FONT = "var(--font-mono-active)";
const SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function UtrTrendChart({ model, ariaLabel }: { model: UtrChartModel; ariaLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = CHART_HEIGHT;
  const narrow = width < 480;
  const padL = 40;
  const padR = narrow ? 12 : 20;
  const padTop = 22;
  const padBottom = 26;
  const { start, end, min, max } = model.domain;
  const t0 = start.getTime();
  const t1 = Math.max(end.getTime(), t0 + 1);
  const x = (d: Date) => padL + ((d.getTime() - t0) / (t1 - t0)) * (width - padL - padR);
  const y = (v: number) => H - padBottom - ((v - min) / (max - min || 1)) * (H - padTop - padBottom);

  const step = max - min > 4 ? 1 : 0.5;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);

  const loggedPts = [...model.logged.map((p) => ({ date: p.date, utr: p.utr }))];
  const solid = [...loggedPts, model.today];
  const solidLine = solid.map((p) => `${x(p.date)},${y(p.utr)}`).join(" ");

  const proj = model.projection;
  const band = proj
    ? `M${proj.path.map((p) => `${x(p.date)},${y(p.fast)}`).join(" L")} L${[...proj.path]
        .reverse()
        .map((p) => `${x(p.date)},${y(p.slow)}`)
        .join(" L")} Z`
    : null;
  const projLine = proj ? proj.path.map((p) => `${x(p.date)},${y(p.normal)}`).join(" ") : null;

  const todayX = x(model.today.date);
  const todayY = y(model.today.utr);
  const endX = proj ? x(proj.end) : null;
  const endY = proj ? y(proj.value) : null;
  const floorY = model.targetFloor != null ? y(model.targetFloor) : null;
  const monthLabel = (d: Date) => `${SHORT_MONTH[d.getMonth()]} ${narrow ? `’${String(d.getFullYear()).slice(2)}` : d.getFullYear()}`;
  // Keep the floor label clear of the top edge, and today's value label
  // clear of the floor label (they meet on a phone).
  const floorLabelAbove = floorY != null && floorY > padTop + 16;
  const floorLabelY = floorY == null ? null : floorLabelAbove ? floorY - 6 : floorY + 14;
  const todayLabelY = floorLabelY != null && Math.abs(todayY - 10 - floorLabelY) < 14 ? todayY + 20 : todayY - 10;

  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      <svg role="img" aria-label={ariaLabel} width={width} height={H} className="block max-w-full overflow-visible">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} stroke="rgb(var(--c-line))" strokeWidth={1} />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fontFamily={NUMBER_FONT} fill="rgb(var(--c-stone))">
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        <text x={padL} y={H - 6} fontSize={12} fontFamily={LABEL_FONT} fill="rgb(var(--c-stone))">
          {monthLabel(start)}
        </text>
        {proj && endX != null && (
          <text x={endX} y={H - 6} textAnchor="end" fontSize={12} fontFamily={LABEL_FONT} fill="rgb(var(--c-stone))">
            {narrow ? `Summer ’${String(proj.year).slice(2)}` : `Summer ${proj.year}`}
          </text>
        )}

        {band && (
          <path
            d={band}
            fill="rgb(var(--c-primary) / 0.08)"
            stroke="rgb(var(--c-primary-300))"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )}

        {floorY != null && (
          <g>
            <line
              x1={padL}
              x2={width - padR}
              y1={floorY}
              y2={floorY}
              stroke="rgb(var(--c-leaf))"
              strokeWidth={1.5}
              strokeDasharray="6 5"
            />
            <text
              x={padL + 6}
              y={floorLabelY as number}
              fontSize={12}
              fontFamily={LABEL_FONT}
              fill="rgb(var(--c-clay-tint-text))"
            >
              {narrow ? "Targets start" : "Target schools start at"}{" "}
              <tspan fontFamily={NUMBER_FONT}>{formatUtrEstimate(model.targetFloor as number)}</tspan>
            </text>
          </g>
        )}

        {/* Today: a dotted vertical line. */}
        <line x1={todayX} x2={todayX} y1={padTop - 6} y2={H - padBottom} stroke="rgb(var(--c-stone))" strokeWidth={1} strokeDasharray="2 4" />
        <text x={todayX} y={padTop - 10} textAnchor="middle" fontSize={11} fontFamily={LABEL_FONT} fill="rgb(var(--c-stone))">
          Today
        </text>

        {/* Dotted, like the planning estimate on /today and /plan
            (lib/chart-legend.ts, final-check A3). */}
        {projLine && <polyline points={projLine} fill="none" stroke="rgb(var(--c-primary))" strokeWidth={2.5} strokeDasharray="0.5 6" strokeLinecap="round" />}

        {solid.length > 1 && <polyline points={solidLine} fill="none" stroke="rgb(var(--c-primary))" strokeWidth={2.5} />}
        {loggedPts.map((p) => (
          <circle key={p.date.getTime()} cx={x(p.date)} cy={y(p.utr)} r={3.5} fill="rgb(var(--c-primary))" />
        ))}

        <circle cx={todayX} cy={todayY} r={6.5} fill="rgb(var(--c-lime))" stroke="rgb(var(--c-on-lime))" strokeWidth={1.5} />
        <text
          x={todayX - 10}
          y={todayLabelY}
          textAnchor="end"
          fontSize={12}
          fontWeight={600}
          fontFamily={NUMBER_FONT}
          fill="rgb(var(--c-ink))"
        >
          {formatPlayerUtr(model.today.utr)}
        </text>

        {proj && endX != null && endY != null && (
          <>
            <circle cx={endX} cy={endY} r={4} fill="rgb(var(--c-card))" stroke="rgb(var(--c-primary))" strokeWidth={2} strokeDasharray="2 2" />
            <text x={endX - 8} y={endY - 10} textAnchor="end" fontSize={12} fontFamily={LABEL_FONT} fill="rgb(var(--c-primary))">
              ≈ <tspan fontFamily={NUMBER_FONT}>{formatUtrEstimate(proj.value)}</tspan> estimate
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

/** Legend under the chart title. Line style, not colour alone, tells the
 *  three apart: solid, dotted green, dashed clay. Names from
 *  lib/chart-legend.ts, the same as /today's and /plan's charts. */
export function UtrTrendLegend({ showEstimate, showFloor }: { showEstimate: boolean; showFloor: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone" aria-label="Chart legend">
      <li className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden>
          <line x1="1" x2="21" y1="4" y2="4" stroke="rgb(var(--c-primary))" strokeWidth="2.5" />
        </svg>
        Logged
      </li>
      {showEstimate && (
        <li className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line x1="2" x2="21" y1="4" y2="4" stroke="rgb(var(--c-primary))" strokeWidth="2.5" strokeDasharray="0.5 6" strokeLinecap="round" />
          </svg>
          {CHART_LINE_NAMES.estimate}
        </li>
      )}
      {showFloor && (
        <li className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line x1="1" x2="21" y1="4" y2="4" stroke="rgb(var(--c-leaf))" strokeWidth="1.5" strokeDasharray="6 5" />
          </svg>
          Target schools start
        </li>
      )}
    </ul>
  );
}
