import { cn } from "@/lib/utils";

interface Ball {
  top: string;
  left?: string;
  right?: string;
  size: number;
  delay: string;
  duration: string;
  opacity: number;
}

// Restrained, slow-floating tennis balls — ambient motion that stays premium.
const BALLS: Ball[] = [
  { top: "14%", left: "6%", size: 34, delay: "0s", duration: "9s", opacity: 0.5 },
  { top: "62%", left: "3%", size: 22, delay: "1.4s", duration: "11s", opacity: 0.4 },
  { top: "30%", right: "8%", size: 16, delay: "0.8s", duration: "8s", opacity: 0.35 },
  { top: "76%", right: "12%", size: 28, delay: "2.1s", duration: "12s", opacity: 0.45 },
  { top: "8%", right: "26%", size: 12, delay: "1.1s", duration: "10s", opacity: 0.3 },
];

function TennisBall({ size, opacity }: { size: number; opacity: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      style={{ opacity }}
      aria-hidden
    >
      <circle cx="20" cy="20" r="19" fill="rgb(var(--c-tennis))" />
      <path
        d="M5 7 C13 14 13 26 5 33"
        stroke="rgb(var(--c-card))"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M35 7 C27 14 27 26 35 33"
        stroke="rgb(var(--c-card))"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

export function TennisBalls({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {BALLS.map((b, i) => (
        <span
          key={i}
          className="absolute animate-float"
          style={{
            top: b.top,
            left: b.left,
            right: b.right,
            animationDelay: b.delay,
            animationDuration: b.duration,
          }}
        >
          <TennisBall size={b.size} opacity={b.opacity} />
        </span>
      ))}
    </div>
  );
}
