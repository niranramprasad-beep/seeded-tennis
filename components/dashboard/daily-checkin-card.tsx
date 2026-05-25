"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Award, Check, Flame, Sparkles } from "lucide-react";
import type { Player } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  awardBadges,
  calculateStreak,
  evaluateBadges,
  loadBadges,
  loadDailyCheckins,
  loadMatches,
  saveDailyCheckin,
  type DailyCheckin,
  type EarnedBadge,
  type FocusArea,
  localDateKey,
} from "@/lib/supabase/features";

const FOCUS: FocusArea[] = [
  "forehand",
  "backhand",
  "serve",
  "fitness",
  "mental",
  "match play",
  "recovery",
];

export function DailyCheckinCard({
  player,
  trainingHours,
  contactedCoaches = 0,
  repliedCoaches = 0,
}: {
  player: Player;
  trainingHours: number;
  contactedCoaches?: number;
  repliedCoaches?: number;
}) {
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [mood, setMood] = useState(4);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [earned, setEarned] = useState<EarnedBadge | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const rows = await loadDailyCheckins();
      if (cancelled) return;
      setCheckins(rows);
      const today = rows.find((row) => row.date === localDateKey());
      if (today) {
        setMood(today.mood);
        setFocusAreas(today.focusAreas);
        setNotes(today.notes);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const streak = useMemo(() => calculateStreak(checkins), [checkins]);
  const todayDone = checkins.some((row) => row.date === localDateKey());

  const toggle = (area: FocusArea) =>
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((x) => x !== area) : [...prev, area]
    );

  const submit = async () => {
    setSaving(true);
    const saved = await saveDailyCheckin({ mood, focusAreas, notes });
    setSaving(false);
    if (!saved) return;
    const next = [...checkins.filter((row) => row.date !== saved.date), saved].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    setCheckins(next);

    const [existing, matches] = await Promise.all([loadBadges(), loadMatches()]);
    const existingKeys = new Set(existing.map((b) => b.key));
    const newBadges = evaluateBadges({
      currentUtr: player.currentUTR,
      tournamentsPlayed: player.tournamentsPlayed,
      streak: calculateStreak(next),
      matches,
      trainingHours,
      contactedCoaches,
      repliedCoaches,
    }).filter((badge) => !existingKeys.has(badge.key));
    const awarded = await awardBadges(newBadges);
    if (awarded[0]) {
      setEarned(awarded[0]);
      setTimeout(() => setEarned(null), 4200);
    }
  };

  return (
    <Card className="relative overflow-hidden p-6">
      <AnimatePresence>
        {earned && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="absolute right-4 top-4 z-10 rounded-2xl border-[0.5px] border-line bg-card px-4 py-3 shadow-lift"
          >
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <Award className="h-4 w-4 text-leaf-accent" />
              Just earned: {earned.title}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-serif text-base italic text-leaf-accent">Daily check-in</p>
          <h2 className="mt-1 text-xl font-medium text-ink">30-second training log</h2>
          <p className="mt-1 text-sm text-stone">
            Resets at midnight local time. Keep the streak honest.
          </p>
        </div>
        <Badge variant="leaf" size="md" className="w-fit">
          <Flame className="h-3.5 w-3.5" />
          {streak} day streak
        </Badge>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_220px]">
        <div>
          <p className="text-sm font-medium text-ink">How did training feel today?</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                onClick={() => setMood(value)}
                className={cn(
                  "rounded-2xl border-[0.5px] py-3 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-grass/30",
                  mood === value
                    ? "border-grass bg-grass text-cream shadow-soft"
                    : "border-line bg-cream/60 text-stone hover:bg-card hover:text-ink"
                )}
              >
                {value}
              </button>
            ))}
          </div>

          <p className="mt-5 text-sm font-medium text-ink">What did you work on?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {FOCUS.map((area) => (
              <button
                key={area}
                onClick={() => toggle(area)}
                className={cn(
                  "rounded-full border-[0.5px] px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-grass/30",
                  focusAreas.includes(area)
                    ? "border-grass bg-grass-50 text-grass"
                    : "border-line bg-card text-stone hover:text-ink"
                )}
              >
                {area}
              </button>
            ))}
          </div>

          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional notes: energy, soreness, what clicked, what felt off..."
            className="mt-4 min-h-[88px] w-full rounded-xl border-[0.5px] border-line bg-card px-4 py-3 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30"
          />

          <Button className="mt-4" onClick={submit} disabled={saving || focusAreas.length === 0}>
            {saving ? "Saving..." : todayDone ? "Update today's check-in" : "Save check-in"}
            {todayDone ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          </Button>
        </div>
        <CheckinHeatmap checkins={checkins} />
      </div>
    </Card>
  );
}

function CheckinHeatmap({ checkins }: { checkins: DailyCheckin[] }) {
  const byDate = new Map(checkins.map((row) => [row.date, row]));
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - index));
    const key = localDateKey(date);
    return { key, checkin: byDate.get(key) };
  });

  return (
    <div className="rounded-[18px] border-[0.5px] border-line bg-cream/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">30-day heatmap</p>
        <p className="text-xs text-stone-light">Mood intensity</p>
      </div>
      <div className="mt-4 grid grid-cols-10 gap-1.5">
        {days.map(({ key, checkin }) => (
          <span
            key={key}
            title={checkin ? `${key}: ${checkin.mood}/5` : `${key}: no check-in`}
            className={cn(
              "aspect-square rounded-[5px] border-[0.5px] border-line",
              !checkin && "bg-card",
              checkin?.mood === 1 && "bg-grass-50",
              checkin?.mood === 2 && "bg-grass-100",
              checkin?.mood === 3 && "bg-leaf-accent/45",
              checkin?.mood === 4 && "bg-leaf-accent/75",
              checkin?.mood === 5 && "bg-grass"
            )}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-[11px] text-stone-light">
        <span>Less</span>
        <div className="flex gap-1">
          {["bg-card", "bg-grass-50", "bg-grass-100", "bg-leaf-accent/65", "bg-grass"].map((c) => (
            <span key={c} className={cn("h-3 w-3 rounded-[4px] border-[0.5px] border-line", c)} />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
