"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

const CONFIRM_WORD = "DELETE";

// P0-8. `onConfirm` now runs a real, immediate, irreversible deletion
// (public.delete_my_account(), migration 029) — every row keyed on the
// account and the auth user with it. Two earlier versions of this copy are
// worth remembering, because the shape of the lie changed each time:
//
//   before P0-7  "After 30 days, your profile, results, UTR history, notes
//                and outreach records are permanently removed" — described a
//                purge job that did not exist.
//   after P0-7   "This sends a deletion request — it doesn't delete anything
//                on its own ... someone removes them by hand" — true at the
//                time, and a terrible thing to have to tell a 14-year-old.
//
// This version says what now happens: it deletes, now, and it cannot be
// undone. The two-step confirmation (checkbox AND typing DELETE) matters a
// great deal more than it did when the button only set a timestamp.
//
// There is no grace period and no "cancel" state, deliberately. A grace
// period that nothing enforces is the first version again, and a real one
// would mean keeping a minor's data after they asked us to stop.
export function DeleteAccountDialog({
  open,
  onClose,
  onConfirm,
  submitting,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  /** A real server-side failure. Shown inside the dialog rather than behind
   * it, because the dialog does not close on failure — the account is still
   * there and the person needs to know that, not be returned to a settings
   * page that looks unchanged. */
  error?: string | null;
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
              This deletes your account and everything in it right now: your profile, your
              UTR history, your results, your check-ins, your schools and your outreach
              records. It cannot be undone and there is no way to get it back.
            </p>
            <p className="mt-2 text-sm text-stone">
              If you share a family code, your family keeps their own accounts. The family
              itself is removed only if you are the last person in it.
            </p>
            <p className="mt-2 text-sm text-stone">
              Want a copy first? Close this and use <span className="font-medium text-ink">Download
              everything</span>.
            </p>

            <label className="mt-4 flex items-start gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
              />
              I understand this deletes everything immediately and cannot be undone.
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

            {error && <p className="mt-4 text-sm text-error">{error}</p>}

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
                {submitting ? "Deleting…" : "Delete everything"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
