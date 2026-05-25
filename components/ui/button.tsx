import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none transition-[transform,background-color,color,box-shadow,border-color] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grass/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "bg-grass text-cream hover:bg-grass-600 shadow-soft hover:shadow-lift",
        outline:
          "border-[1.5px] border-grass/30 text-grass hover:border-grass hover:bg-grass-50",
        dark: "bg-ink text-cream hover:bg-ink/90",
        leaf: "bg-leaf-accent text-grass-900 hover:brightness-105 shadow-soft",
        ghost: "text-ink hover:bg-grass-50",
        subtle: "bg-grass-50 text-grass hover:bg-grass-100",
      },
      size: {
        sm: "h-9 px-4 text-sm rounded-pill",
        md: "h-11 px-6 text-sm rounded-pill",
        lg: "h-[52px] px-8 text-base rounded-pill",
        icon: "h-10 w-10 rounded-full",
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
