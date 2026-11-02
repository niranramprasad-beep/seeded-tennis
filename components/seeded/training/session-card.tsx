"use client";

import { Check, Clock, GripVertical } from "lucide-react";
import { motion } from "framer-motion";
import type { SessionCardProps } from "@/components/training/training-view";
import { cn } from "@/lib/utils";

export function SeededSessionCard({ session, type, onEdit, onDrag, onToggle }: SessionCardProps) {
  return (
    <motion.article
      layout
      draggable
      onDragStart={() => onDrag(session.id)}
      onDragEnd={() => onDrag(null)}
      whileHover={{ y: -2 }}
      className={cn(
        "seeded-glass group rounded-[22px] p-5 shadow-seeded-1 transition-shadow",
        session.completed && "opacity-70"
      )}
      style={{ borderLeft: `3px solid ${type.color}` }}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(session.id)}
          className="group/toggle -m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          aria-label={session.completed ? "Mark session incomplete" : "Mark session complete"}
        >
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
              session.completed
                ? "border-transparent text-on-primary"
                : "border-[rgb(var(--c-line))] text-stone-light group-hover/toggle:border-grass"
            )}
            style={session.completed ? { background: "var(--s-accent-gradient)" } : undefined}
          >
            {session.completed && <Check className="h-3.5 w-3.5" />}
          </span>
        </button>
        <button onClick={() => onEdit(session)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-pill px-2.5 py-1 font-seeded text-xs font-medium", type.bg, type.text)}>
              {type.label}
            </span>
            <span className="flex items-center gap-1 font-mono text-xs text-stone-light">
              <Clock className="h-3 w-3" />
              {session.startTime} · {session.duration}m
            </span>
          </div>
          <h3
            className={cn(
              "mt-4 font-seeded text-base font-medium leading-snug text-ink",
              session.completed && "line-through decoration-grass/40"
            )}
          >
            {session.title}
          </h3>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-stone">
            {session.goals || session.notes}
          </p>
        </button>
        <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-stone-light opacity-50 transition-opacity group-hover:opacity-100" />
      </div>
    </motion.article>
  );
}
