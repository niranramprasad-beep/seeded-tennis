"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, MapPin, Trophy } from "lucide-react";
import type { Tournament } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Filter = "all" | "completed" | "upcoming";

const STATUS_STYLE: Record<
  Tournament["status"],
  { label: string; variant: "leaf" | "default" | "muted" }
> = {
  completed: { label: "Completed", variant: "leaf" },
  registered: { label: "Registered", variant: "default" },
  upcoming: { label: "Upcoming", variant: "muted" },
};

export function TournamentProgress({
  tournaments,
  played,
  goal,
}: {
  tournaments: Tournament[];
  played: number;
  goal: number;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const pct = Math.round((played / goal) * 100);

  const filtered = useMemo(() => {
    const list = [...tournaments].sort((a, b) => a.date.localeCompare(b.date));
    if (filter === "completed") return list.filter((t) => t.status === "completed");
    if (filter === "upcoming") return list.filter((t) => t.status !== "completed");
    return list;
  }, [tournaments, filter]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-gradient-to-br from-grass to-grass-800 p-6 text-cream">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cream/14 text-leaf-accent">
            <Trophy className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-medium">Tournament progress</h2>
            <p className="text-sm text-cream/70">
              Your count vs. this season&apos;s goal
            </p>
          </div>
        </div>
        <span className="text-2xl font-light">
          {played}
          <span className="text-cream/50">/{goal}</span>
        </span>
      </div>

      <div className="mt-5">
        <Progress value={pct} />
        <div className="mt-2 flex justify-between text-xs text-cream/60">
          <span>{played} played</span>
          <span>{Math.max(0, goal - played)} to reach your goal</span>
        </div>
      </div>
      </div>

      {/* example calendar — sample events, not the player's own history */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 pt-5">
        <div>
          <p className="text-sm font-medium text-ink">Example season calendar</p>
          <p className="text-xs text-stone-light">
            A balanced L1-L6 schedule to model yours on — not your logged events.
          </p>
        </div>
      </div>
      <div className="flex gap-2 px-6 pt-3">
        {(["all", "completed", "upcoming"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-pill px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              filter === f
                ? "bg-grass text-cream"
                : "bg-grass-50 text-stone hover:text-ink"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* drillable list */}
      <div className="flex flex-col gap-2 p-6 pt-4">
        {filtered.map((t) => {
          const open = openId === t.id;
          const status = STATUS_STYLE[t.status];
          return (
            <div
              key={t.id}
              className="overflow-hidden rounded-[18px] border-[0.5px] border-line bg-card"
            >
              <button
                onClick={() => setOpenId(open ? null : t.id)}
                className="flex w-full items-center gap-3 bg-card px-3.5 py-3 text-left transition-colors hover:bg-grass-50/50"
              >
                <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg bg-grass-50 text-xs font-semibold text-grass">
                  {t.level}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                  <p className="text-xs text-stone-light">{fmtDate(t.date)}</p>
                </div>
                <Badge variant={status.variant} size="sm">
                  {status.label}
                </Badge>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-stone-light transition-transform",
                    open && "rotate-180"
                  )}
                />
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden bg-cream/40"
                  >
                    <div className="grid grid-cols-2 gap-3 px-3.5 py-3 text-sm sm:grid-cols-4">
                      <Detail label="Level" value={t.level} />
                      <Detail label="Surface" value={t.surface} />
                      <Detail
                        label="Location"
                        value={`${t.city}, ${t.state}`}
                        icon
                      />
                      <Detail label="Status" value={status.label} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-stone-light">
            No tournaments in this view.
          </p>
        )}
      </div>
    </Card>
  );
}

function Detail({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: boolean;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] text-stone-light">
        {icon && <MapPin className="h-3 w-3" />}
        {label}
      </p>
      <p className="mt-0.5 font-medium text-ink">{value}</p>
    </div>
  );
}
