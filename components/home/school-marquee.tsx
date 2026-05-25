"use client";

import { motion } from "framer-motion";
import type { School } from "@/lib/types";
import { SchoolBadge } from "@/components/shared/school-badge";

export function SchoolMarquee({ schools }: { schools: School[] }) {
  const track = [...schools, ...schools];
  return (
    <div className="relative overflow-hidden py-2">
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-cream to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-cream to-transparent" />
      <motion.div
        className="flex w-max gap-3"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 38, ease: "linear", repeat: Infinity }}
      >
        {track.map((s, i) => (
          <div
            key={`${s.id}-${i}`}
            className="flex shrink-0 items-center gap-3 rounded-pill border-[0.5px] border-line bg-card px-4 py-2.5 shadow-soft"
          >
            <SchoolBadge school={s} size={32} />
            <div className="pr-1">
              <p className="text-sm font-medium leading-tight text-ink">
                {s.shortName}
              </p>
              <p className="text-[11px] leading-tight text-stone-light">
                {s.conference}
              </p>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
