"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bell, CalendarDays, Check, ClipboardList, Plus, Trophy } from "lucide-react";
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
  type PrepPlan,
} from "@/lib/supabase/features";
import { cn, formatUTR } from "@/lib/utils";

const surfaces: MatchRecord["surface"][] = ["hard", "clay", "grass", "indoor"];

export function MatchModeView() {
  return (
    <AuthGate>
      <MatchModeInner />
    </AuthGate>
  );
}

function MatchModeInner() {
  const { player } = usePlayer();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [status, setStatus] = useState("Ready");
  const [form, setForm] = useState({
    matchDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    opponent: "",
    opponentUtr: "",
    tournamentName: "",
    surface: "hard" as MatchRecord["surface"],
  });

  useEffect(() => {
    loadMatches().then(setMatches);
  }, []);

  const upcoming = useMemo(
    () => matches.filter((m) => !m.result && m.matchDate >= new Date().toISOString().slice(0, 10)),
    [matches]
  );
  const nextMatch = upcoming[0] ?? null;
  const plan = nextMatch?.prepPlan;

  const create = async () => {
    const prepPlan = generatePrepPlan({
      weaknesses: player.weaknesses,
      surface: form.surface,
      currentUtr: player.currentUTR,
      opponentUtr: form.opponentUtr ? Number(form.opponentUtr) : null,
    });
    setStatus("Saving match prep...");
    const saved = await saveMatch({
      matchDate: form.matchDate,
      opponent: form.opponent,
      opponentUtr: form.opponentUtr ? Number(form.opponentUtr) : null,
      tournamentName: form.tournamentName,
      surface: form.surface,
      prepPlan,
      notificationRequested: false,
    });
    if (saved) setMatches((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)]);
    setStatus("Prep plan saved");
  };

  const requestNotification = async (match: MatchRecord) => {
    if (!("Notification" in window)) {
      setStatus("Browser notifications are not supported here.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus("Notifications are blocked. You can still use the prep plan here.");
      return;
    }
    await saveMatch({ ...match, notificationRequested: true });
    setMatches((prev) =>
      prev.map((m) => (m.id === match.id ? { ...m, notificationRequested: true } : m))
    );
    setStatus("Notification enabled. Browser reminders work while the app is open.");
  };

  const logResult = async (match: MatchRecord, result: "win" | "loss") => {
    const score = window.prompt("Score? Example: 6-4, 3-6, 10-8") ?? "";
    const worked = window.prompt("What worked?") ?? "";
    const needsWork = window.prompt("What needs work?") ?? "";
    const saved = await saveMatch({ ...match, result, score, worked, needsWork });
    if (saved) setMatches((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
  };

  return (
    <main className="mx-auto max-w-content container-px py-10">
      <div className="grid gap-5 lg:grid-cols-[390px_1fr]">
        <Card className="p-6">
          <Badge variant="lime" size="sm">
            <Trophy className="h-3.5 w-3.5" />
            Match mode
          </Badge>
          <h1 className="display-serif mt-4 text-3xl text-ink sm:text-4xl">
            Build your next-match routine.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone">
            Prep changes based on surface, your weaknesses, and whether the opponent is rated
            above or below you.
          </p>
          <div className="mt-6 space-y-3">
            <Input label="Match date" type="date" value={form.matchDate} onChange={(v) => setForm({ ...form, matchDate: v })} />
            <Input label="Tournament" value={form.tournamentName} onChange={(v) => setForm({ ...form, tournamentName: v })} placeholder="USTA L4 Bethesda" />
            <Input label="Opponent optional" value={form.opponent} onChange={(v) => setForm({ ...form, opponent: v })} placeholder="Opponent name" />
            <Input label="Opponent UTR optional" type="number" value={form.opponentUtr} onChange={(v) => setForm({ ...form, opponentUtr: v })} placeholder="8.2" />
            <div>
              <span className="mb-2 block text-xs font-medium text-stone-light">Court surface</span>
              <div className="grid grid-cols-4 gap-2">
                {surfaces.map((surface) => (
                  <button
                    key={surface}
                    onClick={() => setForm({ ...form, surface })}
                    className={cn(
                      "rounded-full border-[0.5px] px-3 py-2 text-xs capitalize transition focus:outline-none focus:ring-2 focus:ring-grass/30",
                      form.surface === surface
                        ? "border-grass bg-grass text-cream"
                        : "border-line bg-card text-stone hover:text-ink"
                    )}
                  >
                    {surface}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={create}>
              <Plus className="h-4 w-4" />
              Generate prep plan
            </Button>
            <p className="text-xs text-stone-light">{status}</p>
          </div>
        </Card>

        <div className="space-y-5">
          {nextMatch && plan ? (
            <PrepPlanCard
              match={nextMatch}
              plan={plan}
              currentUtr={player.currentUTR}
              onNotify={() => requestNotification(nextMatch)}
              onLog={logResult}
            />
          ) : (
            <Card className="flex min-h-[430px] items-center justify-center p-8 text-center">
              <div>
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-grass-50 text-grass">
                  <ClipboardList className="h-6 w-6" />
                </span>
                <h2 className="mt-4 text-xl font-medium text-ink">No upcoming match yet</h2>
                <p className="mt-2 max-w-md text-sm text-stone">
                  Add a match on the left and Seeded will build the night-before and match-day
                  checklist.
                </p>
              </div>
            </Card>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {matches.slice(0, 4).map((match) => (
              <Card key={match.id} interactive className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{match.tournamentName || "Match"}</p>
                    <p className="mt-1 text-xs text-stone">
                      {match.matchDate} · {match.surface} · {match.opponent || "Opponent TBD"}
                    </p>
                  </div>
                  {match.result && <Badge variant={match.result === "win" ? "leaf" : "outline"}>{match.result}</Badge>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function PrepPlanCard({
  match,
  plan,
  currentUtr,
  onNotify,
  onLog,
}: {
  match: MatchRecord;
  plan: PrepPlan;
  currentUtr: number;
  onNotify: () => void;
  onLog: (match: MatchRecord, result: "win" | "loss") => void;
}) {
  const sections = [
    ["Warm-up", plan.warmup],
    ["Tactics", plan.tactics],
    ["Mental prep", plan.mental],
    ["Match day", plan.matchDay],
  ] as const;
  return (
    <Card className="overflow-hidden">
      <div className="border-b-[0.5px] border-line bg-grass p-6 text-cream">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-serif text-lg italic text-leaf-accent">Next up</p>
            <h2 className="mt-1 text-2xl font-light">
              {match.tournamentName || "Upcoming match"} · {match.matchDate}
            </h2>
            <p className="mt-2 text-sm text-cream/75">
              You: {formatUTR(currentUtr)} UTR · Opponent:{" "}
              {match.opponentUtr ? formatUTR(match.opponentUtr) : "unknown"} · {match.surface}
            </p>
          </div>
          <Button variant="leaf" size="sm" onClick={onNotify}>
            <Bell className="h-4 w-4" />
            8pm reminder
          </Button>
        </div>
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        {sections.map(([title, items], index) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="rounded-[18px] border-[0.5px] border-line bg-card p-4"
          >
            <p className="flex items-center gap-2 font-medium text-ink">
              <CalendarDays className="h-4 w-4 text-grass" />
              {title}
            </p>
            <ul className="mt-3 space-y-2">
              {items.map((item) => (
                <li key={item} className="text-sm leading-relaxed text-stone">
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t-[0.5px] border-line p-5">
        <Button variant="primary" size="sm" onClick={() => onLog(match, "win")}>
          <Check className="h-4 w-4" />
          Log win
        </Button>
        <Button variant="outline" size="sm" onClick={() => onLog(match, "loss")}>
          Log loss
        </Button>
      </div>
    </Card>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-stone-light">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30"
      />
    </label>
  );
}
