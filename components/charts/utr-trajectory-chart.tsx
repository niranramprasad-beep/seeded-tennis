"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useThemeColors } from "@/lib/context/theme-context";
import {
  buildUtrChartSeries,
  buildUtrSummaryLine,
  type UtrChartRow,
  type UtrDataPoint,
  type UtrRangeOption,
} from "@/lib/utr-projection";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS: { value: UtrRangeOption; label: string }[] = [
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "ALL", label: "All" },
];

interface UTRTrajectoryChartProps {
  /** Real logged UTR history. Pass an empty array if the player has none yet. */
  actualEntries: UtrDataPoint[];
  /** Real roadmap checkpoints (from buildRoadmap). */
  targetPoints: UtrDataPoint[];
  graduationYear: number;
  targetUTR: number;
  height?: number;
}

function formatTick(dateMs: number): string {
  return new Date(dateMs).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function ChartTooltip({ active, payload, c }: any) {
  if (!active || !payload?.length) return null;
  const date = payload[0]?.payload?.dateMs;
  const rows: { key: string; label: string; value: number; color: string }[] = [];
  for (const p of payload) {
    if (p.dataKey === "actual" && p.value != null) {
      rows.push({ key: "actual", label: "Actual", value: p.value, color: c.primary });
    }
    if (p.dataKey === "projected" && p.value != null) {
      rows.push({ key: "projected", label: "Projected", value: p.value, color: c.tennis });
    }
    if (p.dataKey === "target" && p.value != null) {
      rows.push({ key: "target", label: "Target", value: p.value, color: c.stone });
    }
  }
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border-[0.5px] border-line bg-card px-3 py-2 shadow-lift">
      <p className="text-xs text-stone-light">
        {date ? new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}
      </p>
      {rows.map((r) => (
        <p key={r.key} className="text-sm font-medium" style={{ color: r.color }}>
          {r.label}: {r.value.toFixed(1)}
        </p>
      ))}
    </div>
  );
}

export function UTRTrajectoryChart({
  actualEntries,
  targetPoints,
  graduationYear,
  targetUTR,
  height = 340,
}: UTRTrajectoryChartProps) {
  const c = useThemeColors();
  const [range, setRange] = useState<UtrRangeOption>("ALL");

  const { rows, hasProjection, projection } = useMemo(
    () => buildUtrChartSeries({ actualEntries, targetPoints, range }),
    [actualEntries, targetPoints, range]
  );

  const summary = useMemo(
    () => buildUtrSummaryLine({ projection, graduationYear, targetUTR }),
    [projection, graduationYear, targetUTR]
  );

  const allValues = rows.flatMap((r) =>
    [r.actual, r.projected, r.projLower, r.projUpper, r.target].filter(
      (v): v is number => v != null
    )
  );
  // Guarantee a minimum 3-point visual span — with only one or two logged
  // results, the real min/max sit a hair apart and the chart reads as an
  // empty box with a dot floating in it rather than an actual chart.
  const rawMin = allValues.length ? Math.min(...allValues) : 1;
  const rawMax = allValues.length ? Math.max(...allValues) : 16.5;
  const mid = (rawMin + rawMax) / 2;
  const span = Math.max(3, rawMax - rawMin + 1);
  const min = Math.floor(mid - span / 2);
  const max = Math.ceil(mid + span / 2);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend c={c} />
        <div className="flex items-center gap-0.5 rounded-pill border-[0.5px] border-line bg-grass-50/70 p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={cn(
                "rounded-pill px-3 py-1.5 text-xs font-medium transition-colors",
                range === opt.value
                  ? "bg-card text-grass-900 shadow-soft"
                  : "text-stone hover:text-ink"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={c.line} strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="dateMs"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatTick}
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.stoneLight, fontSize: 11 }}
              minTickGap={32}
              dy={8}
            />
            <YAxis
              domain={[min, max]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.stoneLight, fontSize: 11 }}
              width={28}
            />
            <Tooltip content={<ChartTooltip c={c} />} cursor={{ stroke: c.leaf, strokeDasharray: "4 4" }} />

            {/* Uncertainty band: invisible base up to the lower bound, then a
                shaded fill up to the upper bound — the standard recharts
                "range area" trick for a band around a projected line. */}
            <Area
              dataKey="projLower"
              stackId="band"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
            />
            <Area
              dataKey={(row: UtrChartRow) =>
                row.projUpper != null && row.projLower != null
                  ? row.projUpper - row.projLower
                  : null
              }
              stackId="band"
              stroke="none"
              fill={c.tennis}
              fillOpacity={0.12}
              isAnimationActive={false}
            />

            <Line
              type="monotone"
              dataKey="target"
              stroke={c.stone}
              strokeWidth={2}
              strokeDasharray="1 5"
              strokeLinecap="round"
              dot={false}
              connectNulls
              animationDuration={1200}
            />
            <Line
              type="monotone"
              dataKey="projected"
              stroke={c.tennis}
              strokeWidth={2.5}
              strokeDasharray="7 5"
              dot={false}
              connectNulls
              animationDuration={1200}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke={c.primary}
              strokeWidth={3}
              dot={{ r: 5, fill: c.primary, strokeWidth: 2, stroke: c.card }}
              activeDot={{ r: 7, fill: c.primary, strokeWidth: 2, stroke: c.card }}
              connectNulls
              animationDuration={1200}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {summary ? (
        <p className="mt-4 rounded-xl bg-grass-50 px-4 py-3 text-center text-sm font-medium text-grass-900 sm:text-left">
          {summary}
        </p>
      ) : (
        !hasProjection && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-cream/70 px-4 py-3 text-sm text-stone">
            <Sparkles className="h-4 w-4 shrink-0 text-leaf-accent" />
            <span>
              Log {Math.max(0, 3 - actualEntries.length)} more result
              {Math.max(0, 3 - actualEntries.length) === 1 ? "" : "s"} to unlock your projection line.
            </span>
          </div>
        )
      )}
    </div>
  );
}

function Legend({ c }: { c: ReturnType<typeof useThemeColors> }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-stone">
      <span className="flex items-center gap-2">
        <span className="h-1 w-6 rounded-full" style={{ backgroundColor: c.primary }} />
        Actual
      </span>
      <span className="flex items-center gap-2">
        <span
          className="h-1 w-6 rounded-full"
          style={{
            backgroundImage: `linear-gradient(to right, ${c.tennis} 60%, transparent 40%)`,
            backgroundSize: "9px 3px",
          }}
        />
        Projected
      </span>
      <span className="flex items-center gap-2">
        <span
          className="h-1 w-6 rounded-full"
          style={{
            backgroundImage: `linear-gradient(to right, ${c.stone} 30%, transparent 30%)`,
            backgroundSize: "6px 3px",
          }}
        />
        Target
      </span>
    </div>
  );
}
