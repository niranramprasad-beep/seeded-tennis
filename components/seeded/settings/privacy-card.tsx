"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/time";
import { DeleteAccountDialog } from "./delete-account-dialog";

export function PrivacyCard({
  onDownload,
  downloading,
  deletionRequestedAt,
  onRequestDeletion,
  onCancelDeletion,
  deletingBusy,
  deletionError,
}: {
  onDownload: () => void;
  downloading: boolean;
  deletionRequestedAt: string | null | undefined;
  onRequestDeletion: () => void;
  onCancelDeletion: () => void;
  deletingBusy: boolean;
  /** Specific server-side error from app/api/account/deletion (e.g. a real
   * write failure) — null/undefined means no error, never a generic
   * fallback string here, so the request/cancel buttons stay honest about
   * whether the last attempt actually worked. */
  deletionError?: string | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const confirmDelete = () => {
    onRequestDeletion();
    setDialogOpen(false);
  };

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <h2 className="border-b border-line pb-4 text-lg font-semibold text-ink">Privacy + data</h2>

      <div className="divide-y divide-line">
        {/* P0-7: the "Public recruiting page" toggle lived here. It claimed
            "coaches you email can see your results and video. A parent must
            approve." None of that exists — there is no public page, no video
            storage and no parental approval flow. The toggle wrote a real
            `privacy_level` column, so a player could believe they had turned
            on sharing that was never happening (or, worse, believe they had
            turned it off). Hidden until the feature is real; the column and
            lib/db/settings.ts plumbing are left intact. POST-V1. */}
        <div className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="font-semibold text-ink">Download my data</p>
            <p className="mt-0.5 text-sm text-stone">Schools, results, notes and outreach as a spreadsheet.</p>
          </div>
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-input bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? "Preparing…" : "Download"}
          </button>
        </div>

        <div className="flex items-start justify-between gap-4 py-4">
          {/* P0-7: this promised "Removes everything within 30 days". Nothing
              deletes anything — requesting sets `profiles.deletion_requested_at`
              and that is the entire mechanism. A person has to action it by
              hand. Describe what actually happens until a real deletion job
              exists (P0-8). */}
          <div className="min-w-0">
            <p className="font-semibold text-ink">Delete account</p>
            {deletionRequestedAt ? (
              <p className="mt-0.5 text-sm text-stone">
                Deletion requested {formatDate(new Date(deletionRequestedAt))}. Your data is
                still here until it&apos;s actioned — you can cancel until then.
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-stone">
                Sends a deletion request. Nothing is removed automatically — a person completes
                it by hand. You can cancel the request until then.
              </p>
            )}
          </div>
          {deletionRequestedAt ? (
            <button
              type="button"
              onClick={onCancelDeletion}
              disabled={deletingBusy}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-input bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-error/50 bg-card px-[18px] text-[15px] font-semibold text-error transition-colors hover:bg-error-bg"
            >
              Delete account
            </button>
          )}
        </div>
        {deletionError && <p className="py-2 text-sm text-error">{deletionError}</p>}
      </div>

      <p className="mt-4 text-sm text-stone">
        We never sell player data.{" "}
        <Link href="/terms#privacy" className="text-grass underline underline-offset-2">
          Privacy policy (incl. minors)
        </Link>
      </p>

      <DeleteAccountDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={confirmDelete}
        submitting={deletingBusy}
      />
    </div>
  );
}
