import type { HTMLAttributes } from "react";

interface RevealProps extends HTMLAttributes<HTMLDivElement> {
  /** Kept so existing call sites compile; no longer drives any animation. */
  index?: number;
  step?: number;
}

// Used to be a framer-motion fade-and-rise (`initial={{ opacity: 0 }}` +
// `whileInView`). The server HTML therefore painted every wrapped section at
// opacity 0, and on a slow phone the page sat greyed-out or blank until the
// JS bundle hydrated and the observer fired — measured on / and /pricing at
// 375px with 4x CPU and Slow-4G (2026-11-20, PR-POLISH). Content now paints
// at full opacity on first paint; this is a plain <div> so nothing waits on
// JavaScript to become readable. Click-triggered motion (dialogs, drawers,
// menus) is unaffected — it lives in those components.
//
// 22 Nov 2026 (design polish round 1): the fade-up is back as pure CSS
// (`.seeded-reveal` in app/globals.css, a scroll-driven animation). It needs
// no JavaScript and does nothing where unsupported or under reduced motion,
// so first paint is still full opacity everywhere that matters.
export function Reveal({ children, index: _index, step: _step, className, ...props }: RevealProps) {
  return (
    <div className={className ? `seeded-reveal ${className}` : "seeded-reveal"} {...props}>
      {children}
    </div>
  );
}
