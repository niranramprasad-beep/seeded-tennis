"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain, Filter, Upload, Video } from "lucide-react";
import { AuthGate } from "@/components/shared/auth-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePlayer } from "@/lib/context/player-context";
import {
  generatePrepPlan,
  loadMatches,
  saveMatch,
  uploadMatchVideo,
  type MatchAnalysis,
  type MatchRecord,
} from "@/lib/supabase/features";
import { cn } from "@/lib/utils";

const filters = ["all", "last 30", "wins", "losses"] as const;

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
    setSaving("Saving match...");
    const saved = await saveMatch({
      matchDate: form.matchDate,
      opponent: form.opponent,
      opponentUtr: form.opponentUtr ? Number(form.opponentUtr) : null,
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
        opponentUtr: form.opponentUtr ? Number(form.opponentUtr) : null,
      }),
    });
    if (saved) setMatches((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)]);
    setSaving("Saved");
  };

  const analyze = async (match: MatchRecord) => {
    setSaving("Analyzing match...");
    const response = await fetch("/api/match-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentUtr: player.currentUTR,
        weaknesses: player.weaknesses,
        match,
      }),
    });
    const payload = (await response.json()) as MatchAnalysis;
    const saved = await saveMatch({ ...match, aiAnalysis: payload });
    if (saved) setMatches((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
    setSaving(payload.source === "fallback" ? "Saved fallback analysis. Add OPENAI_API_KEY for AI." : "AI analysis saved");
  };

  const upload = async (match: MatchRecord, file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setSaving("Choose a video file.");
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      setSaving("Video is too large. Keep clips short, around 30 seconds.");
      return;
    }
    setSaving("Uploading video...");
    const videoUrl = await uploadMatchVideo(file);
    if (!videoUrl) return;
    const saved = await saveMatch({ ...match, videoUrl });
    if (saved) setMatches((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
    setSaving("Video uploaded");
  };

  return (
    <main className="mx-auto max-w-content container-px py-10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="font-serif text-lg italic text-leaf-accent">Match history</p>
          <h1 className="mt-1 text-3xl font-light tracking-tight text-ink">
            Turn matches into next-week work.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone">
            Log the score, what worked, what broke down, and save AI takeaways to your training history.
          </p>
        </div>
        <Badge variant="outline" size="md">
          <Brain className="h-4 w-4" />
          {saving || `${matches.length} matches`}
        </Badge>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[400px_1fr]">
        <Card className="p-6">
          <h2 className="text-lg font-medium text-ink">Log a match</h2>
          <div className="mt-4 grid gap-3">
            <input className={inputClass} type="date" value={form.matchDate} onChange={(e) => setForm({ ...form, matchDate: e.target.value })} />
            <input className={inputClass} placeholder="Tournament name" value={form.tournamentName} onChange={(e) => setForm({ ...form, tournamentName: e.target.value })} />
            <input className={inputClass} placeholder="Opponent" value={form.opponent} onChange={(e) => setForm({ ...form, opponent: e.target.value })} />
            <input className={inputClass} type="number" placeholder="Opponent UTR optional" value={form.opponentUtr} onChange={(e) => setForm({ ...form, opponentUtr: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              {(["win", "loss"] as const).map((result) => (
                <button
                  key={result}
                  className={cn(
                    "rounded-full border-[0.5px] py-2 text-sm capitalize",
                    form.result === result ? "border-grass bg-grass text-cream" : "border-line bg-card text-stone"
                  )}
                  onClick={() => setForm({ ...form, result })}
                >
                  {result}
                </button>
              ))}
            </div>
            <input className={inputClass} placeholder="Score, e.g. 6-4, 6-3" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} />
            <textarea className={areaClass} placeholder="What worked?" value={form.worked} onChange={(e) => setForm({ ...form, worked: e.target.value })} />
            <textarea className={areaClass} placeholder="What did not work?" value={form.needsWork} onChange={(e) => setForm({ ...form, needsWork: e.target.value })} />
            <textarea className={areaClass} placeholder="Other notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <Button onClick={save}>Save match</Button>
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
                  "rounded-full px-3 py-1.5 text-sm transition",
                  filter === f ? "bg-grass text-cream" : "bg-card text-stone hover:text-ink"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {visible.map((match) => (
              <Card key={match.id} className="p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={match.result === "win" ? "leaf" : "outline"}>{match.result ?? "planned"}</Badge>
                      <h3 className="font-medium text-ink">{match.tournamentName || "Match"}</h3>
                    </div>
                    <p className="mt-1 text-xs text-stone">
                      {match.matchDate} · {match.opponent || "opponent not listed"} · {match.score || "no score"}
                    </p>
                    <p className="mt-3 text-sm text-stone">{match.worked || match.notes || "No notes yet."}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => analyze(match)}>
                      <Brain className="h-4 w-4" />
                      Analyze
                    </Button>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border-[0.5px] border-line bg-card px-3 py-2 text-sm text-stone transition hover:text-ink">
                      <Upload className="h-4 w-4" />
                      Video
                      <input className="sr-only" type="file" accept="video/*" onChange={(e) => upload(match, e.target.files?.[0] ?? null)} />
                    </label>
                  </div>
                </div>
                {match.videoUrl && (
                  <p className="mt-3 flex items-center gap-2 text-xs text-stone-light">
                    <Video className="h-3.5 w-3.5" />
                    Video saved to Supabase Storage.
                  </p>
                )}
                {match.aiAnalysis && (
                  <div className="mt-4 rounded-2xl bg-grass-50 p-4">
                    <p className="text-sm font-medium text-ink">{match.aiAnalysis.summary}</p>
                    <ul className="mt-2 space-y-1 text-sm text-stone">
                      {match.aiAnalysis.drills.map((drill) => (
                        <li key={drill}>{drill}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

const inputClass =
  "h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";
const areaClass =
  "min-h-[86px] w-full rounded-xl border-[0.5px] border-line bg-card px-4 py-3 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";
