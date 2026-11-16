"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  open: boolean;
  onDismiss: () => void;
  children: string;
  variant?: ToastVariant;
  /** ms before auto-dismiss; pass 0 to disable. */
  duration?: number;
  /** Optional inline action button (e.g. "Undo") rendered before the
   * dismiss ×. Clicking it fires both the action and onDismiss. */
  action?: ToastAction;
}

const ICON: Record<ToastVariant, typeof CheckCircle2 | null> = {
  default: null,
  success: CheckCircle2,
  error: AlertCircle,
};

const VARIANT_CLASS: Record<ToastVariant, string> = {
  default: "text-ink",
  success: "text-grass",
  error: "text-error",
};

// Generic toast — no exact mockup spec exists (static pages don't show
// ephemeral UI). Card surface, shadow-card, auto-dismiss, respects
// prefers-reduced-motion.
export function Toast({ open, onDismiss, children, variant = "default", duration = 4000, action }: ToastProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open || duration === 0) return;
    const id = setTimeout(onDismiss, duration);
    return () => clearTimeout(id);
  }, [open, duration, onDismiss]);

  const Icon = ICON[variant];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="status"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-x-0 bottom-6 z-[200] mx-auto flex w-fit max-w-[90vw] items-center gap-2.5 rounded-[10px] border border-line bg-card px-4 py-3 text-sm shadow-card"
        >
          {Icon && <Icon className={cn("h-4 w-4 shrink-0", VARIANT_CLASS[variant])} aria-hidden />}
          <span className="text-ink">{children}</span>
          {action && (
            <button
              onClick={() => {
                action.onClick();
                onDismiss();
              }}
              className="shrink-0 whitespace-nowrap text-sm font-semibold text-grass hover:underline"
            >
              {action.label}
            </button>
          )}
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="ml-1 shrink-0 text-stone-light transition-colors hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
