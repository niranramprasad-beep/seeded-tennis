import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill font-medium leading-none transition-all duration-200 hover:scale-105 hover:brightness-110",
  {
    variants: {
      variant: {
        default: "bg-grass-50 text-grass",
        leaf: "bg-leaf-accent/40 text-grass-900",
        lime: "bg-lime-accent/50 text-grass-900",
        outline: "border-[0.5px] border-line text-stone",
        // "ink" contrasts against --c-ink, not --c-primary, so it needs the
        // page-background color (always opposite-contrast to ink by
        // construction in every theme) rather than text-on-primary.
        ink: "bg-ink text-cream",
        muted: "bg-cream text-stone-light border-[0.5px] border-line",
      },
      size: {
        sm: "px-2.5 py-1 text-[11px]",
        md: "px-3 py-1.5 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "sm" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}
