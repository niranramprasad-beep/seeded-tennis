"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, Trophy } from "lucide-react";
import { AuthGate } from "@/components/shared/auth-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePlayer } from "@/lib/context/player-context";
import {
  generatePrepPlan,
  loadMatches,
  saveMatch,
  type MatchRecord,
} from "@/lib/supabase/features";
import { cn } from "@/lib/utils";

const filters = ["all", "last 30", "wins", "losses"] as const;

const inputClass =
  "h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";
const areaClass =
  "min-h-[86px] w-full rounded-xl border-[0.5px] border-line bg-card px-4 py-3 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";

export function MatchHistoryView() {
  return (
    <AuthGate>
      <MatchHistoryInner />
    </AuthGate>
  );
}

function MatchHistoryInner() {
  const { player } = usePlayer();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    matchDate: new Date().toISOString().slice(0, 10),
    opponent: "",
    opponentUtr: "",
    tournamentName: "",
    surface: "hard" as MatchRecord["surface"],
    result: "win" as "win" | "loss",
    score: "",
    worked: "",
    needsWork: "",
    notes: "",
  });

  useEffect(() => {
    loadMatches().then(setMatches);
  }, []);

  const visible = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    return matches.filter((m) => {
      if (filter === "last 30") return m.matchDate >= cutoff;
      if (filter === "wins") return m.result === "win";
      if (filter === "losses") return m.result === "loss";
      return true;
    });
  }, [filter, matches]);

  const save = async () => {
    setError("");
    const opponentUtr = form.opponentUtr ? Number(form.opponentUtr) : null;
    if (opponentUtr !== null && (!Number.isFinite(opponentUtr) || opponentUtr < 1 || opponentUtr > 16.5)) {
      setError("Opponent UTR must be between 1.00 and 16.50.");
      return;
    }
    setSaving("Saving match…");
    try {
      const saved = await saveMatch({
        matchDate: form.matchDate,
        opponent: form.opponent,
        opponentUtr,
        tournamentName: form.tournamentName,
        surface: form.surface,
        result: form.result,
        score: form.score,
        worked: form.worked,
        needsWork: form.needsWork,
        notes: form.notes,
        prepPlan: generatePrepPlan({
          weaknesses: player.weaknesses,
          surface: form.surface,
          currentUtr: player.currentUTR,
          opponentUtr,
        }),
      });
      if (saved) setMatches((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)]);
      setSaving("Saved");
    } catch (err) {
      setSaving("");
      setError(err instanceof Error ? err.message : "Could not save the match. Try again.");
    }
  };

  return (
    <div className="mx-auto max-w-content container-px py-12">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="eyebrow text-gold">Match history</span>
          <h1 className="display-serif mt-3 text-4xl text-ink sm:text-5xl">
            Turn matches into next-week work.
          </h1>
          <p className="mt-3 max-w-xl text-pretty leading-relaxed text-stone">
            Log the score, what worked, and what broke down — your record builds a
            clear picture coaches can trust.
          </p>
        </div>
        <Badge variant="outline" size="md" className="shrink-0">
          <Trophy className="h-4 w-4" />
          {saving || `${matches.length} matches logged`}
        </Badge>
      </div>

      <div className="rule-gold mt-8 max-w-[140px]" />

      <div className="mt-8 grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit p-6">
          <h2 className="text-lg font-medium text-ink">Log a match</h2>
          <div className="mt-4 grid gap-3">
            <input className={inputClass} type="date" value={form.matchDate} onChange={(e) => setForm({ ...form, matchDate: e.target.value })} aria-label="Match date" />
            <input className={inputClass} placeholder="Tournament name" value={form.tournamentName} onChange={(e) => setForm({ ...form, tournamentName: e.target.value })} />
            <input className={inputClass} placeholder="Opponent" value={form.opponent} onChange={(e) => setForm({ ...form, opponent: e.target.value })} />
            <input className={inputClass} type="number" min={1} max={16.5} step={0.01} placeholder="Opponent UTR (optional)" value={form.opponentUtr} onChange={(e) => setForm({ ...form, opponentUtr: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              {(["win", "loss"] as const).map((result) => (
                <button
                  key={result}
                  className={cn(
                    "rounded-pill border-[0.5px] py-2 text-sm capitalize transition-colors",
                    form.result === result ? "border-grass bg-grass text-cream" : "border-line bg-card text-stone hover:text-ink"
                  )}
                  onClick={() => setForm({ ...form, result })}
                >
                  {result}
                </button>
              ))}
            </div>
            <input className={inputClass} placeholder="Score, e.g. 6-4, 6-3" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} />
            <textarea className={areaClass} placeholder="What worked?" value={form.worked} onChange={(e) => setForm({ ...form, worked: e.target.value })} />
            <textarea className={areaClass} placeholder="What didn't work?" value={form.needsWork} onChange={(e) => setForm({ ...form, needsWork: e.target.value })} />
            <textarea className={areaClass} placeholder="Other notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            {error && (
              <p className="rounded-xl bg-[#FBEAE5] px-4 py-3 text-sm text-[#9C3B22]">{error}</p>
            )}
            <Button variant="primary" size="md" onClick={save}>Save match</Button>
          </div>
        </Card>

        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-stone-light" />
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-pill px-3 py-1.5 text-sm capitalize transition-colors",
                  filter === f ? "bg-grass text-cream" : "bg-grass-50 text-stone hover:text-ink"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {visible.map((match) => (
              <Card key={match.id} interactive className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={match.result === "win" ? "leaf" : "outline"}>
                    {match.result ?? "planned"}
                  </Badge>
                  <h3 className="font-medium text-ink">{match.tournamentName || "Match"}</h3>
                </div>
                <p className="mt-1 text-xs text-stone-light">
                  {match.matchDate} · {match.opponent || "opponent not listed"} · {match.score || "no score"}
                </p>
                {(match.worked || match.notes) && (
                  <p className="mt-3 text-sm text-stone">{match.worked || match.notes}</p>
                )}
                {match.needsWork && (
                  <p className="mt-2 text-sm text-stone">
                    <span className="font-medium text-ink">To work on: </span>
                    {match.needsWork}
                  </p>
                )}
              </Card>
            ))}
            {!visible.length && (
              <Card className="p-10 text-center">
                <p className="text-sm text-stone">No matches in this view yet — log your first on the left.</p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
