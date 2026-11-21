"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { useDialog } from "@/lib/hooks/use-dialog";
import { Portal } from "./portal";
import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}

// Reusable right-side panel that slides in/out via Framer Motion.
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  widthClass = "max-w-md",
}: DrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useDialog(open, onClose, panelRef);
  return (
    <Portal>
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            // Black in both themes: `bg-ink/30` is a light grey in dark mode,
            // where ink is the light text colour.
            className="fixed inset-0 z-50 bg-black/40"
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : eyebrow ?? "Panel"}
            tabIndex={-1}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-cream shadow-lift focus:outline-none",
              widthClass
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:p-6">
              <div>
                {eyebrow && (
                  // Plain small label. It was an orange italic serif (the
                  // deleted Legacy design's eyebrow) until sweep C17.
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone">
                    {eyebrow}
                  </p>
                )}
                {title && (
                  <h2 id={titleId} className="text-xl font-semibold text-ink">{title}</h2>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-transparent text-stone transition-colors hover:border-line hover:bg-grass-50 hover:text-ink"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:p-6">{children}</div>
            {footer && (
              <div className="border-t border-line px-5 py-4 sm:p-6">{footer}</div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
    </Portal>
  );
}
