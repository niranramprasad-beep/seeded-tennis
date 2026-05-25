"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useThemeColors } from "@/lib/context/theme-context";

export interface UTRPoint {
  label: string;
  utr: number;
}

interface UTRLineChartProps {
  data: UTRPoint[];
  height?: number;
  target?: number;
  showAxis?: boolean;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border-[0.5px] border-line bg-card px-3 py-2 shadow-lift">
      <p className="text-xs text-stone-light">{label}</p>
      <p className="text-sm font-medium text-ink">
        UTR {Number(payload[0].value).toFixed(1)}
      </p>
    </div>
  );
}

export function UTRLineChart({
  data,
  height = 240,
  target,
  showAxis = true,
}: UTRLineChartProps) {
  const c = useThemeColors();
  const values = data.map((d) => d.utr);
  const min = Math.floor(Math.min(...values, target ?? Infinity) - 1);
  const max = Math.ceil(Math.max(...values, target ?? -Infinity) + 1);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 12, left: showAxis ? 0 : 12, bottom: 0 }}>
        <defs>
          <linearGradient id="utrFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.leaf} stopOpacity={0.35} />
            <stop offset="100%" stopColor={c.leaf} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={c.line} strokeDasharray="3 4" vertical={false} />
        {showAxis && (
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: c.stoneLight, fontSize: 12 }}
            dy={8}
          />
        )}
        {showAxis && (
          <YAxis
            domain={[min, max]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: c.stoneLight, fontSize: 12 }}
            width={28}
          />
        )}
        {!showAxis && <XAxis dataKey="label" hide />}
        {!showAxis && <YAxis domain={[min, max]} hide />}
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.leaf, strokeDasharray: "4 4" }} />
        {target !== undefined && (
          <ReferenceLine
            y={target}
            stroke={c.primary}
            strokeDasharray="5 5"
            strokeOpacity={0.5}
            label={{
              value: `Target ${target.toFixed(1)}`,
              position: "insideTopRight",
              fill: c.stone,
              fontSize: 11,
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="utr"
          stroke={c.primary}
          strokeWidth={2.5}
          fill="url(#utrFill)"
          dot={{ r: 3.5, fill: c.primary, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: c.primary }}
          animationDuration={1600}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
