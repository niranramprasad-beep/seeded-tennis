"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Award, CheckCircle2, Medal, Sparkles } from "lucide-react";
import { AuthGate } from "@/components/shared/auth-gate";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { usePlayer } from "@/lib/context/player-context";
import { useDesign } from "@/lib/context/design-context";
import {
  awardBadges,
  calculateStreak,
  evaluateBadges,
  loadBadges,
  loadDailyCheckins,
  loadMatches,
  type EarnedBadge,
} from "@/lib/supabase/features";
import { formatDate } from "@/lib/time";
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
  const { design } = useDesign();
  const isSeeded = design === "seeded";
  const { player } = usePlayer();
  // Keyed on the values that can actually change which badges qualify, so
  // crossing a new UTR threshold re-checks against fresh data instead of a
  // cached result from before the change.
  const { data, isLoading } = useSWR(
    ["badges-page-data", player.currentUTR, player.tournamentsPlayed] as const,
    () => Promise.all([loadBadges(), loadDailyCheckins(), loadMatches()])
  );
  const [earned, setEarned] = useState<EarnedBadge[]>([]);
  const [streak, setStreak] = useState(0);
  const [justUnlocked, setJustUnlocked] = useState<Set<string>>(new Set());
  const loading = isLoading;

  // Award anything newly qualified for, then show it immediately. Guarded
  // by `evaluatedForRef` so this only runs once per distinct SWR result —
  // not on every render, and not a second time if SWR re-delivers the same
  // cached data object.
  const evaluatedForRef = useRef<unknown>(null);
  useEffect(() => {
    if (!data || evaluatedForRef.current === data) return;
    evaluatedForRef.current = data;
    const [badges, checkins, matches] = data;
    setEarned(badges);
    setStreak(calculateStreak(checkins));

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
      awardBadges(newlyQualified).then((awarded) => {
        if (awarded.length > 0) {
          setEarned((prev) => [...awarded, ...prev]);
          // Marks exactly the badges unlocked THIS load for the one-time
          // celebration pop below — never replayed for already-earned ones
          // on a later visit/re-render.
          setJustUnlocked(new Set(awarded.map((b) => b.key)));
        }
      });
    }
  }, [data, player.currentUTR, player.tournamentsPlayed]);

  const earnedMap = useMemo(() => new Map(earned.map((b) => [b.key, b])), [earned]);
  const groups = ["UTR", "Tournament", "Match", "Training", "Recruiting"];

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className={cn("eyebrow text-gold", isSeeded && "font-seeded uppercase tracking-[0.2em]")}>Badge collection</span>
          <h1 className={cn("mt-3 text-4xl sm:text-5xl", isSeeded ? "font-seeded font-semibold tracking-tight text-ink" : "display-serif text-ink")}>
            Milestones that show the work.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone">
            Seeded unlocks badges from real progress: UTR, training streaks, matches, tournaments,
            and recruiting actions.
          </p>
        </div>
        <Card className={cn("w-fit p-4", isSeeded && "seeded-glass border-0 shadow-seeded-1")}>
          <p className={cn("text-3xl text-ink", isSeeded ? "font-mono" : "font-light")}>{earned.length}</p>
          <p className="text-xs text-stone">earned · {streak} day streak</p>
        </Card>
      </div>

      <div className="mt-8 space-y-8">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-[140px]" />
            ))}
          </div>
        ) : (
        groups.map((group) => (
          <section key={group}>
            <div className="mb-3 flex items-center gap-2">
              <Medal className="h-4 w-4 text-grass" />
              <h2 className={cn("text-lg font-medium text-ink", isSeeded && "font-seeded")}>{group}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {catalog
                .filter((item) => item.type === group)
                .map((item) => {
                  const hit = earnedMap.get(item.key);
                  const freshlyUnlocked = hit && justUnlocked.has(item.key);
                  return (
                    <motion.div
                      key={item.key}
                      initial={freshlyUnlocked ? { scale: 0.85, opacity: 0 } : false}
                      animate={
                        freshlyUnlocked
                          ? { scale: [0.85, 1.08, 1], opacity: 1 }
                          : { scale: 1, opacity: 1 }
                      }
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <Card
                        className={cn(
                          "p-5 transition-all",
                          isSeeded
                            ? hit
                              ? "seeded-glass border-0 shadow-seeded-2"
                              : "opacity-50"
                            : hit
                              ? "border-grass/30 bg-card shadow-soft"
                              : "opacity-60"
                        )}
                        style={freshlyUnlocked && isSeeded ? { boxShadow: "var(--s-elevation-2), 0 0 32px rgb(var(--c-primary) / 0.4)" } : undefined}
                      >
                        <span
                          className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-2xl",
                            hit ? "text-white" : "bg-cream text-stone-light"
                          )}
                          style={hit && isSeeded ? { background: "var(--s-accent-gradient)" } : hit ? { background: "rgb(var(--c-primary))" } : undefined}
                        >
                          {hit ? <CheckCircle2 className="h-5 w-5" /> : <Award className="h-5 w-5" />}
                        </span>
                        <h3 className={cn("mt-4 font-medium text-ink", isSeeded && "font-seeded")}>{item.title}</h3>
                        <p className="mt-1 text-xs text-stone">
                          {hit
                            ? `Earned ${formatDate(hit.earnedAt)}`
                            : "Not earned yet"}
                        </p>
                        {hit && (
                          <Badge
                            size="sm"
                            variant={isSeeded ? undefined : "lime"}
                            className="mt-3"
                            style={isSeeded ? { background: "var(--s-accent-gradient)", color: "white" } : undefined}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Unlocked
                          </Badge>
                        )}
                      </Card>
                    </motion.div>
                  );
                })}
            </div>
          </section>
        ))
        )}
      </div>
    </div>
  );
}
