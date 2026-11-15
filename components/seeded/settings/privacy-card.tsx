"use client";

import { useState } from "react";
import Link from "next/link";
import { DeleteAccountDialog } from "./delete-account-dialog";

export function PrivacyCard({
  onDownloadEverything,
  onDownloadSpreadsheet,
  downloading,
  onDelete,
  deleting,
  deleteError,
  exportError,
}: {
  /** The complete record — every table, server-side. /api/account/export. */
  onDownloadEverything: () => void;
  /** The partial, human-readable spreadsheet (schools, results, notes,
   * outreach) built in the browser. Kept because it is the one people
   * actually open. */
  onDownloadSpreadsheet: () => void;
  downloading: "everything" | "spreadsheet" | null;
  onDelete: () => void;
  deleting: boolean;
  /** Specific server-side error from app/api/account/deletion. Rendered in
   * the dialog, not here, because the dialog stays open on failure. */
  deleteError?: string | null;
  /** A failed /api/account/export — a 429 from the rate limiter, or a real
   * server error. Shown next to the download rows, since that is where the
   * person just clicked. */
  exportError?: string | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <h2 className="border-b border-line pb-4 text-lg font-semibold text-ink">Privacy + data</h2>

      <div className="divide-y divide-line">
        {/* P0-7: the "Public recruiting page" toggle lived here. It claimed
            "coaches you email can see your results and video. A parent must
            approve." None of that exists — there is no public page, no video
            storage and no parental approval flow for one. P0-8/027 went
            further and removed the policy that made `privacy_level='public'`
            mean anything at all, so nothing about any user is visible to
            another signed-in user outside their own family. New accounts
            record 'private' (migration 030). POST-V1. */}

        {/* P0-8. Two downloads, because they answer two different questions
            and collapsing them would make one of them a lie. */}
        <div className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="font-semibold text-ink">Download everything</p>
            <p className="mt-0.5 text-sm text-stone">
              Every row Seeded stores about your account, as a JSON file. Includes your
              family&apos;s season budget; does not include other people&apos;s results.
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadEverything}
            disabled={downloading !== null}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-input bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading === "everything" ? "Preparing…" : "Download"}
          </button>
        </div>

        <div className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="font-semibold text-ink">Download as a spreadsheet</p>
            <p className="mt-0.5 text-sm text-stone">
              Your schools, results, notes and outreach as a CSV. Easier to read, less
              complete than the file above.
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadSpreadsheet}
            disabled={downloading !== null}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-input bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading === "spreadsheet" ? "Preparing…" : "Download CSV"}
          </button>
        </div>

        {exportError && <p className="py-3 text-sm text-error">{exportError}</p>}

        {/* P0-8: this promised "Removes everything within 30 days" (nothing
            removed anything), then honestly said "a person completes it by
            hand" (true, and awful). Migration 029 made it real, so the copy
            can finally be both short and true. */}
        <div className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="font-semibold text-ink">Delete account</p>
            <p className="mt-0.5 text-sm text-stone">
              Permanently deletes your account and all of your data straight away. This
              cannot be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-error/50 bg-card px-[18px] text-[15px] font-semibold text-error transition-colors hover:bg-error-bg"
          >
            Delete account
          </button>
        </div>
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
        onConfirm={onDelete}
        submitting={deleting}
        error={deleteError}
      />
    </div>
  );
}
