"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Trash2 } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { toolBackLink } from "@/lib/tool-back-link";
import { AuthGate } from "@/components/shared/auth-gate";
import { ConfirmDialog } from "@/components/seeded/ui/dialog";
import { Toast, type ToastAction, type ToastVariant } from "@/components/seeded/ui/toast";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { deleteMatch, loadMatches, saveMatch, type MatchRecord } from "@/lib/db/events";
import { formatDate, localDateKey } from "@/lib/time";
import { cn, plural } from "@/lib/utils";
import { MatchResultForm } from "./match-result-form";
import { opponentLine, ResultChip } from "./result-display";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "last30", label: "Last 30 days" },
  { id: "wins", label: "Wins" },
  { id: "losses", label: "Losses" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

export function MatchHistoryView() {
  return (
    <AuthGate>
      <MatchHistoryInner />
    </AuthGate>
  );
}

interface PageToast {
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

function MatchHistoryInner() {
  const { player, isAuthed } = usePlayer();
  const { data: matches, mutate } = useSWR<MatchRecord[]>("matches", () => loadMatches());
  const [filter, setFilter] = useState<FilterId>("all");
  const [pendingDelete, setPendingDelete] = useState<MatchRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<PageToast | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const visible = useMemo(() => {
    const cutoff = localDateKey(new Date(Date.now() - 30 * 86400000));
    return (matches ?? []).filter((m) => {
      if (filter === "last30") return m.matchDate >= cutoff;
      if (filter === "wins") return m.result === "win";
      if (filter === "losses") return m.result === "loss";
      return true;
    });
  }, [filter, matches]);

  const record = useMemo(() => {
    const all = matches ?? [];
    return { wins: all.filter((m) => m.result === "win").length, losses: all.filter((m) => m.result === "loss").length };
  }, [matches]);

  const restore = async (match: MatchRecord) => {
    try {
      const saved = await saveMatch(match);
      if (saved) {
        await mutate((prev = []) => [saved, ...prev.filter((m) => m.id !== saved.id)].sort((a, b) => b.matchDate.localeCompare(a.matchDate)), {
          revalidate: false,
        });
      }
      setToast({ message: "Result restored.", variant: "success" });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Could not restore it. Try again.", variant: "error" });
    }
  };

  const confirmDelete = async () => {
    const match = pendingDelete;
    if (!match) return;
    setDeleting(true);
    try {
      await deleteMatch(match.id);
      await mutate((prev = []) => prev.filter((m) => m.id !== match.id), { revalidate: false });
      setPendingDelete(null);
      setToast({ message: "Result deleted.", variant: "default", action: { label: "Undo", onClick: () => void restore(match) } });
    } catch (err) {
      setPendingDelete(null);
      setToast({ message: err instanceof Error ? err.message : "Could not delete it. Try again.", variant: "error" });
    } finally {
      setDeleting(false);
    }
  };

  const count = matches?.length ?? 0;
  // Results is a Tools page; "back" is Events, whose Recent results card
  // links here (lib/tool-back-link.ts).
  const backLink = toolBackLink({ isAuthed, role: player.role });

  return (
    <div className="mx-auto max-w-content container-px py-10">
      {backLink && (
        <Link
          href={backLink.href}
          className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-grass hover:underline sm:min-h-6"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {backLink.label}
        </Link>
      )}
      <h1 className="text-[30px] font-semibold tracking-tight text-ink">Results</h1>
      <p className="mt-1.5 text-stone">
        {matches === undefined
          ? "Your logged matches."
          : count === 0
            ? "No matches logged yet."
            : `${plural(count, "match", "matches")} logged · ${record.wins}–${record.losses}`}
      </p>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
        <section aria-labelledby="log-heading" className="rounded-xl border border-line bg-card p-5">
          <h2 id="log-heading" className="text-lg font-semibold text-ink">
            Log a result
          </h2>
          <MatchResultForm className="mt-4" onSaved={() => setToast({ message: "Result saved.", variant: "success" })} />
        </section>

        <section aria-labelledby="history-heading" className="min-w-0">
          <h2 id="history-heading" className="sr-only">
            Your results
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter results">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={cn(
                  "min-h-11 rounded-pill border px-3.5 text-sm font-semibold transition-colors",
                  filter === f.id ? "border-grass bg-grass-50 text-grass" : "border-line bg-card text-stone hover:text-ink"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            {matches === undefined &&
              [0, 1, 2].map((i) => (
                <li key={i} aria-hidden className="h-[92px] animate-pulse rounded-xl border border-line bg-line/40 motion-reduce:animate-none" />
              ))}
            {visible.map((match) => {
              const vs = opponentLine(match);
              return (
                <li key={match.id} className="rounded-xl border border-line bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <ResultChip result={match.result} />
                        <span className="font-semibold text-ink">{match.score || "No score"}</span>
                        {vs && <span className="text-ink">{vs}</span>}
                      </div>
                      <p className="mt-1 text-sm text-stone">
                        {[formatDate(match.matchDate), match.tournamentName, match.surface.charAt(0).toUpperCase() + match.surface.slice(1)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {(match.worked || match.notes) && <p className="mt-2 text-sm text-ink">{match.worked || match.notes}</p>}
                      {match.needsWork && (
                        <p className="mt-1 text-sm text-ink">
                          <span className="font-semibold">To work on: </span>
                          {match.needsWork}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete the ${formatDate(match.matchDate)} result`}
                      onClick={() => setPendingDelete(match)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone transition-colors hover:bg-error-bg hover:text-error"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {matches !== undefined && visible.length === 0 && (
            <EmptyState
              className="mt-4"
              title={count === 0 ? "No results yet." : "Nothing matches this filter."}
              description={count === 0 ? "Log your first match with the form." : undefined}
            />
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this result?"
        description={pendingDelete ? `${formatDate(pendingDelete.matchDate)}${opponentLine(pendingDelete) ? `, ${opponentLine(pendingDelete)}` : ""}. You can undo right after.` : undefined}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
      <Toast open={!!toast} onDismiss={dismissToast} variant={toast?.variant ?? "default"} action={toast?.action} duration={toast?.action ? 8000 : 4000}>
        {toast?.message ?? " "}
      </Toast>
    </div>
  );
}
