import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Design polish round 1 (Figma 03 Pill): one pill for status and tags, in the
// palette's existing tints. Rule from the Figma: at most two pills per row —
// anything more becomes an icon or plain text.

export type PillTone = "neutral" | "green" | "clay" | "sage" | "gold";

const TONE: Record<PillTone, string> = {
  neutral: "border-line bg-card text-stone",
  green: "border-grass-100 bg-grass-50 text-grass-700",
  clay: "border-[rgb(var(--c-clay-tint-border))] bg-[rgb(var(--c-clay-tint-bg))] text-[rgb(var(--c-clay-tint-text))]",
  sage: "border-[rgb(var(--c-sage-tint-border))] bg-[rgb(var(--c-sage-tint-bg))] text-[rgb(var(--c-sage-tint-text))]",
  gold: "border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]",
};

export function Pill({
  tone = "neutral",
  icon,
  className,
  children,
}: {
  tone?: PillTone;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
        TONE[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}
