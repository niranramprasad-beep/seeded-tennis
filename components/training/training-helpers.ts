// Pure, non-visual training-planner logic: plan/session generation, date
// math, and small formatting helpers. No React here — split out of
// training-view.tsx so the stateful orchestrator isn't tangled up with
// logic that has nothing to do with rendering.

import type { Intensity, Weakness, WeekdayShort } from "@/lib/types";
import { ordinalGrade } from "@/lib/time";
import {
  createUuid,
  type TrainingFolder,
  type TrainingPlannerSession,
  type TrainingPreferences,
  type TrainingSessionType,
} from "@/lib/supabase/training";

export const WEEK_ORDER: WeekdayShort[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const DEFAULT_TYPES: TrainingSessionType[] = [
  { id: "tennis", label: "Tennis", color: "#2D4A2B", bg: "bg-grass-50", text: "text-grass" },
  { id: "strength", label: "Strength", color: "#97C459", bg: "bg-[#EAF2DA]", text: "text-grass-900" },
  { id: "conditioning", label: "Conditioning", color: "#CDB52E", bg: "bg-[#FAF4D2]", text: "text-[#6B6A2E]" },
  { id: "recovery", label: "Recovery", color: "#BBC79B", bg: "bg-[#EEF1E3]", text: "text-stone" },
  { id: "match-prep", label: "Match prep", color: "#4F6F52", bg: "bg-grass-100", text: "text-grass-900" },
  { id: "mobility", label: "Mobility", color: "#8EA58B", bg: "bg-[#EEF5EC]", text: "text-grass" },
  { id: "mental", label: "Mental work", color: "#6B6B5F", bg: "bg-[#ECEAE2]", text: "text-stone" },
];

export function blankSession(day: WeekdayShort, typeId: string): TrainingPlannerSession {
  return {
    id: createUuid(),
    title: "",
    typeId,
    day,
    date: dateForWeekday(day),
    startTime: "16:00",
    duration: 90,
    intensity: "moderate",
    notes: "",
    goals: "",
    drills: [],
    completed: false,
  };
}

export function generatePersonalizedPlan({
  preferences,
  playerUtr,
  grade,
  weaknesses,
}: {
  preferences: TrainingPreferences;
  playerUtr: number;
  grade: number;
  weaknesses: Weakness[];
}): { sessions: TrainingPlannerSession[]; plan: TrainingFolder } {
  const hours = Math.max(preferences.fullTime ? 15 : 4, preferences.weeklyHours);
  const focus = weaknesses.length ? weaknesses : ["serve", "fitness", "mental"];
  const tennisHours = Math.round(hours * (preferences.fullTime ? 0.58 : 0.5));
  const strengthHours = Math.max(1.5, Math.round(hours * 0.16));
  const matchHours = Math.max(2, Math.round(hours * 0.18));
  const recoveryHours = Math.max(1, hours - tennisHours - strengthHours - matchHours);

  const intensity: Intensity = playerUtr >= 10 || preferences.fullTime ? "high" : "moderate";
  const sessions: TrainingPlannerSession[] = [
    makeGeneratedSession("Mon", "15:30", Math.round((tennisHours / 3) * 60), "tennis", `${sentence(focus[0])} pattern block`, intensity, focus.slice(0, 2), preferences),
    makeGeneratedSession("Tue", "16:30", Math.round(strengthHours * 60), "strength", "Strength + movement base", "moderate", ["fitness"], preferences),
    makeGeneratedSession("Wed", "15:30", Math.round((tennisHours / 3) * 60), "tennis", `${sentence(focus[1] ?? focus[0])} pressure reps`, intensity, focus.slice(1, 3), preferences),
    makeGeneratedSession("Thu", "17:00", Math.round(recoveryHours * 60), "recovery", "Recovery + mobility reset", "low", ["fitness", "mental"], preferences),
    makeGeneratedSession("Fri", "15:30", Math.round((tennisHours / 3) * 60), "tennis", "Serve plus first-ball patterns", intensity, ["serve", focus[0]], preferences),
    makeGeneratedSession("Sat", "10:00", Math.round(matchHours * 60), "match-prep", "Filmed set play", "high", ["mental", "fitness"], preferences),
  ].filter((session) => session.duration >= 30);

  if (preferences.fullTime && hours >= 18) {
    sessions.splice(
      3,
      0,
      makeGeneratedSession("Thu", "15:30", 90, "conditioning", "Speed + repeat sprint conditioning", "high", ["fitness"], preferences)
    );
  }

  const plan = {
    id: createUuid(),
    name: `${hours}h personalized recruiting week`,
    goal: `${preferences.primaryGoal} from a ${ordinalGrade(grade)} grade, UTR ${playerUtr.toFixed(1)} baseline by the summer before senior year.`,
    sessionIds: sessions.map((session) => session.id),
  };

  return { sessions, plan };
}

export function makeGeneratedSession(
  day: WeekdayShort,
  startTime: string,
  duration: number,
  typeId: string,
  title: string,
  intensity: Intensity,
  focusAreas: string[],
  preferences: TrainingPreferences
): TrainingPlannerSession {
  return {
    id: createUuid(),
    title,
    typeId,
    day,
    date: dateForWeekday(day),
    startTime,
    duration: Math.max(30, Math.round(duration / 15) * 15),
    intensity,
    notes: preferences.constraints,
    goals: preferences.primaryGoal,
    drills: focusAreas.map((focus) => `${sentence(focus)} progression`).slice(0, 3),
    completed: false,
  };
}

export type TemplateKey = "taper" | "build" | "recovery";

export const TEMPLATE_DEFINITIONS: {
  key: TemplateKey;
  name: string;
  description: string;
  goal: string;
}[] = [
  {
    key: "taper",
    name: "Tournament taper",
    description: "Lower volume, sharper reps, and a simulated match before you compete.",
    goal: "Arrive at the tournament fresh, not over-trained.",
  },
  {
    key: "build",
    name: "UTR build week",
    description: "High-volume tennis with a filmed match-play block to move your rating.",
    goal: "Push UTR with pressure reps and a recorded set.",
  },
  {
    key: "recovery",
    name: "Recovery reset",
    description: "A light, low-intensity week to reset the body after a heavy stretch.",
    goal: "Rebuild volume without losing the week entirely.",
  },
];

// Canned, ready-to-edit weeks for the Templates drawer — distinct from the
// personalized plan generated from the onboarding questionnaire.
export function buildTemplateSessions(
  key: TemplateKey,
  preferences: TrainingPreferences
): TrainingPlannerSession[] {
  if (key === "taper") {
    return [
      makeGeneratedSession("Mon", "15:30", 60, "tennis", "Serve + return taper reps", "moderate", ["serve"], preferences),
      makeGeneratedSession("Tue", "16:00", 45, "recovery", "Mobility + light hitting", "low", ["fitness"], preferences),
      makeGeneratedSession("Wed", "15:30", 90, "match-prep", "Simulated match, best of three", "moderate", ["mental"], preferences),
      makeGeneratedSession("Thu", "16:00", 30, "recovery", "Full recovery day", "low", ["fitness"], preferences),
      makeGeneratedSession("Fri", "15:30", 60, "tennis", "Sharpen patterns, no overload", "moderate", ["match play"], preferences),
      makeGeneratedSession("Sat", "10:00", 120, "match-prep", "Tournament day one", "high", ["mental", "match play"], preferences),
    ];
  }
  if (key === "build") {
    return [
      makeGeneratedSession("Mon", "15:30", 90, "tennis", "Pattern + pressure reps", "high", ["serve"], preferences),
      makeGeneratedSession("Tue", "16:30", 60, "strength", "Strength + movement base", "moderate", ["fitness"], preferences),
      makeGeneratedSession("Wed", "15:30", 90, "tennis", "Live-ball pressure sets", "high", ["backhand"], preferences),
      makeGeneratedSession("Thu", "16:00", 45, "conditioning", "Repeat-sprint conditioning", "moderate", ["fitness"], preferences),
      makeGeneratedSession("Fri", "15:30", 90, "tennis", "Serve + first-ball combos", "high", ["serve"], preferences),
      makeGeneratedSession("Sat", "10:00", 120, "match-prep", "Filmed set play", "high", ["mental", "match play"], preferences),
      makeGeneratedSession("Sun", "11:00", 30, "recovery", "Recovery + mobility", "low", ["fitness"], preferences),
    ];
  }
  return [
    makeGeneratedSession("Mon", "16:00", 45, "recovery", "Mobility + light footwork", "low", ["fitness"], preferences),
    makeGeneratedSession("Tue", "16:00", 30, "mental", "Visualization + goal review", "low", ["mental"], preferences),
    makeGeneratedSession("Wed", "15:30", 45, "tennis", "Easy rally, no drilling pressure", "low", ["match play"], preferences),
    makeGeneratedSession("Thu", "16:00", 45, "recovery", "Full body mobility + stretch", "low", ["fitness"], preferences),
    makeGeneratedSession("Fri", "15:30", 60, "tennis", "Light technical tune-up", "moderate", ["forehand"], preferences),
  ];
}

export function getType(types: TrainingSessionType[], id: string): TrainingSessionType {
  return types.find((t) => t.id === id) ?? types[0] ?? DEFAULT_TYPES[0];
}

export function dateForWeekday(day: WeekdayShort, weekOffset = 0): string {
  const now = new Date();
  const current = (now.getDay() + 6) % 7;
  const target = WEEK_ORDER.indexOf(day);
  const date = new Date(now);
  date.setDate(now.getDate() + (target - current) + weekOffset * 7);
  return date.toISOString().slice(0, 10);
}

export function weekLabel(weekOffset: number): string {
  const start = new Date(`${dateForWeekday("Mon", weekOffset)}T00:00:00`);
  const end = new Date(`${dateForWeekday("Sun", weekOffset)}T00:00:00`);
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (weekOffset === 0) return `This week, ${startLabel} - ${endLabel}`;
  if (weekOffset === -1) return `Last week, ${startLabel} - ${endLabel}`;
  if (weekOffset === 1) return `Next week, ${startLabel} - ${endLabel}`;
  return `${startLabel} - ${endLabel}`;
}

export function sentence(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function recommendation(utr: number, sessions: TrainingPlannerSession[], grade: number): string {
  const matchPrep = sessions.filter((s) => s.typeId === "match-prep").length;
  const recovery = sessions.filter((s) => s.typeId === "recovery").length;
  if (matchPrep === 0) {
    return `Add one match-prep block this week. At UTR ${utr.toFixed(1)}, coaches need to see point patterns under pressure, not just clean drilling.`;
  }
  if (recovery === 0) {
    return `Protect one recovery session. ${ordinalGrade(grade)} grade recruiting weeks only work if the body can repeat quality sessions.`;
  }
  return `This plan is balanced. The best upgrade is a short filmed set after your highest-intensity session.`;
}
