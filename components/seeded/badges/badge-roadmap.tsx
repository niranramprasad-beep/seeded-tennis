"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, Check, Flame, Lock, Mail, Trophy, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EarnedBadge } from "@/lib/supabase/features";
import type { BadgeDef, BadgeType } from "@/lib/badges";
import { ConfettiBurst } from "@/components/seeded/shared/confetti-burst";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

interface UnitMeta {
  type: BadgeType;
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

const UNITS: UnitMeta[] = [
  { type: "UTR", title: "UTR Trajectory", subtitle: "Your rating, climbing", icon: TrendingUp },
  { type: "Tournament", title: "Tournament Record", subtitle: "Every event you enter", icon: Trophy },
  { type: "Match", title: "Match Play", subtitle: "Wins, streaks, upsets", icon: Flame },
  { type: "Training", title: "Training Streak", subtitle: "Showing up, daily", icon: Calendar },
  { type: "Recruiting", title: "Recruiting Outreach", subtitle: "Getting on coaches' radar", icon: Mail },
];

// Repeating horizontal-offset pattern (as a fraction of the path's
// amplitude) that produces the winding Duolingo-style snake. An 8-step
// period reads as a smooth wave without ever reversing too sharply.
const WAVE = [0, 0.55, 0.9, 0.55, 0, -0.55, -0.9, -0.55];

const NODE = 68;
const NODE_NARROW = 56;
const GAP_Y = 112;
const GAP_Y_NARROW = 90;
const AMPLITUDE = 96;
const AMPLITUDE_NARROW = 48;

function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export function SeededBadgeRoadmap({
  catalog,
  earnedMap,
  justUnlocked,
}: {
  catalog: BadgeDef[];
  earnedMap: Map<string, EarnedBadge>;
  justUnlocked: Set<string>;
}) {
  const narrow = useIsNarrow();
  const [selected, setSelected] = useState<Record<BadgeType, string | null>>({
    UTR: null,
    Tournament: null,
    Match: null,
    Training: null,
    Recruiting: null,
  });

  return (
    <div className="space-y-16">
      {UNITS.map((unit) => (
        <BadgeUnitPath
          key={unit.type}
          unit={unit}
          items={catalog.filter((b) => b.type === unit.type)}
          earnedMap={earnedMap}
          justUnlocked={justUnlocked}
          narrow={narrow}
          selectedKey={selected[unit.type]}
          onSelect={(key) => setSelected((prev) => ({ ...prev, [unit.type]: key === prev[unit.type] ? null : key }))}
        />
      ))}
    </div>
  );
}

function BadgeUnitPath({
  unit,
  items,
  earnedMap,
  justUnlocked,
  narrow,
  selectedKey,
  onSelect,
}: {
  unit: UnitMeta;
  items: BadgeDef[];
  earnedMap: Map<string, EarnedBadge>;
  justUnlocked: Set<string>;
  narrow: boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const gradId = useId();
  const node = narrow ? NODE_NARROW : NODE;
  const gapY = narrow ? GAP_Y_NARROW : GAP_Y;
  const amplitude = narrow ? AMPLITUDE_NARROW : AMPLITUDE;

  const width = amplitude * 2 + node;
  const centerX = width / 2;

  const centers = useMemo(
    () =>
      items.map((_, i) => ({
        x: centerX + WAVE[i % WAVE.length] * amplitude,
        y: gapY * i + node / 2 + 12,
      })),
    // items comes from a static catalog filtered by type — its length never
    // changes for a mounted unit, so depending on the array reference would
    // only recompute on every render for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length, centerX, amplitude, gapY, node]
  );
  const height = centers.length ? centers[centers.length - 1].y + node / 2 + 16 : node;

  const doneFlags = items.map((it) => earnedMap.has(it.key));
  const earnedCount = doneFlags.filter(Boolean).length;
  const pct = items.length ? Math.round((earnedCount / items.length) * 100) : 0;
  let lastDoneIndex = -1;
  doneFlags.forEach((d, i) => {
    if (d) lastDoneIndex = i;
  });
  // Thresholds are cumulative, so "earned" is normally a clean prefix of the
  // list — the first gap in that prefix is the honest "next up" milestone.
  // (Match's two independent one-off badges can break that prefix; worst
  // case the pulse highlights a slightly-wrong node in a 3-item unit, never
  // a broken render.)
  const frontierIndex = doneFlags.findIndex((d) => !d);

  const selectedItem = items.find((it) => it.key === selectedKey);
  const selectedHit = selectedItem ? earnedMap.get(selectedItem.key) : undefined;
  const UnitIcon = unit.icon;

  return (
    <section>
      <div className="sticky top-14 z-10 mb-7 lg:top-4">
        <div className="seeded-glass flex items-center gap-4 rounded-2xl p-4 shadow-seeded-1">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: "var(--s-accent-gradient)" }}
          >
            <UnitIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-seeded text-base font-semibold text-ink">{unit.title}</h2>
            <p className="truncate font-seeded text-xs text-stone-light">{unit.subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="font-mono text-xs font-medium text-stone">
              {earnedCount}/{items.length}
            </span>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[rgb(var(--c-primary)/0.12)]">
              <span
                className="block h-full rounded-full"
                style={{ width: `${pct}%`, background: "var(--s-accent-gradient)" }}
              />
            </span>
          </div>
        </div>
      </div>

      <div style={{ position: "relative", width, height, margin: "0 auto" }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0" style={{ pointerEvents: "none" }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--c-tennis))" />
              <stop offset="100%" stopColor="rgb(var(--c-primary))" />
            </linearGradient>
          </defs>
          {centers.length > 1 && (
            <polyline
              points={centers.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="rgb(var(--c-line))"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="1 16"
            />
          )}
          {lastDoneIndex > 0 && (
            <polyline
              points={centers.slice(0, lastDoneIndex + 1).map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        {items.map((item, i) => {
          const c = centers[i];
          const done = doneFlags[i];
          const isFrontier = i === frontierIndex;
          const fresh = done && justUnlocked.has(item.key);
          const isSelected = selectedKey === item.key;
          return (
            <div
              key={item.key}
              style={{ position: "absolute", left: c.x - node / 2, top: c.y - node / 2, width: node, height: node }}
            >
              {fresh && <ConfettiBurst />}
              <motion.button
                type="button"
                onClick={() => onSelect(item.key)}
                aria-label={item.title}
                aria-pressed={isSelected}
                animate={isFrontier ? { scale: [1, 1.07, 1] } : { scale: 1 }}
                transition={isFrontier ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
                className={cn(
                  "relative flex items-center justify-center rounded-full transition-shadow",
                  done ? "text-white" : isFrontier ? "text-ink" : "text-stone-light"
                )}
                style={{
                  width: node,
                  height: node,
                  background: done
                    ? "var(--s-accent-gradient)"
                    : isFrontier
                      ? "var(--c-card)"
                      : "rgb(var(--c-line) / 0.5)",
                  border: isFrontier ? "2px solid rgb(var(--c-primary))" : done ? "none" : "2px solid rgb(var(--c-line))",
                  boxShadow: done
                    ? "var(--s-elevation-1)"
                    : isFrontier
                      ? "0 0 0 5px rgb(var(--c-primary) / 0.12)"
                      : "none",
                  outline: isSelected ? "3px solid rgb(var(--c-tennis))" : "none",
                  outlineOffset: 2,
                }}
              >
                {done ? (
                  <Check className="h-6 w-6" />
                ) : isFrontier ? (
                  <unit.icon className="h-5 w-5" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
              </motion.button>
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {selectedItem && (
          <motion.div
            key={selectedItem.key}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="seeded-glass mx-auto mt-5 max-w-sm rounded-2xl p-4 shadow-seeded-1"
          >
            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
                style={{
                  background: selectedHit ? "var(--s-accent-gradient)" : "rgb(var(--c-line) / 0.6)",
                  color: selectedHit ? "#fff" : "rgb(var(--c-stone-light))",
                }}
              >
                {selectedHit ? <Check className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-seeded text-sm font-semibold text-ink">{selectedItem.title}</p>
                <p className="mt-0.5 text-xs text-stone">{selectedItem.description}</p>
                <p className="mt-1.5 font-mono text-[11px] text-stone-light">
                  {selectedHit ? `Earned ${formatDate(selectedHit.earnedAt)}` : "Keep going to unlock this one"}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
