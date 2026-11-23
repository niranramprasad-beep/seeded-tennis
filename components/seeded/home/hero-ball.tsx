"use client";

import { useEffect, useRef } from "react";
import { TennisBall } from "@/components/seeded/court";

// The landing hero's bouncing ball (design polish round 2, Figma 06 motion
// spec). Decorative: aria-hidden, never over text or a control (the caller
// places it in the court's empty lower band). All motion is CSS
// (`.seeded-ball-*` in app/globals.css) and is off under reduced motion; the
// only script here pauses the idle hop while the hero is off-screen, so a
// reader further down the page has nothing animating above them.
export function HeroBall({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) el.removeAttribute("data-paused");
      else el.setAttribute("data-paused", "");
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span ref={ref} aria-hidden="true" className={className}>
      <span className="seeded-ball-enter relative block h-10 w-10">
        <span className="seeded-ball-idle block h-10 w-10">
          <TennisBall size={40} className="h-10 w-10" />
        </span>
        {/* The ball's shadow on the court. */}
        <span className="absolute -bottom-2 left-1/2 block h-2 w-8 -translate-x-1/2">
          <span className="seeded-ball-shadow block h-2 w-8 rounded-[50%] bg-[rgb(var(--c-night))] opacity-35" />
        </span>
      </span>
    </span>
  );
}
