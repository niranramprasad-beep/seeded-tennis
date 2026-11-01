import { cn } from "@/lib/utils";

// A baseline-and-sideline mark, not a generic divider — the hero's one
// signature graphic. Reads as a tennis court's service line: a long
// center rule with tick marks at both ends and the midpoint, the way a
// court's own markings would meet a baseline. Inherits color from
// `text-*` so it can sit in grass green on light themes or dim to the
// line color in Night Match.
export function CourtRule({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 10"
      preserveAspectRatio="none"
      className={cn("h-2.5 w-full text-grass", className)}
      aria-hidden
    >
      <line x1="0" y1="5" x2="320" y2="5" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <line x1="0.5" y1="0" x2="0.5" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <line x1="160" y1="2" x2="160" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <line x1="319.5" y1="0" x2="319.5" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.7" />
    </svg>
  );
}
