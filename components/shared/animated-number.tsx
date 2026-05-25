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
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let settle = 0;
    let started = false;

    const run = () => {
      if (started) return;
      started = true;

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
        setDisplay(value * easeOutCubic(progress));
        if (progress < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      // Safety net: if rAF stalls mid-flight (e.g. tab backgrounded), ensure the
      // final value still lands.
      settle = window.setTimeout(() => setDisplay(value), duration + 250);
    };

    // Fires an initial callback with the current state, so elements already in
    // view animate immediately.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);

    // Fallback if the observer never reports (route transitions, odd timing).
    const fallback = window.setTimeout(() => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) run();
    }, 250);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      clearTimeout(fallback);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
