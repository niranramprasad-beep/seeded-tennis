"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { School } from "@/lib/types";
import { staffDirectorySearchQuery } from "@/lib/db/schools";
import { cn } from "@/lib/utils";

// Where to find a coach's real address, without Seeded pretending to know it.
//
// This used to be a link to https://www.google.com/search?q=… — honest
// about being a search, but it sent a family (often a minor) to a search
// engine from a product page, and the launch brief bans google.com/search
// links outright. Seeded stores no coach contacts, so it hands over the
// exact phrase to search for, with a copy button, and links nowhere.
export function StaffDirectoryHint({
  school,
  className,
}: {
  school: Pick<School, "name" | "gender">;
  className?: string;
}) {
  const query = staffDirectorySearchQuery(school);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className={cn("text-sm text-stone", className)}>
      <p>Seeded doesn&apos;t store coach contacts. To find the current staff, search the web for:</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate rounded-md border border-line bg-cream/60 px-2.5 py-1.5 font-mono text-[13px] text-ink">
          {query}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-semibold text-ink transition-colors hover:bg-subtle-hover sm:min-h-9"
          aria-label={copied ? "Search phrase copied" : "Copy search phrase"}
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
