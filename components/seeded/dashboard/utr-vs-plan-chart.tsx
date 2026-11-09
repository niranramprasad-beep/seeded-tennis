import { computeUtrProjection, type UtrDataPoint } from "@/lib/utr-projection";
import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";
import type { PlayerGender } from "@/lib/types";
import { formatUTR } from "@/lib/utils";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface UtrVsPlanChartProps {
  actualPoints: UtrDataPoint[];
  nextCheckpoint: { date: Date; utr: number } | null;
  gender: PlayerGender;
}

// Pixel-styled to Today.dc.html's "UTR vs plan" SVG: a confidence band (real
// projection math, not an invented margin — see lib/utr-projection.ts),
// solid line through real entries, ball-yellow dot at "now", dashed
// checkpoint marker. With fewer than 3 real entries there's no honest trend
// to project, so the band is simply omitted rather than faked.
export function UtrVsPlanChart({ actualPoints, nextCheckpoint, gender }: UtrVsPlanChartProps) {
  const sorted = [...actualPoints].sort((a, b) => a.date.getTime() - b.date.getTime());
  const now = sorted[sorted.length - 1] ?? { date: new Date(), utr: 0 };
  const start = sorted[0] ?? now;
  // A checkpoint at or before "now" isn't a future target worth drawing —
  // treat it the same as having none, rather than inverting the chart's
  // date axis.
  const validCheckpoint = nextCheckpoint && nextCheckpoint.date.getTime() > now.date.getTime() ? nextCheckpoint : null;
  const end = validCheckpoint ?? { date: new Date(now.date.getTime() + 180 * 86_400_000), utr: now.utr };

  const ceiling = REALISTIC_UTR_CEILING[gender];
  const projection = computeUtrProjection(sorted, { ceiling });

  const utrValues = [start.utr, now.utr, end.utr];
  if (projection) {
    utrValues.push(projection.upperBound(end.date), projection.lowerBound(end.date));
  }
  const utrMin = Math.min(...utrValues) - 0.4;
  const utrMax = Math.max(...utrValues) + 0.4;
  const dateMin = Math.min(start.date.getTime(), now.date.getTime());
  const dateMax = Math.max(end.date.getTime(), now.date.getTime() + 1);

  const W = 300;
  const H = 140;
  const padL = 10;
  const padR = 10;
  const padTop = 10;
  const baseline = 118;

  const x = (t: number) => padL + ((t - dateMin) / (dateMax - dateMin)) * (W - padL - padR);
  const y = (utr: number) => baseline - ((utr - utrMin) / (utrMax - utrMin)) * (baseline - padTop);

  const nowX = x(now.date.getTime());
  const nowY = y(now.utr);
  const endX = x(end.date.getTime());

  const linePoints = sorted.map((p) => `${x(p.date.getTime())},${y(p.utr)}`).join(" ");

  const bandPath = projection
    ? (() => {
        const steps = 12;
        const upper: string[] = [];
        const lower: string[] = [];
        for (let i = 0; i <= steps; i++) {
          const t = now.date.getTime() + (i / steps) * (end.date.getTime() - now.date.getTime());
          const d = new Date(t);
          upper.push(`${x(t)},${y(projection.upperBound(d))}`);
          lower.push(`${x(t)},${y(projection.lowerBound(d))}`);
        }
        return `M${upper.join(" L")} L${lower.reverse().join(" L")} Z`;
      })()
    : null;

  const label = (d: Date) => `${MONTH_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;

  return (
    <div>
      <svg
        role="img"
        aria-label={`UTR ${formatUTR(now.utr)} as of ${label(now.date)}${
          validCheckpoint ? `, next checkpoint ${formatUTR(validCheckpoint.utr)} by ${label(validCheckpoint.date)}` : ""
        }`}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
      >
        {bandPath && <path d={bandPath} fill="rgb(var(--c-primary-50))" />}
        {sorted.length > 1 && (
          <polyline points={linePoints} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="2.5" />
        )}
        {validCheckpoint && (
          <>
            <line
              x1={endX}
              y1={padTop}
              x2={endX}
              y2={baseline}
              stroke="rgb(var(--c-gold))"
              strokeDasharray="3 3"
            />
            <text
              x={Math.max(padL, Math.min(endX, W - 70))}
              y={padTop + 10}
              fontSize="11"
              fill="rgb(var(--c-gold))"
              fontFamily="Inter"
            >
              {label(end.date)} · {formatUTR(end.utr)}
            </text>
          </>
        )}
        <circle cx={nowX} cy={nowY} r="6" fill="rgb(var(--c-lime))" stroke="rgb(var(--c-ink))" strokeWidth="2" />
        <text x={padL} y={H - 4} fontSize="11" fill="rgb(var(--c-stone))" fontFamily="Inter">
          {label(start.date)}
        </text>
        <text x={W - 36} y={H - 4} fontSize="11" fill="rgb(var(--c-stone))" fontFamily="Inter">
          {label(end.date)}
        </text>
      </svg>
      <p className="mt-1.5 text-[13px] text-stone">
        {projection
          ? "Green band = projected range if your recent pace continues."
          : "Log a few more UTR results to unlock a projected range."}
        {validCheckpoint && ` Next checkpoint: ${formatUTR(validCheckpoint.utr)} by ${label(validCheckpoint.date)}.`}
      </p>
    </div>
  );
}
