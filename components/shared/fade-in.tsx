"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface FadeInProps extends HTMLMotionProps<"div"> {
  delay?: number;
  y?: number;
}

export function FadeIn({
  children,
  delay = 0,
  y = 18,
  className,
  ...props
}: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
