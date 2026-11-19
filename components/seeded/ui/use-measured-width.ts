"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The rendered width of an element, in CSS pixels.
 *
 * The charts draw in a viewBox exactly this wide, so 1 unit = 1px and a
 * 12px label stays 12px. They used a fixed 900-wide viewBox scaled to the
 * column, which at 320px shrank every label to ~4px and pushed the end
 * labels off the edge ("Jun '2" on /today — C21). Height is fixed by the
 * caller, so a resize never shifts the page.
 */
export function useMeasuredWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}
