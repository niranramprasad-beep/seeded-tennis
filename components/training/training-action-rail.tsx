"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { LayoutList, Settings, Sparkles, Trophy } from "lucide-react";
import type { TrainingPreferences } from "@/lib/supabase/training";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ordinalGrade } from "@/lib/time";
import { inputClass, textAreaClass, type PlannerView } from "./training-shared-ui";

export function TrainingActionRail({
  view,
  setView,
  onNewPlan,
  onTemplates,
  onProgress,
  onSettings,
}: {
  view: PlannerView;
  setView: (v: PlannerView) => void;
  onNewPlan: () => void;
  onTemplates: () => void;
  onProgress: () => void;
  onSettings: () => void;
}) {
  const actions = [
    { label: "New plan", icon: LayoutList, onClick: onNewPlan },
    { label: "Templates", icon: Sparkles, onClick: onTemplates },
    { label: "Progress", icon: Trophy, onClick: onProgress },
    { label: "Settings", icon: Settings, onClick: onSettings },
  ];

  return (
    <aside className="xl:sticky xl:top-32 xl:self-start">
      <Card className="p-5">
        <p className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-light">
          Calendar view
        </p>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-2xl px-3 py-2.5 text-xs font-medium capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-grass/30",
                view === v ? "bg-grass text-cream" : "bg-grass-50 text-stone hover:text-ink"
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-1 border-t-[0.5px] border-line pt-4">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-left text-sm text-stone transition-colors hover:bg-grass-50 hover:text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
            >
              <a.icon className="h-4 w-4 text-grass" />
              {a.label}
            </button>
          ))}
        </div>
      </Card>
    </aside>
  );
}

export function TrainingQuestionnaire({
  playerName,
  currentUtr,
  grade,
  onComplete,
}: {
  playerName: string;
  currentUtr: number;
  grade: number;
  onComplete: (preferences: TrainingPreferences) => void;
}) {
  const [fullTime, setFullTime] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState(10);
  const [primaryGoal, setPrimaryGoal] = useState("Raise my UTR before summer recruiting checkpoints");
  const [constraints, setConstraints] = useState("");

  const suggested = fullTime ? Math.max(15, weeklyHours) : weeklyHours;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl overflow-hidden rounded-[24px] border-[0.5px] border-line bg-card shadow-lift"
    >
      <div className="bg-grass px-6 py-8 text-cream sm:px-9">
        <p className="font-serif text-lg italic text-leaf-accent">Training setup</p>
        <h1 className="mt-2 text-3xl font-light tracking-tight sm:text-5xl">
          Build a real week for {playerName}.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream/78">
          No canned plan. Seeded will use your UTR {currentUtr.toFixed(1)}, {ordinalGrade(grade)} grade timeline,
          training load, and goals to create the first week.
        </p>
      </div>
      <div className="space-y-7 p-6 sm:p-9">
        <div>
          <p className="text-sm font-medium text-ink">Are you training full-time right now?</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              { value: true, title: "Yes, full-time", body: "Usually 15+ focused hours per week." },
              { value: false, title: "No, school-balanced", body: "I need tennis to fit around school." },
            ].map((option) => (
              <button
                key={option.title}
                onClick={() => {
                  setFullTime(option.value);
                  if (option.value && weeklyHours < 15) setWeeklyHours(15);
                }}
                className={cn(
                  "rounded-card border-[0.5px] p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-grass/30",
                  fullTime === option.value
                    ? "border-grass bg-grass-50 shadow-soft"
                    : "border-line bg-cream/50 hover:bg-card hover:shadow-soft"
                )}
              >
                <p className="font-medium text-ink">{option.title}</p>
                <p className="mt-1 text-sm text-stone">{option.body}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">How many hours per week do you want to train?</p>
              <p className="mt-1 text-sm text-stone">
                Full-time plans start at 15 hours. You can edit every session later.
              </p>
            </div>
            <span className="text-3xl font-light text-grass">{suggested}h</span>
          </div>
          <input
            type="range"
            min={fullTime ? 15 : 4}
            max={24}
            value={suggested}
            onChange={(event) => setWeeklyHours(Number(event.target.value))}
            className="seeded-range mt-4 bg-grass-100"
          />
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Main goal for this block</span>
          <input
            value={primaryGoal}
            onChange={(event) => setPrimaryGoal(event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Schedule limits or notes</span>
          <textarea
            value={constraints}
            onChange={(event) => setConstraints(event.target.value)}
            placeholder="Example: school ends at 3:30, tournament most Saturdays, no gym on Wednesdays"
            className={textAreaClass}
          />
        </label>

        <Button
          size="lg"
          className="w-full"
          onClick={() =>
            onComplete({
              fullTime,
              weeklyHours: suggested,
              primaryGoal,
              constraints,
            })
          }
        >
          Generate my training week
          <Sparkles className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}
