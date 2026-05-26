"use client";

import { motion, useScroll, useSpring } from "framer-motion";

// Thin reading-progress bar pinned to the top — a subtle premium cue that the
// page is one continuous, intentional scroll.
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.3,
  });

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-leaf-accent via-grass to-gold"
      aria-hidden
    />
  );
}
