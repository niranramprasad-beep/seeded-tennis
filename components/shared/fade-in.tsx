"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface FadeInProps extends HTMLMotionProps<"div"> {
  delay?: number;
}

// A plain, short opacity fade on first view — no slide distance, no long
// duration. Scroll-triggered "fly in" entrances read as decorative noise
// on a content page; this keeps just enough motion to avoid a hard pop-in.
export function FadeIn({ children, delay = 0, className, ...props }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.2, delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
