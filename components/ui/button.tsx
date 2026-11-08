import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  // border-[1.5px] border-transparent at rest, on every variant, so the
  // hover border below is only ever a color change — never a width change,
  // which would shift layout the instant the mouse arrives.
  "inline-flex items-center justify-center gap-2 border-[1.5px] border-transparent font-semibold whitespace-nowrap select-none transition-[color,background-color,border-color,transform,box-shadow] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grass/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-grass text-on-primary hover:bg-grass-600 hover:border-on-primary/25 hover:shadow-glow hover:-translate-y-0.5",
        outline: "border-line text-ink hover:border-grass/50 hover:bg-grass-50",
        dark: "bg-ink text-on-primary hover:bg-ink/90 hover:border-on-primary/20",
        leaf: "bg-leaf-accent text-on-primary hover:brightness-105 hover:border-on-primary/25",
        ghost: "text-ink hover:border-line hover:bg-grass-50",
        subtle: "bg-grass-50 text-grass-700 hover:border-grass/30 hover:bg-grass-100",
      },
      size: {
        // 44px (the mobile touch-target floor) below the `sm:` breakpoint,
        // stepping down to the compact 36px it was designed at from there —
        // desktop is mouse-driven and doesn't need the thumb-sized hit area.
        sm: "h-11 px-4 text-sm rounded-pill sm:h-9",
        md: "h-11 px-6 text-sm rounded-pill",
        lg: "h-[52px] px-8 text-base rounded-pill",
        icon: "h-11 w-11 rounded-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";
