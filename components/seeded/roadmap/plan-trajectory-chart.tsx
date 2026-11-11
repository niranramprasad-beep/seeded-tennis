"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { computeUtrProjection, type UtrDataPoint } from "@/lib/utr-projection";
import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";
import type { PlayerGender, RoadmapYear, SchoolLite } from "@/lib/types";
import { formatUTR } from "@/lib/utils";
import { StarButton } from "@/components/seeded/ui/star-button";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Every text element in this SVG sets its font-family explicitly — SVG
// text doesn't reliably inherit the page's font cascade the way HTML does,
// so without this every label/number here would silently fall back to the
// browser's default serif. Labels use Inter, numbers use the active mono
// (JetBrains Mono under Seeded — see --font-mono-active in app/globals.css).
const LABEL_FONT = "var(--font-inter)";
const NUMBER_FONT = "var(--font-mono-active)";

interface Checkpoint {
  date: Date;
  utr: number;
  label: string;
  year: RoadmapYear;
}

interface PlanTrajectoryChartProps {
  actualPoints: UtrDataPoint[];
  roadmap: RoadmapYear[];
  gender: PlayerGender;
  /** Real order from player.targetSchoolSlugs — the schools whose
   * minCompetitiveUTR actually drives buildRoadmap's goalUTR. */
  targetSchools: SchoolLite[];
  goalUTR: number;
  isStarred: (slug: string) => boolean;
  toggleStar: (slug: string, label: string) => void;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

// Pixel-styled to PlayerProfile.dc.html's "Your plan to senior summer"
// chart: solid line through real UTR history, dashed line through the
// roadmap's own checkpoints (buildRoadmap() — never re-derived here), a
// real projection confidence band (same lib/utr-projection.ts math as
// Today's chart), and diamond markers at each checkpoint. Honestly omits
// the band under 3 real entries, same as /today. Adds: 1.0-UTR gridlines,
// 3-month x-axis ticks, a real-data hover/scrub tooltip, and a click-to-
// edit control on each checkpoint (see the inline editor below the SVG).
export function PlanTrajectoryChart({
  actualPoints,
  roadmap,
  gender,
  targetSchools,
  goalUTR,
  isStarred,
  toggleStar,
}: PlanTrajectoryChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<number | null>(null);

  const sortedActual = [...actualPoints].sort((a, b) => a.date.getTime() - b.date.getTime());
  const now = sortedActual[sortedActual.length - 1] ?? { date: new Date(), utr: 0 };

  // Roadmap checkpoints land "the summer before" each grade — June 1 of the
  // checkpoint year, matching the copy right above this chart in the layout.
  const checkpoints: Checkpoint[] = roadmap
    .map((y) => ({ date: new Date(y.calendarYear, 5, 1), utr: y.utrTarget, label: y.gradeLabel, year: y }))
    .filter((c) => c.date.getTime() > now.date.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const lastCheckpoint = checkpoints[checkpoints.length - 1] ?? null;
  const horizon = lastCheckpoint ?? { date: new Date(now.date.getTime() + 365 * 86_400_000), utr: now.utr, label: "" };

  const ceiling = REALISTIC_UTR_CEILING[gender];
  const projection = computeUtrProjection(sortedActual, { ceiling });

  const utrValues = [now.utr, horizon.utr, ...checkpoints.map((c) => c.utr), ...sortedActual.map((p) => p.utr)];
  if (projection) utrValues.push(projection.upperBound(horizon.date), projection.lowerBound(horizon.date));
  const utrMin = Math.min(...utrValues) - 0.4;
  const utrMax = Math.max(...utrValues) + 0.4;
  const dateMin = sortedActual[0]?.date.getTime() ?? now.date.getTime();
  const dateMax = Math.max(horizon.date.getTime(), now.date.getTime() + 1);

  const W = 900;
  const H = 220;
  const padL = 40;
  const padR = 20;
  const padTop = 20;
  const baseline = 180;

  const x = (t: number) => padL + ((t - dateMin) / (dateMax - dateMin)) * (W - padL - padR);
  const y = (utr: number) => baseline - ((utr - utrMin) / (utrMax - utrMin)) * (baseline - padTop);

  const actualLine = sortedActual.map((p) => `${x(p.date.getTime())},${y(p.utr)}`).join(" ");
  const dashedLine = [
    `${x(now.date.getTime())},${y(now.utr)}`,
    ...checkpoints.map((c) => `${x(c.date.getTime())},${y(c.utr)}`),
  ].join(" ");

  const bandPath = projection
    ? (() => {
        const steps = 16;
        const upper: string[] = [];
        const lower: string[] = [];
        for (let i = 0; i <= steps; i++) {
          const t = now.date.getTime() + (i / steps) * (horizon.date.getTime() - now.date.getTime());
          const d = new Date(t);
          upper.push(`${x(t)},${y(projection.upperBound(d))}`);
          lower.push(`${x(t)},${y(projection.lowerBound(d))}`);
        }
        return `M${upper.join(" L")} L${lower.reverse().join(" L")} Z`;
      })()
    : null;

  const label = (d: Date) => `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;

  // Y-axis gridlines every 1.0 UTR.
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let v = Math.ceil(utrMin); v <= Math.floor(utrMax); v += 1) ticks.push(v);
    return ticks;
  }, [utrMin, utrMax]);

  // X-axis ticks every 3 months, aligned to calendar-month boundaries.
  const xTicks = useMemo(() => {
    const ticks: Date[] = [];
    let cursor = startOfMonth(new Date(dateMin));
    while (cursor.getTime() < dateMax) {
      if (cursor.getTime() >= dateMin) ticks.push(cursor);
      cursor = addMonths(cursor, 3);
    }
    if (ticks.length === 0 || ticks[ticks.length - 1].getTime() < dateMax - 1) {
      ticks.push(new Date(dateMax));
    }
    return ticks;
  }, [dateMin, dateMax]);

  // Real-data-only hover: clamps to the actual history's own domain and
  // linearly interpolates between the two real points the solid line
  // itself already draws a straight segment between — reading a value off
  // that rendered line is honest; nothing is fabricated beyond it. With a
  // single real anchor point (no logged history yet) every hover position
  // just shows that one real value.
  const actualValueAt = (t: number): { date: Date; utr: number } => {
    if (sortedActual.length === 0) return { date: now.date, utr: now.utr };
    if (sortedActual.length === 1) return sortedActual[0];
    const clamped = Math.min(Math.max(t, sortedActual[0].date.getTime()), sortedActual[sortedActual.length - 1].date.getTime());
    let i = 0;
    while (i < sortedActual.length - 2 && sortedActual[i + 1].date.getTime() < clamped) i++;
    const a = sortedActual[i];
    const b = sortedActual[i + 1];
    const span = b.date.getTime() - a.date.getTime();
    const frac = span === 0 ? 0 : (clamped - a.date.getTime()) / span;
    return { date: new Date(clamped), utr: a.utr + (b.utr - a.utr) * frac };
  };

  const handleHover = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const svgX = (px / rect.width) * W;
    setHoverX(Math.min(Math.max(svgX, padL), W - padR));
  };

  const hoverT = hoverX != null ? dateMin + ((hoverX - padL) / (W - padL - padR)) * (dateMax - dateMin) : null;
  const hoverPoint = hoverT != null ? actualValueAt(hoverT) : null;
  const tooltipOnRight = hoverX != null && hoverX > W - 180;

  const selected = selectedCheckpoint != null ? checkpoints[selectedCheckpoint] : null;
  const drivingSchool =
    targetSchools.length > 0
      ? targetSchools.reduce((a, b) => (b.minCompetitiveUTR > a.minCompetitiveUTR ? b : a))
      : null;

  return (
    <div>
      <svg
        ref={svgRef}
        role="img"
        aria-label={`UTR ${formatUTR(now.utr)} as of ${label(now.date)}${
          checkpoints.length ? `, plan checkpoints: ${checkpoints.map((c) => `${formatUTR(c.utr)} by ${label(c.date)}`).join(", ")}` : ""
        }`}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair"
        onMouseMove={(e) => handleHover(e.clientX)}
        onMouseLeave={() => setHoverX(null)}
        onTouchMove={(e) => e.touches[0] && handleHover(e.touches[0].clientX)}
        onTouchEnd={() => setHoverX(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="rgb(var(--c-line))" strokeWidth="1" />
            <text
              x={padL - 8}
              y={y(v) - 3}
              textAnchor="end"
              fontSize="11"
              fontFamily={NUMBER_FONT}
              fill="rgb(var(--c-stone-light))"
            >
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        {xTicks.map((d, i) => {
          const tx = x(d.getTime());
          const anchor = i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle";
          return (
            <text
              key={d.getTime()}
              x={Math.min(Math.max(tx, padL), W - padR)}
              y={H - 6}
              textAnchor={anchor}
              fontSize="12"
              fontFamily={LABEL_FONT}
              fill="rgb(var(--c-stone))"
            >
              {label(d)}
            </text>
          );
        })}

        {bandPath && <path d={bandPath} fill="rgb(var(--c-primary-50))" />}
        {sortedActual.length > 1 && (
          <polyline points={actualLine} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="3" />
        )}
        {checkpoints.length > 0 && (
          <polyline
            points={dashedLine}
            fill="none"
            stroke="rgb(var(--c-primary))"
            strokeWidth="2"
            strokeDasharray="6 5"
          />
        )}
        {checkpoints.map((c, i) => (
          <g key={c.date.getTime()}>
            <rect
              x={x(c.date.getTime()) - 7}
              y={y(c.utr) - 7}
              width="14"
              height="14"
              fill="rgb(var(--c-gold))"
              stroke={selectedCheckpoint === i ? "rgb(var(--c-ink))" : "transparent"}
              strokeWidth="2"
              transform={`rotate(45 ${x(c.date.getTime())} ${y(c.utr)})`}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`Edit the ${label(c.date)} checkpoint, target ${formatUTR(c.utr)}`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCheckpoint(selectedCheckpoint === i ? null : i);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedCheckpoint(selectedCheckpoint === i ? null : i);
                }
              }}
            />
            <text
              x={Math.min(x(c.date.getTime()) + 10, W - 110)}
              y={y(c.utr) - 10}
              fontSize="12"
              fill="rgb(var(--c-ink))"
              fontFamily={LABEL_FONT}
            >
              {label(c.date)} ·{" "}
              <tspan fontFamily={NUMBER_FONT}>{formatUTR(c.utr)}</tspan>
            </text>
          </g>
        ))}
        <circle
          cx={x(now.date.getTime())}
          cy={y(now.utr)}
          r="8"
          fill="rgb(var(--c-lime))"
          stroke="rgb(var(--c-ink))"
          strokeWidth="2"
        />
        <text
          x={x(now.date.getTime())}
          y={y(now.utr) - 14}
          fontSize="12"
          fontWeight="600"
          fill="rgb(var(--c-ink))"
          fontFamily={LABEL_FONT}
        >
          Now <tspan fontFamily={NUMBER_FONT}>{formatUTR(now.utr)}</tspan>
        </text>

        {hoverX != null && hoverPoint && (
          <g>
            <line x1={hoverX} y1={padTop} x2={hoverX} y2={baseline} stroke="rgb(var(--c-ink))" strokeOpacity="0.25" strokeWidth="1" />
            <circle cx={hoverX} cy={y(hoverPoint.utr)} r="4" fill="rgb(var(--c-ink))" />
            <g transform={`translate(${tooltipOnRight ? hoverX - 172 : hoverX + 10}, ${padTop + 4})`}>
              <rect width="162" height="40" rx="6" fill="rgb(var(--c-card))" stroke="rgb(var(--c-line))" />
              <text x="10" y="17" fontSize="11" fontFamily={LABEL_FONT} fill="rgb(var(--c-stone))">
                {label(hoverPoint.date)}
              </text>
              <text x="10" y="32" fontSize="13" fontWeight="600" fontFamily={NUMBER_FONT} fill="rgb(var(--c-ink))">
                {hoverPoint.utr.toFixed(2)} UTR
              </text>
            </g>
          </g>
        )}
      </svg>
      <p className="mt-2 text-[13px] text-stone">
        {/* P0-7: was "Solid line: verified results." These are UTR entries the
            player typed in themselves — nothing verifies them. */}
        Solid line: the UTRs you&apos;ve logged.{" "}
        {checkpoints.length > 0 && "Dashed: the pace your plan needs. "}
        {projection
          ? "Green: the range your recent results support."
          : "Log a few more UTR results to unlock a projected range."}{" "}
        Never a guarantee. Hover to scrub real values; click a checkpoint diamond to edit what drives it.
      </p>

      {selected && (
        <div className="mt-3 rounded-xl border border-line bg-grass-50 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">
                Editing: {selected.label} — {label(selected.date)} ·{" "}
                <span className="font-mono">{formatUTR(selected.utr)}</span>
              </p>
              {drivingSchool ? (
                <p className="mt-1 text-xs text-stone">
                  This checkpoint ramps toward your goal of <span className="font-mono">{formatUTR(goalUTR)}</span>,
                  set by your hardest real target:{" "}
                  <Link href={`/schools/${drivingSchool.slug}`} className="font-semibold text-grass">
                    {drivingSchool.shortName}
                  </Link>{" "}
                  (floor <span className="font-mono">{formatUTR(drivingSchool.minCompetitiveUTR)}</span>). This
                  checkpoint is derived from your target list, not stored on its own — remove the driving school
                  below to lower the goal, or add a tougher one in "Your target schools" to raise it.
                </p>
              ) : (
                <p className="mt-1 text-xs text-stone">
                  You have no target schools yet, so this checkpoint uses a default goal of{" "}
                  <span className="font-mono">{formatUTR(goalUTR)}</span> (your current UTR + 2.5, capped at a
                  realistic ceiling). Star a target school in "Your target schools" below to set a real goal
                  instead.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedCheckpoint(null)}
              className="shrink-0 text-xs font-semibold text-stone hover:text-ink"
            >
              Close
            </button>
          </div>

          {targetSchools.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {targetSchools.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 truncate text-ink">
                    <StarButton
                      starred={isStarred(s.slug)}
                      onToggle={() => toggleStar(s.slug, s.shortName)}
                      label={s.shortName}
                      className="h-6 w-6"
                    />
                    {s.shortName}
                    {s.slug === drivingSchool?.slug && (
                      <span className="rounded-pill bg-card px-1.5 py-0.5 text-[10px] font-semibold text-grass">
                        driving your goal
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-xs text-stone">{formatUTR(s.minCompetitiveUTR)} floor</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
