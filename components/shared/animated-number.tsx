"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 1400,
  prefix = "",
  suffix = "",
  className,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Starting every mount at 0 meant the headline stat (e.g. dashboard's
  // "Current UTR") ticked up from zero on every page load/reload — a
  // screenshot or quick glance mid-climb showed an arbitrary wrong-looking
  // number, which read as the data itself being unreliable. Showing the
  // real value immediately on mount fixes that; the climb is reserved for
  // genuine value changes while the component stays mounted.
  const [display, setDisplay] = useState(value);
  const previousValue = useRef(value);
  const hasMounted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!hasMounted.current) {
      hasMounted.current = true;
      previousValue.current = value;
      setDisplay(value);
      return;
    }
    if (previousValue.current === value) return;

    const startValue = previousValue.current;
    previousValue.current = value;

    let raf = 0;
    let settle = 0;

    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // If we can't smoothly animate (hidden tab, reduced motion), jump to final.
    if (document.hidden || reduce) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setDisplay(startValue + (value - startValue) * easeOutCubic(progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Safety net: if rAF stalls mid-flight (e.g. tab backgrounded), ensure the
    // final value still lands.
    settle = window.setTimeout(() => setDisplay(value), duration + 250);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={`stat-number ${className ?? ""}`}>
      {prefix}
      {display.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
