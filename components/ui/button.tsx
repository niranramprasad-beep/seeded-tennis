import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap select-none transition-[transform,background-color,color,box-shadow,border-color] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grass/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "bg-grass text-on-primary shadow-soft hover:bg-grass-600 hover:shadow-[0_12px_28px_rgba(21,128,61,0.22)]",
        outline:
          "border-[1.5px] border-line text-ink hover:border-grass/50 hover:bg-grass-50 hover:shadow-soft",
        dark: "bg-ink text-on-primary hover:bg-ink/90",
        leaf: "bg-leaf-accent text-on-primary hover:brightness-105 shadow-soft hover:shadow-[0_12px_28px_rgba(34,197,94,0.22)]",
        ghost: "text-ink hover:bg-grass-50",
        subtle: "bg-grass-50 text-grass-700 hover:bg-grass-100",
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
