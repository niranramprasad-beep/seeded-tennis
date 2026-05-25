"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  "aria-label"?: string;
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  className,
  ...rest
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn("seeded-range", className)}
      style={{
        background: `linear-gradient(to right, rgb(var(--c-leaf)) 0%, rgb(var(--c-leaf)) ${pct}%, rgb(var(--c-line)) ${pct}%, rgb(var(--c-line)) 100%)`,
      }}
      {...rest}
    />
  );
}
