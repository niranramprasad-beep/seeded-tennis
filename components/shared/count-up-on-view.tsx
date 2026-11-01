"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "./animated-number";

interface CountUpOnViewProps {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

// AnimatedNumber only animates a VALUE CHANGE after mount (by design — see
// its own comment on why it shows the real number immediately rather than
// always starting at 0). This wrapper supplies that change: it holds the
// number at 0 until the element first scrolls into view, then flips to the
// real value, which is what triggers AnimatedNumber's count-up. Plain
// IntersectionObserver rather than framer-motion's useInView/onViewportEnter
// — both were unreliable for a small inline span at a tight margin in
// testing (never fired), where a bare observer fires correctly.
export function CountUpOnView({ value, ...props }: CountUpOnViewProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || triggered) return;

    // Covers the "already on screen at load" case synchronously — hydration
    // runs regardless of the page's paint/compositor state, unlike the
    // IntersectionObserver callback below, which is scheduled on a render
    // tick and won't fire promptly on an occluded/backgrounded tab.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setTriggered(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTriggered(true);
          observer.disconnect();
        }
      },
      { rootMargin: "-60px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [triggered]);

  return (
    <span ref={ref} className="inline-block">
      <AnimatedNumber value={triggered ? value : 0} {...props} />
    </span>
  );
}
