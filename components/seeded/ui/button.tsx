import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Pixel-exact to DesignSystem.dc.html's ".btn" + variant classes: inline-flex,
// gap 8px, min-height 44px, padding 0 18px, radius 8px, 15px/600 Inter.
export const seededButtonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-transparent px-[18px] font-sans text-[15px] font-semibold transition-colors duration-150 focus-visible:outline-none disabled:pointer-events-none disabled:border-transparent disabled:bg-line disabled:text-stone-light",
  {
    variants: {
      variant: {
        primary: "bg-grass text-on-primary hover:bg-grass-600",
        secondary:
          "border-input bg-card text-ink hover:bg-subtle-hover",
        ghost: "text-grass hover:bg-grass-50",
      },
    },
    defaultVariants: { variant: "primary" },
  }
);

export interface SeededButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof seededButtonVariants> {
  loading?: boolean;
}

// Focus ring matches the mockup's Focus state exactly: 2px solid ball-yellow
// outline, 2px offset — done as a focus-visible outline (not a Tailwind ring
// utility) so it never clips inside a scroll container.
export const SeededButton = forwardRef<HTMLButtonElement, SeededButtonProps>(
  ({ className, variant, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        seededButtonVariants({ variant }),
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-accent",
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
      {children}
    </button>
  )
);
SeededButton.displayName = "SeededButton";
