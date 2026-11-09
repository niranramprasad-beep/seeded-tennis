import { computeUtrProjection, type UtrDataPoint } from "@/lib/utr-projection";
import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";
import type { PlayerGender, RoadmapYear } from "@/lib/types";
import { formatUTR } from "@/lib/utils";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Checkpoint {
  date: Date;
  utr: number;
  label: string;
}

interface PlanTrajectoryChartProps {
  actualPoints: UtrDataPoint[];
  roadmap: RoadmapYear[];
  gender: PlayerGender;
}

// Pixel-styled to PlayerProfile.dc.html's "Your plan to senior summer"
// chart: solid line through real UTR history, dashed line through the
// roadmap's own checkpoints (buildRoadmap() — never re-derived here), a
// real projection confidence band (same lib/utr-projection.ts math as
// Today's chart), and diamond markers at each checkpoint. Honestly omits
// the band under 3 real entries, same as /today.
export function PlanTrajectoryChart({ actualPoints, roadmap, gender }: PlanTrajectoryChartProps) {
  const sortedActual = [...actualPoints].sort((a, b) => a.date.getTime() - b.date.getTime());
  const now = sortedActual[sortedActual.length - 1] ?? { date: new Date(), utr: 0 };

  // Roadmap checkpoints land "the summer before" each grade — June 1 of the
  // checkpoint year, matching the copy right above this chart in the layout.
  const checkpoints: Checkpoint[] = roadmap
    .map((y) => ({ date: new Date(y.calendarYear, 5, 1), utr: y.utrTarget, label: y.gradeLabel }))
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

  return (
    <div>
      <svg
        role="img"
        aria-label={`UTR ${formatUTR(now.utr)} as of ${label(now.date)}${
          checkpoints.length ? `, plan checkpoints: ${checkpoints.map((c) => `${formatUTR(c.utr)} by ${label(c.date)}`).join(", ")}` : ""
        }`}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
      >
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
        {checkpoints.map((c) => (
          <g key={c.date.getTime()} fill="rgb(var(--c-gold))">
            <rect
              x={x(c.date.getTime()) - 6}
              y={y(c.utr) - 6}
              width="12"
              height="12"
              transform={`rotate(45 ${x(c.date.getTime())} ${y(c.utr)})`}
            />
            <text
              x={Math.min(x(c.date.getTime()) + 10, W - 110)}
              y={y(c.utr) - 10}
              fontSize="12"
              fill="rgb(var(--c-ink))"
              fontFamily="Inter"
            >
              {label(c.date)} · {formatUTR(c.utr)}
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
        <text x={x(now.date.getTime())} y={y(now.utr) - 14} fontSize="12" fontWeight="600" fill="rgb(var(--c-ink))" fontFamily="Inter">
          Now {formatUTR(now.utr)}
        </text>
        <text x={padL} y={H - 6} fontSize="12" fill="rgb(var(--c-stone))" fontFamily="Inter">
          {sortedActual[0] ? label(sortedActual[0].date) : label(now.date)}
        </text>
        <text x={W - 90} y={H - 6} fontSize="12" fill="rgb(var(--c-stone))" fontFamily="Inter">
          {label(horizon.date)}
        </text>
      </svg>
      <p className="mt-2 text-[13px] text-stone">
        Solid line: verified results.{" "}
        {checkpoints.length > 0 && "Dashed: the pace your plan needs. "}
        {projection
          ? "Green: the range your recent results support."
          : "Log a few more UTR results to unlock a projected range."}{" "}
        Never a guarantee.
      </p>
    </div>
  );
}
