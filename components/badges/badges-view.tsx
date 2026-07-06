"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, CheckCircle2, Medal, Sparkles } from "lucide-react";
import { AuthGate } from "@/components/shared/auth-gate";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { usePlayer } from "@/lib/context/player-context";
import {
  awardBadges,
  calculateStreak,
  evaluateBadges,
  loadBadges,
  loadDailyCheckins,
  loadMatches,
  type EarnedBadge,
} from "@/lib/supabase/features";
import { cn } from "@/lib/utils";

const catalog = [
  ...[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((n) => ({ key: `utr-${n}`, type: "UTR", title: `${n}.0 UTR` })),
  ...[5, 10, 25, 50].map((n) => ({ key: `tournaments-${n}`, type: "Tournament", title: `${n} tournaments` })),
  { key: "upset-1-utr", type: "Match", title: "Rated upset" },
  { key: "win-streak-5", type: "Match", title: "Five match streak" },
  ...[7, 30, 100].map((n) => ({ key: `streak-${n}`, type: "Training", title: `${n} day streak` })),
  ...[50, 100, 500].map((n) => ({ key: `hours-${n}`, type: "Training", title: `${n} hours trained` })),
  { key: "coach-email-5", type: "Recruiting", title: "Five coaches emailed" },
  { key: "first-coach-reply", type: "Recruiting", title: "First coach reply" },
];

export function BadgesView() {
  return (
    <AuthGate>
      <BadgesInner />
    </AuthGate>
  );
}

function BadgesInner() {
  const { player } = usePlayer();
  const [earned, setEarned] = useState<EarnedBadge[]>([]);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [badges, checkins, matches] = await Promise.all([
        loadBadges(),
        loadDailyCheckins(),
        loadMatches(),
      ]);
      if (cancelled) return;
      setEarned(badges);
      setStreak(calculateStreak(checkins));
      // Award anything newly qualified for, then show it immediately.
      const existingKeys = new Set(badges.map((b) => b.key));
      const newlyQualified = evaluateBadges({
        currentUtr: player.currentUTR,
        tournamentsPlayed: player.tournamentsPlayed,
        streak: calculateStreak(checkins),
        matches,
        trainingHours: 0,
        contactedCoaches: 0,
        repliedCoaches: 0,
      }).filter((badge) => !existingKeys.has(badge.key));
      if (newlyQualified.length > 0) {
        const awarded = await awardBadges(newlyQualified);
        if (!cancelled && awarded.length > 0) {
          setEarned((prev) => [...awarded, ...prev]);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [player.currentUTR, player.tournamentsPlayed]);

  const earnedMap = useMemo(() => new Map(earned.map((b) => [b.key, b])), [earned]);
  const groups = ["UTR", "Tournament", "Match", "Training", "Recruiting"];

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="eyebrow text-gold">Badge collection</span>
          <h1 className="display-serif mt-3 text-4xl text-ink sm:text-5xl">
            Milestones that show the work.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone">
            Seeded unlocks badges from real progress: UTR, training streaks, matches, tournaments,
            and recruiting actions.
          </p>
        </div>
        <Card className="w-fit p-4">
          <p className="text-3xl font-light text-ink">{earned.length}</p>
          <p className="text-xs text-stone">earned · {streak} day streak</p>
        </Card>
      </div>

      <div className="mt-8 space-y-8">
        {groups.map((group) => (
          <section key={group}>
            <div className="mb-3 flex items-center gap-2">
              <Medal className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">{group}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {catalog
                .filter((item) => item.type === group)
                .map((item) => {
                  const hit = earnedMap.get(item.key);
                  return (
                    <Card
                      key={item.key}
                      className={cn(
                        "p-5 transition-all",
                        hit ? "border-grass/30 bg-card shadow-soft" : "opacity-60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-2xl",
                          hit ? "bg-grass text-cream" : "bg-cream text-stone-light"
                        )}
                      >
                        {hit ? <CheckCircle2 className="h-5 w-5" /> : <Award className="h-5 w-5" />}
                      </span>
                      <h3 className="mt-4 font-medium text-ink">{item.title}</h3>
                      <p className="mt-1 text-xs text-stone">
                        {hit
                          ? `Earned ${new Date(hit.earnedAt).toLocaleDateString()}`
                          : "Not earned yet"}
                      </p>
                      {hit && (
                        <Badge variant="lime" size="sm" className="mt-3">
                          <Sparkles className="h-3.5 w-3.5" />
                          Unlocked
                        </Badge>
                      )}
                    </Card>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
