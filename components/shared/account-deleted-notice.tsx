"use client";

import { useSearchParams } from "next/navigation";

// After "Delete everything", Settings sends the browser to /?deleted=1. That
// parameter used to be read by nothing, so the last thing a person saw after
// deleting their account was a homepage with no word that it had worked.
// Mounted in the app shell beside CheckoutSync. Says only what is true:
// the account and the data keyed to it are gone (delete_my_account(),
// migration 029) — not that anything was emailed, because nothing is.
export function AccountDeletedNotice() {
  const params = useSearchParams();
  if (params.get("deleted") !== "1") return null;
  return (
    <div role="status" className="mx-auto max-w-content container-px pt-4">
      <p className="rounded-lg border border-line bg-card px-4 py-3 text-sm text-ink">
        Your account and the data stored with it have been deleted. You&rsquo;re signed out.
      </p>
    </div>
  );
}
