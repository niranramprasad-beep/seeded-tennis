"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { Player } from "@/lib/types";

// Real existing family-sharing data (player.familyCode), same as the
// pre-redesign settings page's "Family" card — the mockup doesn't detail
// this tab beyond its nav label, so this is the one genuinely real thing to
// show here rather than inventing new content.
export function FamilyCard({ player }: { player: Player }) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (!player.familyCode) return;
    navigator.clipboard?.writeText(player.familyCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold text-ink">Family</h2>
      <p className="mt-1 text-sm text-stone">
        Share this code so parents and siblings can follow the same player.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-cream/50 px-4 py-3">
          <span className="font-mono text-xl tracking-wider text-grass">
            {player.familyCode ?? "—"}
          </span>
          {player.familyCode && (
            <button
              onClick={copyCode}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-grass-50 text-grass transition-colors hover:bg-grass-100"
              aria-label="Copy family code"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          )}
        </div>
        <span className="inline-flex w-fit items-center rounded-pill border border-line px-3 py-1 text-sm text-ink">
          You&apos;re the {player.role === "parent" ? "parent" : "player"}
        </span>
      </div>
    </div>
  );
}
