"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number; // 0 - 100
  className?: string;
  barClassName?: string;
}

export function Progress({ value, className, barClassName }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "h-2.5 w-full overflow-hidden rounded-pill bg-grass-50",
        className
      )}
    >
      <motion.div
        className={cn(
          "h-full rounded-pill bg-gradient-to-r from-leaf-accent to-grass",
          barClassName
        )}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
