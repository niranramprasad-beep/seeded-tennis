"use client";

import { motion } from "framer-motion";

// Re-mounts on every route change for an intentional slide-in transition.
//
// Deliberately no `filter` animation here (even a blur that settles at
// "blur(0px)") — Framer Motion leaves the literal filter value applied at
// rest instead of clearing it to "none", and any non-"none" `filter` on an
// ancestor creates a new containing block for `position: fixed` descendants.
// That silently broke every Drawer in the app (fixed panels were positioned
// against this wrapper instead of the viewport, pushing footer buttons like
// "Create plan" off-screen and unclickable).
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 22 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
