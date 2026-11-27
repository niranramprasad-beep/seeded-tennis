"use client";

import { useState } from "react";
import type { UtrDataPoint } from "@/lib/utr-projection";
import { chartEndLabels, estimateOnDate, type UtrEstimatePoint } from "@/lib/fit";
import { formatDate } from "@/lib/time";
import { formatCheckpointUtr, formatPlayerUtr, hasRealUtr } from "@/lib/utils";
import { useMeasuredWidth } from "@/components/seeded/ui/use-measured-width";
import { approxTextWidth, monthTicks, monthYearLabel, utrTicks } from "@/components/seeded/ui/chart-axis";

interface UtrVsPlanChartProps {
  actualPoints: (UtrDataPoint & { undated?: boolean })[];
  /** The first box of /plan's quarterly checkpoint line (lib/fit
   *  planCheckpoints), or null without a plan UTR. */
  nextCheckpoint: { date: Date; utr: number } | null;
  /** The player's own plan UTR — the last checkpoint IS this number and
   *  prints exactly as typed (lib/utils.ts formatCheckpointUtr). */
  goalValue?: number | null;
  /** lib/fit.ts projectionPath — the estimate every ProjectionNote prints.
   *  Passed only while no plan UTR is set; empty otherwise. */
  estimate: UtrEstimatePoint[];
}

/** A point a reader can hover, tap or tab to: its exact UTR and date. */
interface TipPoint {
  key: string;
  cx: number;
  cy: number;
  title: string;
  value: string;
}

// 220 tall (was 150) since PR-POLISH: the card sits in the main column, so
// the chart is ~750px wide at 1440, with a y-axis and month ticks. Height is
// fixed, so measuring the width never shifts the page.
const H = 220;
const PAD_L = 34;
const PAD_R = 10;
const PAD_TOP = 26;
const BASELINE = H - 28;
const AXIS_FONT_SIZE = 12;
const FONT = "var(--font-inter)";
const NUMBER_FONT = "var(--font-mono-active)";

// /today's "UTR vs plan": a solid line through the player's logged ratings
// with a dot at each, a lime dot at the latest, and — with a plan UTR — the
// plan dashed from today to its next checkpoint (a gold diamond on a gold
// marker). With no plan, the estimate (lib/fit.ts) runs dotted to the summer
// before senior year and its end label is the number every screen prints.
//
// 2026-11-27: every logged rating and the checkpoint can be hovered, tapped
// or tabbed to for its exact UTR and date, and the grey "own pace" line is
// gone with the 1.5-a-year banners.
//
// C21: every label is anchored inside a viewBox as wide as the column, and
// the y-range covers every logged value.
//
// The card's legend and one data note are rendered by the card in
// seeded-dashboard-layout.tsx, not here — this draws only.
export function UtrVsPlanChart({ actualPoints, nextCheckpoint, goalValue, estimate }: UtrVsPlanChartProps) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>(320);
  const [tip, setTip] = useState<string | null>(null);
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
  const reachesTarget = !checkpoint && estimateEnd != null;
  const endLabel = reachesTarget ? chartEndLabels(estimate, []).plan : null;

  const utrValues = [
    ...sorted.map((p) => p.utr),
    ...(checkpoint ? [checkpoint.utr] : []),
    ...band.flatMap((p) => [p.low, p.high]),
  ];
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
  const bandEnd = band[band.length - 1];

  const yTicks = utrTicks(utrMin, utrMax);
  const xTicks = monthTicks(dateMin, dateMax, plotW, 76);

  const endX = x(endDate.getTime());
  const checkpointUtrText = checkpoint ? formatCheckpointUtr(checkpoint.utr, goalValue) : "";
  const checkpointText = checkpoint ? `${monthYearLabel(checkpoint.date)} · ${checkpointUtrText}` : "";
  const checkpointLabelX = Math.max(PAD_L + approxTextWidth(checkpointText, AXIS_FONT_SIZE), endX - 4);

  // Hover / tap / focus targets: every logged rating and the next
  // checkpoint, each with its exact UTR and date.
  const tipPoints: TipPoint[] = [
    ...sorted.map((p, i) => ({
      key: `logged-${i}`,
      cx: x(p.date.getTime()),
      cy: y(p.utr),
      title: p.undated ? "Your UTR now" : `Logged ${formatDate(p.date)}`,
      value: formatPlayerUtr(p.utr),
    })),
    ...(checkpoint
      ? [{ key: "checkpoint", cx: endX, cy: y(checkpoint.utr), title: `Plan checkpoint · ${formatDate(checkpoint.date)}`, value: checkpointUtrText }]
      : []),
  ];
  const active = tipPoints.find((p) => p.key === tip) ?? null;

  return (
    <div ref={ref} className="w-full">
      <svg
        role="group"
        aria-roledescription="chart"
        aria-label={`UTR ${formatPlayerUtr(now.utr)} as of ${monthYearLabel(now.date)}${
          checkpoint ? `, next checkpoint ${checkpointUtrText} by ${monthYearLabel(checkpoint.date)}` : ""
        }. Tab to a point to read its UTR and date.`}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-full"
      >
        {yTicks.map((v) => (
          <g key={v} aria-hidden="true">
            <line x1={PAD_L} y1={y(v)} x2={W - PAD_R} y2={y(v)} stroke="rgb(var(--c-line))" strokeWidth="1" />
            <text x={PAD_L - 6} y={y(v) + 4} textAnchor="end" fontSize={AXIS_FONT_SIZE} fontFamily={NUMBER_FONT} fill="rgb(var(--c-stone))">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        ))}
        {xTicks.map((d, i) => {
          const text = monthYearLabel(d);
          const tw = approxTextWidth(text, AXIS_FONT_SIZE);
          const cx = Math.min(Math.max(x(d.getTime()), PAD_L + tw / 2), W - PAD_R - tw / 2);
          return (
            <text key={i} aria-hidden="true" x={cx} y={H - 8} textAnchor="middle" fontSize={AXIS_FONT_SIZE} fontFamily={FONT} fill="rgb(var(--c-stone))">
              {text}
            </text>
          );
        })}

        {bandPath && <path aria-hidden="true" d={bandPath} fill="rgb(var(--c-primary-50))" />}
        {/* The estimate's own line, DOTTED as on /plan (lib/chart-legend.ts). */}
        {estimateLine && (
          <polyline aria-hidden="true" points={estimateLine} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="2.5" strokeDasharray="0.5 6" strokeLinecap="round" />
        )}
        {endLabel && bandEnd && (
          <text
            aria-hidden="true"
            x={W - PAD_R}
            y={Math.max(14, Math.min(BASELINE - 4, y(bandEnd.value) - 9))}
            textAnchor="end"
            fontSize="13"
            fontWeight="600"
            fill="rgb(var(--c-primary))"
            fontFamily={NUMBER_FONT}
          >
            {endLabel}
          </text>
        )}
        {sorted.length > 1 && <polyline aria-hidden="true" points={linePoints} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="2.5" />}
        {checkpoint && (
          <g aria-hidden="true">
            {/* The plan, dashed, from today to its next checkpoint — the
                same line style as /plan's chart (lib/chart-legend.ts). */}
            <line x1={x(now.date.getTime())} y1={y(now.utr)} x2={endX} y2={y(checkpoint.utr)} stroke="rgb(var(--c-primary))" strokeWidth="2" strokeDasharray="6 5" />
            <line x1={endX} y1={PAD_TOP - 4} x2={endX} y2={BASELINE} stroke="rgb(var(--c-gold))" strokeDasharray="3 3" />
            <rect x={endX - 5} y={y(checkpoint.utr) - 5} width="10" height="10" fill="rgb(var(--c-gold))" transform={`rotate(45 ${endX} ${y(checkpoint.utr)})`} />
            <text x={checkpointLabelX} y={PAD_TOP - 10} textAnchor="end" fontSize={AXIS_FONT_SIZE} fill="rgb(var(--c-ink))" fontFamily={FONT}>
              {monthYearLabel(checkpoint.date)} · <tspan fontFamily={NUMBER_FONT}>{checkpointUtrText}</tspan>
            </text>
          </g>
        )}
        {sorted.slice(0, -1).map((p, i) => (
          <circle key={i} aria-hidden="true" cx={x(p.date.getTime())} cy={y(p.utr)} r="3.5" fill="rgb(var(--c-primary))" stroke="rgb(var(--c-card))" strokeWidth="1.5" />
        ))}
        <circle aria-hidden="true" cx={x(now.date.getTime())} cy={y(now.utr)} r="6" fill="rgb(var(--c-lime))" stroke="rgb(var(--c-ink))" strokeWidth="2" />

        {/* Hit areas: hover (mouse), tap (touch) or Tab to a point to read
            its exact UTR and date. A 22-unit radius stays a fair target when
            the chart scales down on a phone. */}
        {tipPoints.map((p) => (
          <circle
            key={p.key}
            cx={p.cx}
            cy={p.cy}
            r="22"
            fill="transparent"
            tabIndex={0}
            role="img"
            aria-label={`${p.title}: ${p.value}`}
            className="focus:outline-none"
            onPointerEnter={() => setTip(p.key)}
            onPointerDown={() => setTip(p.key)}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") setTip(null);
            }}
            onFocus={() => setTip(p.key)}
            onBlur={() => setTip(null)}
          />
        ))}
        {active && (
          <g pointerEvents="none" aria-hidden="true">
            <circle cx={active.cx} cy={active.cy} r="9" fill="none" stroke="rgb(var(--c-ink))" strokeWidth="1.5" />
            {(() => {
              const boxW = Math.max(approxTextWidth(active.title, 11), approxTextWidth(active.value, 13)) + 16;
              const bx = Math.min(Math.max(PAD_L, active.cx - boxW / 2), W - PAD_R - boxW);
              const by = active.cy - 52 >= 2 ? active.cy - 52 : active.cy + 14;
              return (
                <g transform={`translate(${bx}, ${by})`}>
                  <rect width={boxW} height="40" rx="6" fill="rgb(var(--c-card))" stroke="rgb(var(--c-line))" />
                  <text x="8" y="15" fontSize="11" fontFamily={FONT} fill="rgb(var(--c-stone))">
                    {active.title}
                  </text>
                  <text x="8" y="32" fontSize="13" fontWeight="600" fontFamily={NUMBER_FONT} fill="rgb(var(--c-ink))">
                    {active.value}
                  </text>
                </g>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
}
