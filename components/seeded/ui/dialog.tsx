"use client";

import { useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useDialog } from "@/lib/hooks/use-dialog";
import { SeededButton } from "./button";
import { Portal } from "@/components/ui/portal";

// The one Seeded modal. Every confirm and every small form uses it; nothing
// in the app calls window.confirm/alert/prompt (lib/no-native-dialogs.test.ts),
// which froze the page and could not be styled or undone.
//
// The scrim is black in both themes on purpose: `bg-ink/50` is a light grey
// in dark mode (ink is the light text colour there), which is what the
// ⌘K palette's backdrop looked like.
//
// Phone: the panel is full width minus a 16px gutter, never taller than the
// screen, and scrolls inside itself rather than pushing its buttons off the
// bottom.
export function SeededDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeOnEscape = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** The action row. One primary button at most (design system v2 rule 1). */
  footer?: ReactNode;
  closeOnEscape?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(open, onClose, panelRef, { closeOnEscape });
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
            className="fixed inset-0 z-[100] bg-black/50"
          />
          <div className="pointer-events-none fixed inset-x-0 top-[8vh] z-[101] flex justify-center px-4 sm:top-[12vh]">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16 }}
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="pointer-events-auto flex max-h-[84vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-line bg-card shadow-card focus:outline-none"
            >
              <div className="flex items-start justify-between gap-3 px-5 pt-5">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-lg font-semibold text-ink">
                    {title}
                  </h2>
                  {description && <p className="mt-1 text-sm text-stone">{description}</p>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone transition-colors hover:bg-subtle-hover hover:text-ink"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4">{children}</div>}
              {footer && (
                <div className="flex flex-wrap items-center justify-end gap-2 px-5 pb-5 pt-5">{footer}</div>
              )}
              {!footer && <div className="pb-5" />}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
    </Portal>
  );
}

/** "Delete this?" — the replacement for window.confirm. The confirming
 * action is a secondary button in the error colour, not a green one: a
 * destructive action is not the screen's main thing to do. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <SeededDialog
      open={open}
      onClose={busy ? () => undefined : onCancel}
      closeOnEscape={!busy}
      title={title}
      description={description}
      footer={
        <>
          <SeededButton variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </SeededButton>
          <SeededButton
            variant="secondary"
            onClick={onConfirm}
            loading={busy}
            className="border-error text-error hover:bg-error-bg"
          >
            {confirmLabel}
          </SeededButton>
        </>
      }
    />
  );
}
