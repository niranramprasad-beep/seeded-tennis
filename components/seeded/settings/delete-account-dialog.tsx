"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

const CONFIRM_WORD = "DELETE";

// The sensitive piece: this only ever calls `onConfirm`, which the caller
// wires to setting a `deletion_requested_at` timestamp — nothing here (or
// anywhere downstream of it) hard-deletes an auth user or any data row
// synchronously. The real 30-day purge is a separate operational job
// outside this app's scope. Getting to that point requires BOTH an
// explicit acknowledgment checkbox AND typing DELETE — never a single
// click — matching the mockup's own "Removes everything within 30 days.
// This can't be undone." copy.
export function DeleteAccountDialog({
  open,
  onClose,
  onConfirm,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const canConfirm = acknowledged && confirmText.trim().toUpperCase() === CONFIRM_WORD;

  const close = () => {
    setAcknowledged(false);
    setConfirmText("");
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
            className="fixed inset-0 z-[100] bg-ink/50"
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-[14vh] z-[101] w-full max-w-md -translate-x-1/2 overflow-hidden rounded-[18px] border border-line bg-card p-6 shadow-seeded-3"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
          >
            <h2 id="delete-account-title" className="text-lg font-semibold text-ink">
              Delete your account?
            </h2>
            <p className="mt-2 text-sm text-stone">
              This starts a 30-day grace period. During that time you can come back here and cancel
              at any point. After 30 days, your profile, results, UTR history, notes and outreach
              records are permanently removed — this can&apos;t be undone.
            </p>

            <label className="mt-4 flex items-start gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
              />
              I understand this is permanent after 30 days.
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-stone">
                Type DELETE to confirm
              </span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-card px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-error/30"
                placeholder="DELETE"
                autoComplete="off"
              />
            </label>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={close}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!canConfirm || submitting}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center rounded-lg border border-error-solid bg-error-solid px-[18px] text-[15px] font-semibold text-white transition-colors hover:bg-error-solid-hover",
                  "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-line disabled:text-stone-light"
                )}
              >
                {submitting ? "Starting…" : "Start 30-day deletion"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
