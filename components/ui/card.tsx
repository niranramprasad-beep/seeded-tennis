import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-card border border-line bg-card shadow-soft",
        interactive &&
          "transition-[border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:border-grass/30 hover:shadow-lift active:scale-[0.99]",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";
