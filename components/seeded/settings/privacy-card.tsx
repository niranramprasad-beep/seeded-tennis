"use client";

import { useState } from "react";
import Link from "next/link";
import { SeededToggle } from "@/components/seeded/ui/toggle";
import { formatDate } from "@/lib/time";
import { DeleteAccountDialog } from "./delete-account-dialog";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function PrivacyCard({
  publicRecruitingPage,
  onTogglePublicRecruitingPage,
  onDownload,
  downloading,
  deletionRequestedAt,
  onRequestDeletion,
  onCancelDeletion,
  deletingBusy,
}: {
  publicRecruitingPage: boolean;
  onTogglePublicRecruitingPage: (next: boolean) => void;
  onDownload: () => void;
  downloading: boolean;
  deletionRequestedAt: string | null | undefined;
  onRequestDeletion: () => void;
  onCancelDeletion: () => void;
  deletingBusy: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const purgeDate = deletionRequestedAt
    ? formatDate(new Date(new Date(deletionRequestedAt).getTime() + THIRTY_DAYS_MS))
    : null;

  const confirmDelete = () => {
    onRequestDeletion();
    setDialogOpen(false);
  };

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <h2 className="border-b border-line pb-4 text-lg font-semibold text-ink">Privacy + data</h2>

      <div className="divide-y divide-line">
        <div className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="font-semibold text-ink">Public recruiting page</p>
            <p className="mt-0.5 text-sm text-stone">
              {publicRecruitingPage ? "On" : "Off"}. When on, coaches you email can see your results
              and video. A parent must approve.
            </p>
          </div>
          <SeededToggle
            checked={publicRecruitingPage}
            onChange={onTogglePublicRecruitingPage}
            label="Public recruiting page"
          />
        </div>

        <div className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="font-semibold text-ink">Download my data</p>
            <p className="mt-0.5 text-sm text-stone">Schools, results, notes and outreach as a spreadsheet.</p>
          </div>
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-[#D6D3C8] bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-[#F1EFE8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? "Preparing…" : "Download"}
          </button>
        </div>

        <div className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="font-semibold text-ink">Delete account</p>
            {deletionRequestedAt ? (
              <p className="mt-0.5 text-sm text-stone">Deletion scheduled for {purgeDate}.</p>
            ) : (
              <p className="mt-0.5 text-sm text-stone">Removes everything within 30 days. This can&apos;t be undone.</p>
            )}
          </div>
          {deletionRequestedAt ? (
            <button
              type="button"
              onClick={onCancelDeletion}
              disabled={deletingBusy}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-[#D6D3C8] bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-[#F1EFE8] disabled:cursor-not-allowed disabled:opacity-60"
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
