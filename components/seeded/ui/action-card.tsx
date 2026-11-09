"use client";

import { useEffect, useRef, useState } from "react";
import { SeededButton } from "@/components/seeded/ui/button";

interface ActionCardProps {
  title: string;
  description: string;
  /** e.g. "5 min" */
  estimate?: string;
  actionLabel?: string;
  doneLabel: string;
  onAction: () => void;
}

const UNDO_WINDOW_MS = 5000;

// Pixel-exact to DesignSystem.dc.html's "Action card": default row (title +
// description, time estimate, primary "Do it" button) and a done row
// (checkmark label + ghost "Undo"), with a 5-second undo window before the
// action is permanent.
export function ActionCard({
  title,
  description,
  estimate,
  actionLabel = "Do it",
  doneLabel,
  onAction,
}: ActionCardProps) {
  const [done, setDone] = useState(false);
  const [undoable, setUndoable] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const complete = () => {
    setDone(true);
    setUndoable(true);
    onAction();
    timeoutRef.current = setTimeout(() => setUndoable(false), UNDO_WINDOW_MS);
  };

  const undo = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setDone(false);
    setUndoable(false);
  };

  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-[10px] border border-line bg-panel px-3.5 py-3 text-sm text-stone">
        <span className="flex-1">✓ Done · {doneLabel}</span>
        {undoable && (
          <SeededButton
            variant="ghost"
            className="min-h-8 px-2 text-sm"
            onClick={undo}
          >
            Undo
          </SeededButton>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-line p-3.5">
      <div className="flex-1">
        <strong className="text-ink">{title}</strong>
        <div className="text-sm text-stone">{description}</div>
      </div>
      {estimate && <span className="text-[13px] text-stone">{estimate}</span>}
      <SeededButton className="min-h-[38px]" onClick={complete}>
        {actionLabel}
      </SeededButton>
    </div>
  );
}
