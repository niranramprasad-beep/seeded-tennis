"use client";

import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Max rotation in degrees. Kept small — this reads as "responsive surface," not a gimmick. */
  strength?: number;
}

// 3D cursor-tilt, the "cards lift and glow on hover" card-wall effect —
// rotateX/rotateY driven by pointer position within the element, spring-
// damped like Magnetic (components/shared/magnetic.tsx). Disabled under
// reduce-motion (flat, static).
export function TiltCard({ children, className, strength = 6 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 300, damping: 24 });
  const springY = useSpring(rotateY, { stiffness: 300, damping: 24 });

  const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * strength * 2);
    rotateX.set(py * -strength * 2);
  };

  const reset = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      className={cn("[perspective:1000px]", className)}
    >
      <motion.div
        style={{ rotateX: springX, rotateY: springY, transformStyle: "preserve-3d" }}
        className="h-full"
      >
        {children}
      </motion.div>
    </div>
  );
}
