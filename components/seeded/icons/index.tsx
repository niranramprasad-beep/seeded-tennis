export interface SeededIconProps {
  className?: string;
  /** When set, the svg gets role="img" and a <title>; otherwise aria-hidden. */
  title?: string;
}

/** The Seeded tennis-ball mark (same drawing as SeededLogo in nav.tsx),
 *  coloured with the palette's CSS variables. */
export function SeededMark({ className, title, size = 22 }: SeededIconProps & { size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgb(var(--c-ink))"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <g transform="translate(1 1)">
        <circle cx="11" cy="11" r="10" fill="rgb(var(--c-lime))" />
        {/* The seams sit on the lime ball, which is light in both modes, so
            they take the fixed on-lime ink; the ring stays --c-ink so it
            reads against the page in light and dark. (In dark mode the seams
            used to be light ink on lime and all but vanished.) */}
        <path d="M3 8c5 2 11 2 16 0M3 14c5-2 11-2 16 0" stroke="rgb(var(--c-on-lime))" />
      </g>
    </svg>
  );
}

export function RacketIcon({ className, title }: SeededIconProps) {
  return (
    <svg
      className={className}
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <g transform="rotate(40 14 8)">
        <ellipse cx="14" cy="8" rx="5" ry="6" />
        <path d="M12 3v10M16 3v10M9.5 6h9M9.5 10h9M12 13.5l1 3.5h2l1-3.5M13 17v5h2v-5" />
      </g>
    </svg>
  );
}

export function CourtIcon({ className, title }: SeededIconProps) {
  return (
    <svg
      className={className}
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <rect x="3" y="2" width="18" height="20" rx="1" />
      <path d="M6 2v20M18 2v20M2 12h20M6 7h12M6 17h12M12 7v10" />
    </svg>
  );
}

/** A tournament draw / bracket. */
export function DrawIcon({ className, title }: SeededIconProps) {
  return (
    <svg
      className={className}
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d="M3 3h5v6H3M3 15h5v6H3M8 6h7v12H8M15 12h6" />
    </svg>
  );
}
