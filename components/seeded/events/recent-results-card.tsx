"use client";

import Link from "next/link";
import type { MatchRecord } from "@/lib/supabase/features";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { formatUTR } from "@/lib/utils";

const RESULTS_SHOWN = 3;

// Mirrors /plan's real "Recent results" card (components/seeded/roadmap/
// seeded-roadmap-layout.tsx) — same loadMatches() data, same "no
// fabrication" discipline. The mockup also shows a per-match UTR delta and
// a Verified/Pending chip; there's no real source for either (UTR doesn't
// update per-match, and no table attributes a specific rating movement to a
// specific match — the only real UTR history, lib/supabase/utr.ts, is a
// separately-logged timeline, not 1:1 with matches). Rather than invent a
// number, this only renders the fields a MatchRecord actually has, same
// discipline as dropping the Recruiting camp-invite row entirely.
export function RecentResultsCard({ matches }: { matches: MatchRecord[] }) {
  const resolved = matches.filter((m) => m.result).slice(0, RESULTS_SHOWN);

  return (
    <div className="mt-5 rounded-xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Recent results</h2>
        <Link href="/matches" className="text-sm font-semibold text-grass underline">
          All results
        </Link>
      </div>

      {resolved.length === 0 ? (
        <div className="mt-3.5">
          <EmptyState title="No results logged yet." description="Log a result to start tracking your record." />
        </div>
      ) : (
        <ul className="mt-3.5 flex flex-col">
          {resolved.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-3.5 border-t border-line py-3.5 first:border-t-0 first:pt-0"
            >
              <div className="w-14 shrink-0 font-mono text-sm text-stone">{formatShortDate(m.matchDate)}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-ink">
                  <span className="font-semibold">
                    {m.result === "win" ? "W" : "L"} {m.score}
                  </span>{" "}
                  vs opponent {m.opponentUtr != null ? formatUTR(m.opponentUtr) : "unrated"}
                </p>
                <p className="truncate text-sm text-stone">{m.tournamentName || "Unlisted event"}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatShortDate(dateStr: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(`${dateStr}T00:00:00`) : new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
