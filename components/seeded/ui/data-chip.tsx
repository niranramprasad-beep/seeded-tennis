import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type DataChipStatus = "verified" | "updated" | "estimated" | "missing";

// Pixel-exact to DesignSystem.dc.html's ".chip" base + data-chip states.
const STATUS_CLASS: Record<DataChipStatus, string> = {
  verified: "bg-grass-50 text-grass border-grass-100",
  updated: "bg-card text-stone border-line",
  estimated: "bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))] border-[rgb(var(--c-gold-tint-border))]",
  missing: "bg-card text-stone border-line border-dashed",
};

export function DataChip({
  status,
  children,
  className,
}: {
  status: DataChipStatus;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
        STATUS_CLASS[status],
        className
      )}
    >
      {status === "verified" && <Check className="h-3 w-3" aria-hidden />}
      {children}
    </span>
  );
}
