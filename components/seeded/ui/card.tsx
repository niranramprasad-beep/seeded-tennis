import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Design polish round 1 (Figma "WD — NiranRamprasad — Seeded", 03 Card): one
// card for the whole app — 14px radius (`rounded-card`), 1px line border,
// card fill. Existing screens were moved onto `rounded-card` in place; new
// code uses this component instead of hand-rolling the classes again.

export const seededCardClass = "rounded-card border border-line bg-card";

export function SeededCard({
  padding = "md",
  interactive = false,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  padding?: "none" | "sm" | "md";
  /** Hover lift for cards that are themselves a link or button target. */
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        seededCardClass,
        padding === "sm" && "p-5",
        padding === "md" && "p-6",
        interactive &&
          "motion-safe:transition-[transform,box-shadow] motion-safe:duration-150 motion-safe:hover:-translate-y-0.5 hover:shadow-lift",
        className
      )}
      {...rest}
    />
  );
}
