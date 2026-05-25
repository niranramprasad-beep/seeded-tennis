"use client";

import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AnimatedNumber } from "./animated-number";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  hint?: string;
  icon?: LucideIcon;
  accent?: "grass" | "leaf" | "tennis";
  className?: string;
}

const ACCENT: Record<string, string> = {
  grass: "bg-grass text-cream",
  leaf: "bg-leaf-accent text-grass-900",
  tennis: "bg-tennis text-grass-900",
};

export function StatCard({
  label,
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  hint,
  icon: Icon,
  accent = "grass",
  className,
}: StatCardProps) {
  return (
    <Card interactive className={cn("p-6", className)}>
      <div className="flex items-start justify-between">
        <p className="text-sm text-stone">{label}</p>
        {Icon && (
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full",
              ACCENT[accent]
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-3 text-4xl font-light tracking-tight text-ink">
        <AnimatedNumber
          value={value}
          decimals={decimals}
          prefix={prefix}
          suffix={suffix}
        />
      </div>
      {hint && <p className="mt-1.5 text-xs text-stone-light">{hint}</p>}
    </Card>
  );
}
