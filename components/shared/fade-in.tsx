import type { HTMLAttributes } from "react";

interface FadeInProps extends HTMLAttributes<HTMLDivElement> {
  /** Kept so existing call sites compile; no longer drives any animation. */
  delay?: number;
}

// Was a framer-motion opacity fade on first view, which server-rendered the
// content at opacity 0 until hydration. Now a plain <div>: readable at first
// paint on any connection (see components/shared/reveal.tsx).
export function FadeIn({ children, delay: _delay, className, ...props }: FadeInProps) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}
