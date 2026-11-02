"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BentoGridProps {
  children: ReactNode;
  className?: string;
}

// The layout primitive that makes a Premium page actually read as a
// different composition, not just a reskinned version of Legacy's fixed
// sidebar+content grid: an auto-flowing 12-col grid whose cells opt into a
// column/row span. Legacy has no equivalent — this is Premium-only.
export function BentoGrid({ children, className }: BentoGridProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-6 lg:grid-cols-12", className)}>
      {children}
    </div>
  );
}

interface BentoCellProps {
  children: ReactNode;
  /** Column span out of the 12-col track at lg (and 6-col at sm); full-width on mobile. */
  span?: 3 | 4 | 6 | 8 | 12;
  rowSpan?: 1 | 2;
  className?: string;
}

const SPAN_CLASS: Record<NonNullable<BentoCellProps["span"]>, string> = {
  3: "sm:col-span-3 lg:col-span-3",
  4: "sm:col-span-3 lg:col-span-4",
  6: "sm:col-span-6 lg:col-span-6",
  8: "sm:col-span-6 lg:col-span-8",
  12: "sm:col-span-6 lg:col-span-12",
};

const ROW_SPAN_CLASS: Record<NonNullable<BentoCellProps["rowSpan"]>, string> = {
  1: "",
  2: "lg:row-span-2",
};

export function BentoCell({ children, span = 4, rowSpan = 1, className }: BentoCellProps) {
  return (
    <div className={cn(SPAN_CLASS[span], ROW_SPAN_CLASS[rowSpan], className)}>{children}</div>
  );
}
