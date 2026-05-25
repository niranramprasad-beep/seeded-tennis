"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

interface HoursDonutChartProps {
  data: DonutDatum[];
  height?: number;
  centerValue?: string;
  centerLabel?: string;
}

export function HoursDonutChart({
  data,
  height = 220,
  centerValue,
  centerLabel,
}: HoursDonutChartProps) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <div className="rounded-xl border-[0.5px] border-line bg-card px-3 py-2 shadow-lift">
                  <p className="text-sm font-medium text-ink">
                    {payload[0].name}
                  </p>
                  <p className="text-xs text-stone">
                    {payload[0].value} hrs / week
                  </p>
                </div>
              ) : null
            }
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="none"
            animationDuration={1100}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {(centerValue || centerLabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && (
            <span className="text-2xl font-medium text-ink">{centerValue}</span>
          )}
          {centerLabel && (
            <span className="text-xs text-stone-light">{centerLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
