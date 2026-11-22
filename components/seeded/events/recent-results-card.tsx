"use client";

import Link from "next/link";
import type { MatchRecord } from "@/lib/db/events";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { opponentLine, ResultChip } from "@/components/matches/result-display";
import { parseLocalDate } from "@/lib/time";

const RESULTS_SHOWN = 3;

// The last three results the player logged — only the fields a MatchRecord
// actually has. The mockup's per-match UTR delta and Verified chip have no
// real source (UTR does not move per match), so they are not drawn.
// The opponent is named when the player gave a name; their UTR, when given,
// has two decimals ("vs Alex Kim (8.20)") — it used to read "vs opponent 6.10".
export function RecentResultsCard({ matches, className }: { matches: MatchRecord[] | undefined; className?: string }) {
  const resolved = (matches ?? []).filter((m) => m.result).slice(0, RESULTS_SHOWN);

  return (
    <section aria-labelledby="results-heading" className={`flex flex-col rounded-card border border-line bg-card p-5 ${className ?? ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="results-heading" className="text-lg font-semibold text-ink">
          Recent results
        </h2>
        <Link href="/matches" className="inline-flex min-h-11 items-center text-sm font-semibold text-grass underline sm:min-h-6">
          All results
        </Link>
      </div>

      {matches === undefined ? (
        <ul className="mt-3.5 flex flex-col gap-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-10 animate-pulse rounded-md bg-line/50 motion-reduce:animate-none" />
          ))}
        </ul>
      ) : resolved.length === 0 ? (
        <div className="mt-3.5">
          <EmptyState title="No results logged yet." description="Log a result to start your record." />
        </div>
      ) : (
        <ul className="mt-3.5 flex flex-col">
          {resolved.map((m) => {
            const vs = opponentLine(m);
            return (
              <li key={m.id} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
                <div className="w-14 shrink-0 pt-0.5 font-mono text-sm text-stone">
                  {parseLocalDate(m.matchDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink">
                    <ResultChip result={m.result} />
                    {m.score && <span className="font-semibold">{m.score}</span>}
                    {vs && <span className="min-w-0 break-words">{vs}</span>}
                  </p>
                  {m.tournamentName && <p className="mt-0.5 truncate text-sm text-stone">{m.tournamentName}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
