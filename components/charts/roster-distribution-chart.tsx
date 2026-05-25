"use client";

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { useThemeColors } from "@/lib/context/theme-context";

interface RosterDistributionChartProps {
  avgUTR: number;
  minUTR: number;
  height?: number;
}

const WEIGHTS = [1, 2, 4, 6, 7, 5, 3, 1];

// Derives a plausible roster-UTR histogram from a program's average and
// minimum competitive UTR. (A real backend would return actual roster data.)
export function RosterDistributionChart({
  avgUTR,
  minUTR,
  height = 200,
}: RosterDistributionChartProps) {
  const c = useThemeColors();
  const start = Math.round((minUTR - 0.5) * 2) / 2;
  const data = WEIGHTS.map((w, i) => {
    const utr = start + i * 0.5;
    return { utr, label: utr.toFixed(1), players: w };
  });

  const minLabel = data.reduce((best, d) =>
    Math.abs(d.utr - minUTR) < Math.abs(best.utr - minUTR) ? d : best
  ).label;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: c.stoneLight, fontSize: 11 }}
          dy={6}
        />
        <Tooltip
          cursor={{ fill: c.line, fillOpacity: 0.4 }}
          content={({ active, payload, label }: any) =>
            active && payload?.length ? (
              <div className="rounded-xl border-[0.5px] border-line bg-card px-3 py-2 shadow-lift">
                <p className="text-xs text-stone-light">UTR {label}</p>
                <p className="text-sm font-medium text-ink">
                  {payload[0].value} players
                </p>
              </div>
            ) : null
          }
        />
        <ReferenceLine
          x={minLabel}
          stroke={c.primary}
          strokeDasharray="4 4"
          strokeOpacity={0.55}
          label={{
            value: "Min competitive",
            position: "top",
            fill: c.stone,
            fontSize: 10,
          }}
        />
        <Bar dataKey="players" radius={[6, 6, 0, 0]} animationDuration={1200}>
          {data.map((d) => (
            <Cell
              key={d.label}
              fill={Math.abs(d.utr - avgUTR) < 0.26 ? c.leaf : c.line}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
