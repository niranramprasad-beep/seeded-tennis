import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none transition-[transform,background-color,color,box-shadow,border-color] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grass/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-r from-grass via-[#1F6F5B] to-[#1A5FB8] text-cream shadow-soft hover:shadow-[0_18px_48px_rgba(46,164,214,0.28),0_16px_44px_rgba(31,31,26,0.16)]",
        outline:
          "border-[1.5px] border-grass/30 text-grass hover:border-[#1A8FC7] hover:bg-[#EAF7F8] hover:text-[#0E526A] hover:shadow-[0_14px_34px_rgba(26,143,199,0.16)]",
        dark: "bg-ink text-cream hover:bg-ink/90",
        leaf: "bg-gradient-to-r from-leaf-accent to-tennis text-grass-900 hover:brightness-105 shadow-soft hover:shadow-[0_16px_40px_rgba(216,232,74,0.3)]",
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
