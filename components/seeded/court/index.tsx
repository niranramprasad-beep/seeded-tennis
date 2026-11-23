export interface CourtArtProps {
  className?: string;
}

/** Near half of a regulation court, at 16 units per foot: doubles 36 ft,
 * singles 27 ft, baseline 39 ft from the net, service line 21 ft from it.
 * The opposing half continues beyond the top of this baseline-facing crop. */
export function CourtBackdrop({ className }: CourtArtProps): JSX.Element {
  return (
    <svg
      className={className}
      width="100%"
      height="100%"
      viewBox="0 0 1440 720"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
      style={{ pointerEvents: "none" }}
    >
      <path d="M432 48V672H1008V48" vectorEffect="non-scaling-stroke" />
      <line x1="504" y1="48" x2="504" y2="672" vectorEffect="non-scaling-stroke" />
      <line x1="936" y1="48" x2="936" y2="672" vectorEffect="non-scaling-stroke" />
      <line x1="504" y1="384" x2="936" y2="384" vectorEffect="non-scaling-stroke" />
      <line x1="720" y1="48" x2="720" y2="384" vectorEffect="non-scaling-stroke" />
      <line x1="720" y1="664" x2="720" y2="672" vectorEffect="non-scaling-stroke" />
      <line x1="416" y1="48" x2="1024" y2="48" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A baseline, its six-inch centre mark and one service-box corner.
 * Uses the backdrop's 16-units-per-foot scale; service line to baseline is 18 ft. */
export function CourtCorner({ className }: CourtArtProps): JSX.Element {
  return (
    <svg
      className={className}
      width="100%"
      height="100%"
      viewBox="0 0 1440 480"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
      style={{ pointerEvents: "none" }}
    >
      <line x1="432" y1="432" x2="1008" y2="432" vectorEffect="non-scaling-stroke" />
      <line x1="720" y1="424" x2="720" y2="432" vectorEffect="non-scaling-stroke" />
      <path d="M720 144H936V24" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A top tape and fine, individually drawn diagonal mesh, or a plain baseline. */
export function CourtDivider({
  className,
  variant = "net",
}: CourtArtProps & { variant?: "net" | "baseline" }): JSX.Element {
  return (
    <svg
      className={className}
      width="100%"
      height={48}
      viewBox="0 0 1440 48"
      preserveAspectRatio="none"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
      style={{ pointerEvents: "none" }}
    >
      {variant === "baseline" ? (
        <line x1="0" y1="24" x2="1440" y2="24" vectorEffect="non-scaling-stroke" />
      ) : (
        <>
          {Array.from({ length: 45 }, (_, i) => (
            <g key={i} strokeWidth={0.75}>
              <line x1={i * 32} y1="8" x2={(i + 1) * 32} y2="40" vectorEffect="non-scaling-stroke" />
              <line x1={i * 32} y1="40" x2={(i + 1) * 32} y2="8" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          <line x1="0" y1="40" x2="1440" y2="40" strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
          <line x1="0" y1="8" x2="1440" y2="8" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}

/** SeededMark's round ball and paired curved seams, sized for standalone art. */
export function TennisBall({
  className,
  size = 64,
}: CourtArtProps & { size?: number }): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="rgb(var(--c-ink))"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ pointerEvents: "none" }}
    >
      <circle cx="32" cy="32" r="28" fill="rgb(var(--c-lime))" vectorEffect="non-scaling-stroke" />
      <path d="M10 24C24 29 40 29 54 24M10 40C24 35 40 35 54 40" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
