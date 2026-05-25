"use client";

import { motion } from "framer-motion";

// Re-mounts on every route change for an intentional slide-in transition.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 22, filter: "blur(2px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
