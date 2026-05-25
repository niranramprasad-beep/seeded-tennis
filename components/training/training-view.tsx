"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Dumbbell,
  GripVertical,
  LayoutList,
  Plus,
  Settings,
  Sparkles,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import type { Intensity, TrainingPlan, WeekdayShort } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { AuthGate } from "@/components/shared/auth-gate";
import { PaidGate } from "@/components/shared/paid-gate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { HoursDonutChart } from "@/components/charts/hours-donut-chart";
import { cn } from "@/lib/utils";
import {
  createUuid,
  loadTrainingPlannerState,
  saveTrainingPlannerState,
  saveTrainingTemplate,
  type SavedTrainingTemplate,
  type TrainingFolder,
  type TrainingPlannerSession,
  type TrainingPlannerState,
  type TrainingSessionType,
} from "@/lib/supabase/training";

const WEEK_ORDER: WeekdayShort[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type PlannerView = "day" | "week" | "month";
type PlannerDrawer = "session" | "plan" | "templates" | "progress" | "settings" | null;

const DEFAULT_TYPES: TrainingSessionType[] = [
  { id: "tennis", label: "Tennis", color: "#2D4A2B", bg: "bg-grass-50", text: "text-grass" },
  { id: "strength", label: "Strength", color: "#97C459", bg: "bg-[#EAF2DA]", text: "text-grass-900" },
  { id: "conditioning", label: "Conditioning", color: "#CDB52E", bg: "bg-[#FAF4D2]", text: "text-[#6B6A2E]" },
  { id: "recovery", label: "Recovery", color: "#BBC79B", bg: "bg-[#EEF1E3]", text: "text-stone" },
  { id: "match-prep", label: "Match prep", color: "#4F6F52", bg: "bg-grass-100", text: "text-grass-900" },
  { id: "mobility", label: "Mobility", color: "#8EA58B", bg: "bg-[#EEF5EC]", text: "text-grass" },
  { id: "mental", label: "Mental work", color: "#6B6B5F", bg: "bg-[#ECEAE2]", text: "text-stone" },
];

const inputClass =
  "h-11 w-full rounded-xl border-[0.5px] border-line bg-card px-3.5 text-sm text-ink placeholder:text-stone-light transition-colors focus:outline-none focus:ring-2 focus:ring-grass/30";
const textAreaClass =
  "min-h-[92px] w-full rounded-xl border-[0.5px] border-line bg-card px-3.5 py-3 text-sm text-ink placeholder:text-stone-light transition-colors focus:outline-none focus:ring-2 focus:ring-grass/30";

export function TrainingView({ plans }: { plans: TrainingPlan[] }) {
  return (
    <AuthGate>
      <PaidGate
        required="player"
        feature="Training"
        blurb="Build your full training week, save custom session types, and keep court work, fitness, match play, and recovery in balance."
        perks={[
          "Create sessions with time, duration, goals, notes and drills",
          "Drag sessions between days and mark work complete",
          "Save reusable custom session types",
          "Organize sessions into full training plans",
        ]}
      >
        <TrainingInner plans={plans} />
      </PaidGate>
    </AuthGate>
  );
}

function TrainingInner({ plans }: { plans: TrainingPlan[] }) {
  const { player } = usePlayer();
  const storageKey = `seeded.training.${player.name.replace(/\s+/g, "-").toLowerCase()}`;

  const basePlan = useMemo(
    () =>
      plans.reduce((best, p) =>
        Math.abs(p.utrLevel - player.currentUTR) < Math.abs(best.utrLevel - player.currentUTR)
          ? p
          : best
      ),
    [plans, player.currentUTR]
  );

  const initialState = useMemo<TrainingPlannerState>(() => {
    const sessions = basePlan.days.flatMap((day, dayIndex) =>
      day.activities.map((a, i) => ({
        id: createUuid(),
        title: a.title,
        typeId:
          a.type === "court"
            ? "tennis"
            : a.type === "gym"
              ? "strength"
              : a.type === "match"
                ? "match-prep"
                : a.type === "mental"
                  ? "mental"
                  : "recovery",
        day: day.day,
        date: dateForWeekday(day.day),
        startTime: `${String(15 + ((dayIndex + i) % 4)).padStart(2, "0")}:00`,
        duration: Math.round(a.hours * 60),
        intensity: a.intensity,
        notes: a.detail,
        goals: a.focusAreas.length ? a.focusAreas.join(", ") : "Build reliable reps and leave with one clear takeaway.",
        drills: a.focusAreas.map((f) => `${sentence(f)} block`).slice(0, 3),
        completed: dayIndex < 2 && i === 0,
      }))
    );
    return {
      sessions,
      sessionTypes: DEFAULT_TYPES,
      plans: [
        {
          id: createUuid(),
          name: `${player.currentUTR.toFixed(1)} UTR build week`,
          goal: `Close the gap toward ${player.targetSchoolSlugs.length ? "target-school" : "college"} roster pace without overloading recovery.`,
          sessionIds: sessions.map((s) => s.id),
        },
      ],
      activePlanId: "",
      templates: [],
    };
  }, [basePlan, player.currentUTR, player.targetSchoolSlugs.length]);

  const normalizedInitialState = useMemo<TrainingPlannerState>(() => {
    const firstPlanId = initialState.plans[0]?.id ?? createUuid();
    return {
      ...initialState,
      activePlanId: initialState.activePlanId || firstPlanId,
      plans:
        initialState.plans.length > 0
          ? initialState.plans
          : [{ id: firstPlanId, name: "Training plan", goal: "", sessionIds: [] }],
    };
  }, [initialState]);

  const [state, setState] = useState<TrainingPlannerState>(normalizedInitialState);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"local" | "loading" | "saved" | "saving" | "error">("loading");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [view, setView] = useState<PlannerView>("week");
  const [selectedDay, setSelectedDay] = useState<WeekdayShort>("Mon");
  const [drawer, setDrawer] = useState<PlannerDrawer>(null);
  const [editingSession, setEditingSession] = useState<TrainingPlannerSession | null>(null);
  const [editingPlan, setEditingPlan] = useState<TrainingFolder | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setState(JSON.parse(raw) as TrainingPlannerState);
    } catch {
      // Ignore malformed localStorage and keep the generated seed plan.
    }

    async function loadRemote() {
      try {
        const remote = await loadTrainingPlannerState(normalizedInitialState);
        if (cancelled) return;
        if (remote) {
          setState(remote);
          setSyncStatus("saved");
        } else {
          setSyncStatus("local");
        }
      } catch (error) {
        if (!cancelled) {
          setSyncStatus("error");
          setSyncError(error instanceof Error ? error.message : "Could not load training data.");
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    loadRemote();
    return () => {
      cancelled = true;
    };
  }, [normalizedInitialState, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(storageKey, JSON.stringify(state));
    let cancelled = false;
    async function saveRemote() {
      try {
        setSyncStatus("saving");
        setSyncError(null);
        await saveTrainingPlannerState(state);
        if (!cancelled) setSyncStatus("saved");
      } catch (error) {
        if (!cancelled) {
          setSyncStatus("error");
          setSyncError(error instanceof Error ? error.message : "Could not save training data.");
        }
      }
    }
    saveRemote();
    return () => {
      cancelled = true;
    };
  }, [hydrated, state, storageKey]);

  const activePlan = state.plans.find((p) => p.id === state.activePlanId) ?? state.plans[0];
  const activeSessions = state.sessions.filter((s) => activePlan?.sessionIds.includes(s.id));
  const sessionsByDay = useMemo(() => {
    const map = new Map<WeekdayShort, TrainingPlannerSession[]>();
    WEEK_ORDER.forEach((d) => map.set(d, []));
    activeSessions
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .forEach((s) => map.get(s.day)?.push(s));
    return map;
  }, [activeSessions]);

  const totalMinutes = activeSessions.reduce((sum, s) => sum + s.duration, 0);
  const completedMinutes = activeSessions.filter((s) => s.completed).reduce((sum, s) => sum + s.duration, 0);
  const progress = totalMinutes ? Math.round((completedMinutes / totalMinutes) * 100) : 0;
  const recommendedHours = Math.max(basePlan.weeklyHours, player.currentUTR + 2);

  const donutData = useMemo(() => {
    const totals = new Map<string, number>();
    activeSessions.forEach((s) => totals.set(s.typeId, (totals.get(s.typeId) ?? 0) + s.duration / 60));
    return Array.from(totals.entries()).map(([typeId, value]) => {
      const type = getType(state.sessionTypes, typeId);
      return { name: type.label, value: Math.round(value * 10) / 10, color: type.color };
    });
  }, [activeSessions, state.sessionTypes]);

  const openNewSession = (day = selectedDay) => {
    setSelectedDay(day);
    setEditingSession(null);
    setDrawer("session");
  };

  const saveSession = (session: TrainingPlannerSession) => {
    setState((prev) => {
      const exists = prev.sessions.some((s) => s.id === session.id);
      const sessions = exists
        ? prev.sessions.map((s) => (s.id === session.id ? session : s))
        : [...prev.sessions, session];
      const plans = prev.plans.map((plan) =>
        plan.id === prev.activePlanId && !plan.sessionIds.includes(session.id)
          ? { ...plan, sessionIds: [...plan.sessionIds, session.id] }
          : plan
      );
      return { ...prev, sessions, plans };
    });
    setDrawer(null);
    setEditingSession(null);
  };

  const deleteSession = (id: string) => {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.filter((s) => s.id !== id),
      plans: prev.plans.map((p) => ({ ...p, sessionIds: p.sessionIds.filter((sid) => sid !== id) })),
    }));
    setDrawer(null);
  };

  const moveSession = (sessionId: string, day: WeekdayShort) => {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === sessionId ? { ...s, day, date: dateForWeekday(day) } : s)),
    }));
    setDraggingId(null);
  };

  const toggleComplete = (id: string) => {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)),
    }));
  };

  const savePlan = (name: string, goal: string) => {
    if (editingPlan) {
      setState((prev) => ({
        ...prev,
        plans: prev.plans.map((plan) =>
          plan.id === editingPlan.id ? { ...plan, name, goal } : plan
        ),
      }));
      setEditingPlan(null);
      setDrawer(null);
      return;
    }
    const id = createUuid();
    setState((prev) => ({
      ...prev,
      plans: [...prev.plans, { id, name, goal, sessionIds: [] }],
      activePlanId: id,
    }));
    setDrawer(null);
  };

  const duplicateActivePlan = () => {
    if (!activePlan) return;
    const copiedSessions = activeSessions.map((session) => ({
      ...session,
      id: createUuid(),
      title: `${session.title} copy`,
      completed: false,
    }));
    const id = createUuid();
    setState((prev) => ({
      ...prev,
      sessions: [...prev.sessions, ...copiedSessions],
      plans: [
        ...prev.plans,
        {
          id,
          name: `${activePlan.name} copy`,
          goal: activePlan.goal,
          sessionIds: copiedSessions.map((session) => session.id),
        },
      ],
      activePlanId: id,
    }));
  };

  const deleteActivePlan = () => {
    if (!activePlan || state.plans.length <= 1) return;
    const idsToDelete = new Set(activePlan.sessionIds);
    const remainingPlans = state.plans.filter((plan) => plan.id !== activePlan.id);
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.filter((session) => !idsToDelete.has(session.id)),
      plans: remainingPlans,
      activePlanId: remainingPlans[0]?.id ?? prev.activePlanId,
    }));
  };

  const saveTemplateFromSession = async (session: TrainingPlannerSession) => {
    const template: Omit<SavedTrainingTemplate, "id"> = {
      name: session.title || "Untitled session template",
      templateType: "session",
      description: `${getType(state.sessionTypes, session.typeId).label} · ${session.duration} minutes`,
      payload: session as unknown as Record<string, unknown>,
    };
    try {
      const saved = await saveTrainingTemplate(template);
      setState((prev) => ({
        ...prev,
        templates: [
          saved ?? { ...template, id: createUuid() },
          ...prev.templates,
        ],
      }));
      setSyncStatus(saved ? "saved" : "local");
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Could not save template.");
    }
  };

  const addType = (label: string) => {
    const clean = label.trim();
    if (!clean) return;
    setState((prev) => {
      if (prev.sessionTypes.some((t) => t.label.toLowerCase() === clean.toLowerCase())) return prev;
      return {
        ...prev,
        sessionTypes: [
          ...prev.sessionTypes,
          {
            id: `custom-${clean.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
            label: clean,
            color: "#4F6F52",
            bg: "bg-grass-50",
            text: "text-grass",
          },
        ],
      };
    });
  };

  return (
    <div className="mx-auto max-w-content container-px py-8">
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <TrainingActionRail
          view={view}
          setView={setView}
          onNewSession={() => openNewSession()}
          onNewPlan={() => {
            setEditingPlan(null);
            setDrawer("plan");
          }}
          onTemplates={() => setDrawer("templates")}
          onProgress={() => setDrawer("progress")}
          onSettings={() => setDrawer("settings")}
        />

        <main className="min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-[22px] border-[0.5px] border-line bg-card shadow-soft"
          >
            <div className="border-b-[0.5px] border-line bg-grass px-5 py-7 text-cream sm:px-8">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="font-serif text-lg italic text-leaf-accent">Training planner</p>
                  <h1 className="mt-1 text-3xl font-light tracking-tight sm:text-5xl">
                    Build the week that moves your UTR.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream/78 sm:text-base">
                    {player.name.split(" ")[0]}, at UTR {player.currentUTR.toFixed(1)} in {ordinal(player.grade)} grade, your target range calls for about{" "}
                    <span className="font-medium text-leaf-accent">{Math.round(recommendedHours)} focused hours</span>{" "}
                    with match play and recovery protected.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-card bg-cream/10 p-2 text-center">
                  <MiniMetric label="planned" value={`${Math.round(totalMinutes / 60)}h`} />
                  <MiniMetric label="complete" value={`${progress}%`} />
                  <MiniMetric label="sessions" value={String(activeSessions.length)} />
                </div>
              </div>
            </div>

            <div className="grid gap-5 p-5 sm:p-8 xl:grid-cols-[1fr_280px]">
              <section className="min-w-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={state.activePlanId}
                        onChange={(e) => setState((prev) => ({ ...prev, activePlanId: e.target.value }))}
                        className="h-10 rounded-xl border-[0.5px] border-line bg-card px-3 text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
                        aria-label="Choose training plan"
                      >
                        {state.plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name}
                          </option>
                        ))}
                      </select>
                      <Badge variant="leaf" size="sm">
                        {view} view
                      </Badge>
                      <Badge variant={syncStatus === "error" ? "outline" : "default"} size="sm">
                        {syncStatus === "saving"
                          ? "saving"
                          : syncStatus === "saved"
                            ? "saved"
                            : syncStatus === "local"
                              ? "local mode"
                              : syncStatus}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-stone">{activePlan?.goal}</p>
                    {syncError && (
                      <p className="mt-2 text-xs text-[#9C3B22]">{syncError}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingPlan(null);
                        setDrawer("plan");
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      New plan
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => {
                        setEditingPlan(activePlan ?? null);
                        setDrawer("plan");
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="subtle" size="sm" onClick={duplicateActivePlan}>
                      Duplicate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={deleteActivePlan}
                      disabled={state.plans.length <= 1}
                    >
                      Delete
                    </Button>
                    <Button size="sm" onClick={() => openNewSession()}>
                      <Plus className="h-4 w-4" />
                      New session
                    </Button>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={view}
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-5"
                  >
                    {view === "week" && (
                      <WeekPlanner
                        sessionsByDay={sessionsByDay}
                        types={state.sessionTypes}
                        selectedDay={selectedDay}
                        draggingId={draggingId}
                        onSelectDay={setSelectedDay}
                        onAdd={openNewSession}
                        onEdit={(session) => {
                          setEditingSession(session);
                          setSelectedDay(session.day);
                          setDrawer("session");
                        }}
                        onMove={moveSession}
                        onDrag={setDraggingId}
                        onToggle={toggleComplete}
                      />
                    )}
                    {view === "day" && (
                      <DayPlanner
                        day={selectedDay}
                        sessions={sessionsByDay.get(selectedDay) ?? []}
                        types={state.sessionTypes}
                        onDayChange={setSelectedDay}
                        onAdd={openNewSession}
                        onEdit={(session) => {
                          setEditingSession(session);
                          setDrawer("session");
                        }}
                        onToggle={toggleComplete}
                      />
                    )}
                    {view === "month" && (
                      <MonthPlanner
                        sessionsByDay={sessionsByDay}
                        onSelect={(day) => {
                          setSelectedDay(day);
                          setView("day");
                        }}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </section>

              <aside className="space-y-4">
                <Card className="p-5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-grass" />
                    <h2 className="text-base font-medium text-ink">Plan balance</h2>
                  </div>
                  <HoursDonutChart
                    data={donutData}
                    centerValue={`${Math.round(totalMinutes / 60)}h`}
                    centerLabel="this plan"
                  />
                  <div className="space-y-2">
                    {donutData.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-stone">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                          {d.name}
                        </span>
                        <span className="font-medium text-ink">{d.value}h</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5">
                  <h2 className="text-base font-medium text-ink">Recommended next move</h2>
                  <p className="mt-2 text-sm leading-relaxed text-stone">
                    {recommendation(player.currentUTR, activeSessions, player.grade)}
                  </p>
                  <Button variant="subtle" size="sm" className="mt-4 w-full" onClick={() => openNewSession("Sat")}>
                    Add suggested session
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Card>
              </aside>
            </div>
          </motion.div>
        </main>
      </div>

      <SessionDrawer
        open={drawer === "session"}
        session={editingSession}
        defaultDay={selectedDay}
        types={state.sessionTypes}
        onClose={() => {
          setDrawer(null);
          setEditingSession(null);
        }}
        onSave={saveSession}
        onDelete={deleteSession}
        onAddType={addType}
        onSaveTemplate={saveTemplateFromSession}
      />
      <PlanDrawer
        open={drawer === "plan"}
        plan={editingPlan}
        onClose={() => {
          setDrawer(null);
          setEditingPlan(null);
        }}
        onSave={savePlan}
      />
      <InfoDrawer
        open={drawer === "templates"}
        onClose={() => setDrawer(null)}
        eyebrow="Templates"
        title="Use a proven recruiting week"
        body={
          state.templates.length
            ? `Saved templates: ${state.templates.map((template) => template.name).join(", ")}.`
            : "Start with a balanced UTR build week, a tournament taper week, or an academic-heavy maintenance week. Templates can be copied into any plan, then edited session by session."
        }
      />
      <InfoDrawer
        open={drawer === "progress"}
        onClose={() => setDrawer(null)}
        eyebrow="Progress"
        title={`${progress}% of planned training complete`}
        body={`You have completed ${Math.round(completedMinutes / 60)} of ${Math.round(totalMinutes / 60)} planned hours. Keep recovery visible so the work compounds instead of turning into noise.`}
      />
      <InfoDrawer
        open={drawer === "settings"}
        onClose={() => setDrawer(null)}
        eyebrow="Planner settings"
        title="Reusable session types"
        body={`Saved types: ${state.sessionTypes.map((t) => t.label).join(", ")}. Add new types inside any session form and Seeded will remember them for your next plan.`}
      />
    </div>
  );
}

function TrainingActionRail({
  view,
  setView,
  onNewSession,
  onNewPlan,
  onTemplates,
  onProgress,
  onSettings,
}: {
  view: PlannerView;
  setView: (v: PlannerView) => void;
  onNewSession: () => void;
  onNewPlan: () => void;
  onTemplates: () => void;
  onProgress: () => void;
  onSettings: () => void;
}) {
  const actions = [
    { label: "New Session", icon: Plus, onClick: onNewSession, primary: true },
    { label: "New Plan", icon: LayoutList, onClick: onNewPlan },
    { label: "Templates", icon: Sparkles, onClick: onTemplates },
    { label: "Progress", icon: Trophy, onClick: onProgress },
    { label: "Settings", icon: Settings, onClick: onSettings },
  ];

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <Card className="overflow-hidden p-3">
        <div className="border-b-[0.5px] border-line px-2 pb-3">
          <p className="font-serif text-base italic text-leaf-accent">Plan actions</p>
          <p className="mt-1 text-xs leading-relaxed text-stone">
            Create, organize, and review every session in one place.
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={cn(
                "group flex items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition-all focus:outline-none focus:ring-2 focus:ring-grass/30",
                a.primary
                  ? "bg-grass text-cream shadow-soft hover:shadow-lift"
                  : "bg-cream/60 text-ink hover:bg-grass-50"
              )}
            >
              <span className="flex items-center gap-2">
                <a.icon className="h-4 w-4" />
                {a.label}
              </span>
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-2xl bg-grass-50 p-2">
          <p className="px-1 text-xs font-medium text-stone">Calendar view</p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-xl px-2 py-2 text-xs font-medium capitalize transition-all focus:outline-none focus:ring-2 focus:ring-grass/30",
                  view === v ? "bg-card text-grass shadow-soft" : "text-stone hover:text-ink"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </Card>
    </aside>
  );
}

function WeekPlanner(props: {
  sessionsByDay: Map<WeekdayShort, TrainingPlannerSession[]>;
  types: TrainingSessionType[];
  selectedDay: WeekdayShort;
  draggingId: string | null;
  onSelectDay: (day: WeekdayShort) => void;
  onAdd: (day: WeekdayShort) => void;
  onEdit: (session: TrainingPlannerSession) => void;
  onMove: (sessionId: string, day: WeekdayShort) => void;
  onDrag: (id: string | null) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {WEEK_ORDER.map((day) => {
        const sessions = props.sessionsByDay.get(day) ?? [];
        const minutes = sessions.reduce((sum, s) => sum + s.duration, 0);
        const isDropTarget = Boolean(props.draggingId);
        return (
          <motion.div
            key={day}
            layout
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => props.draggingId && props.onMove(props.draggingId, day)}
            className={cn(
              "min-h-[300px] w-[190px] shrink-0 rounded-card border-[0.5px] border-line bg-cream/55 p-3 transition-colors 2xl:w-[205px]",
              props.selectedDay === day && "ring-2 ring-grass/20",
              isDropTarget && "hover:bg-grass-50"
            )}
          >
            <button
              onClick={() => props.onSelectDay(day)}
              className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-left focus:outline-none focus:ring-2 focus:ring-grass/30"
            >
              <span className="font-medium text-ink">{day}</span>
              <span className="text-xs text-stone-light">{Math.round(minutes / 60)}h</span>
            </button>
            <div className="mt-3 space-y-2">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  type={getType(props.types, session.typeId)}
                  onEdit={props.onEdit}
                  onDrag={props.onDrag}
                  onToggle={props.onToggle}
                />
              ))}
              {sessions.length === 0 && (
                <button
                  onClick={() => props.onAdd(day)}
                  className="flex min-h-[92px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-line text-center text-xs text-stone-light transition-colors hover:border-grass/40 hover:bg-card hover:text-grass focus:outline-none focus:ring-2 focus:ring-grass/30"
                >
                  <Plus className="mb-1 h-4 w-4" />
                  Add a session
                </button>
              )}
            </div>
            {sessions.length > 0 && (
              <button
                onClick={() => props.onAdd(day)}
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-stone transition-colors hover:bg-card hover:text-grass focus:outline-none focus:ring-2 focus:ring-grass/30"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function DayPlanner({
  day,
  sessions,
  types,
  onDayChange,
  onAdd,
  onEdit,
  onToggle,
}: {
  day: WeekdayShort;
  sessions: TrainingPlannerSession[];
  types: TrainingSessionType[];
  onDayChange: (day: WeekdayShort) => void;
  onAdd: (day: WeekdayShort) => void;
  onEdit: (session: TrainingPlannerSession) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {WEEK_ORDER.map((d) => (
          <button
            key={d}
            onClick={() => onDayChange(d)}
            className={cn(
              "rounded-pill px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-grass/30",
              day === d ? "bg-grass text-cream" : "bg-grass-50 text-stone hover:text-ink"
            )}
          >
            {d}
          </button>
        ))}
      </div>
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-ink">{day} sessions</h2>
          <Button size="sm" onClick={() => onAdd(day)}>
            <Plus className="h-4 w-4" />
            Add session
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              type={getType(types, session.typeId)}
              onEdit={onEdit}
              onDrag={() => undefined}
              onToggle={onToggle}
              wide
            />
          ))}
          {sessions.length === 0 && (
            <div className="rounded-card border border-dashed border-line bg-cream/50 p-8 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-stone-light" />
              <p className="mt-3 text-sm font-medium text-ink">No sessions yet</p>
              <p className="mt-1 text-sm text-stone">
                Add a tennis block, strength session, recovery day, or anything custom.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function MonthPlanner({
  sessionsByDay,
  onSelect,
}: {
  sessionsByDay: Map<WeekdayShort, TrainingPlannerSession[]>;
  onSelect: (day: WeekdayShort) => void;
}) {
  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const firstWeekday = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  return (
    <div>
      <h2 className="mb-3 text-lg font-medium text-ink">{monthLabel}</h2>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEK_ORDER.map((d) => (
          <div key={d} className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-stone-light">
            {d}
          </div>
        ))}
        {cells.map((date, index) => {
          if (!date) return <div key={`blank-${index}`} className="aspect-square" />;
          const day = WEEK_ORDER[(new Date(now.getFullYear(), now.getMonth(), date).getDay() + 6) % 7];
          const sessions = sessionsByDay.get(day) ?? [];
          const isToday = date === now.getDate();
          return (
            <button
              key={date}
              onClick={() => onSelect(day)}
              className={cn(
                "flex aspect-square min-h-[74px] flex-col rounded-xl border-[0.5px] p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-grass/30",
                isToday ? "border-grass bg-grass-50" : "border-line bg-card"
              )}
            >
              <span className={cn("text-xs", isToday ? "font-semibold text-grass" : "text-stone")}>{date}</span>
              <div className="mt-auto flex flex-wrap gap-1">
                {sessions.slice(0, 6).map((s) => (
                  <span key={s.id} className="h-1.5 w-1.5 rounded-full bg-grass" />
                ))}
              </div>
              {sessions.length > 0 && <span className="mt-1 text-[10px] text-stone-light">{sessions.length} sessions</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  type,
  onEdit,
  onDrag,
  onToggle,
  wide = false,
}: {
  session: TrainingPlannerSession;
  type: TrainingSessionType;
  onEdit: (session: TrainingPlannerSession) => void;
  onDrag: (id: string | null) => void;
  onToggle: (id: string) => void;
  wide?: boolean;
}) {
  return (
    <motion.article
      layout
      draggable
      onDragStart={() => onDrag(session.id)}
      onDragEnd={() => onDrag(null)}
      whileHover={{ y: -2 }}
      className={cn(
        "group rounded-2xl border-[0.5px] border-line bg-card p-3 shadow-[0_8px_24px_rgba(31,31,26,0.04)]",
        session.completed && "bg-grass-50/80",
        wide && "p-4"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={() => onToggle(session.id)}
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-grass/30",
            session.completed ? "border-grass bg-grass text-cream" : "border-line text-stone-light hover:border-grass"
          )}
          aria-label={session.completed ? "Mark session incomplete" : "Mark session complete"}
        >
          {session.completed && <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => onEdit(session)}
          className="min-w-0 flex-1 text-left focus:outline-none focus:ring-2 focus:ring-grass/30"
        >
          <div className="flex items-center gap-1.5">
            <span className={cn("rounded-pill px-2 py-0.5 text-[10px] font-medium", type.bg, type.text)}>
              {type.label}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-stone-light">
              <Clock className="h-3 w-3" />
              {session.startTime} · {session.duration}m
            </span>
          </div>
          <h3 className={cn("mt-2 truncate text-sm font-medium text-ink", session.completed && "line-through decoration-grass/40")}>
            {session.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone">{session.goals || session.notes}</p>
        </button>
        <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-stone-light opacity-50 transition-opacity group-hover:opacity-100" />
      </div>
    </motion.article>
  );
}

function SessionDrawer({
  open,
  session,
  defaultDay,
  types,
  onClose,
  onSave,
  onDelete,
  onAddType,
  onSaveTemplate,
}: {
  open: boolean;
  session: TrainingPlannerSession | null;
  defaultDay: WeekdayShort;
  types: TrainingSessionType[];
  onClose: () => void;
  onSave: (session: TrainingPlannerSession) => void;
  onDelete: (id: string) => void;
  onAddType: (label: string) => void;
  onSaveTemplate: (session: TrainingPlannerSession) => void;
}) {
  const [form, setForm] = useState<TrainingPlannerSession>(() => blankSession(defaultDay, types[0]?.id ?? "tennis"));
  const [customType, setCustomType] = useState("");
  const [drillText, setDrillText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(session ?? blankSession(defaultDay, types[0]?.id ?? "tennis"));
      setCustomType("");
      setDrillText((session?.drills ?? []).join("\n"));
      setError("");
    }
  }, [open, session, defaultDay, types]);

  const submit = () => {
    if (!form.title.trim()) {
      setError("Name the session so it is easy to find later.");
      return;
    }
    if (form.duration < 15) {
      setError("Duration should be at least 15 minutes.");
      return;
    }
    onSave({ ...form, drills: drillText.split("\n").map((d) => d.trim()).filter(Boolean) });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={session ? "Edit session" : "New session"}
      title={session ? session.title : "Create a training session"}
      widthClass="max-w-xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          {session ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSaveTemplate(session)}
                className="text-sm text-stone transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
              >
                Save template
              </button>
              <button
                onClick={() => onDelete(session.id)}
                className="flex items-center gap-1.5 text-sm text-[#9C3B22] transition-colors hover:text-[#6F2816] focus:outline-none focus:ring-2 focus:ring-[#9C3B22]/30"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          ) : (
            <span />
          )}
          <Button onClick={submit}>
            Save session
            <Check className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded-xl bg-[#FBEAE5] px-4 py-3 text-sm text-[#9C3B22]">{error}</p>}
        <Field label="Session name">
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Example: Serve + first-ball pattern"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <select className={inputClass} value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Day">
            <select className={inputClass} value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value as WeekdayShort, date: dateForWeekday(e.target.value as WeekdayShort) })}>
              {WEEK_ORDER.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input className={inputClass} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Start time">
            <input className={inputClass} type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          </Field>
          <Field label="Duration">
            <input className={inputClass} type="number" min={15} step={15} value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
          </Field>
          <Field label="Intensity">
            <select className={inputClass} value={form.intensity} onChange={(e) => setForm({ ...form, intensity: e.target.value as Intensity })}>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
          </Field>
        </div>
        <Field label="Goals">
          <textarea
            className={textAreaClass}
            value={form.goals}
            onChange={(e) => setForm({ ...form, goals: e.target.value })}
            placeholder="What should this session improve?"
          />
        </Field>
        <Field label="Notes">
          <textarea
            className={textAreaClass}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Court, coach, hitting partner, constraints, reminders..."
          />
        </Field>
        <Field label="Drills or exercises">
          <textarea
            className={textAreaClass}
            value={drillText}
            onChange={(e) => setDrillText(e.target.value)}
            placeholder={"One per line\nCross-court depth ladder\nSecond serve targets"}
          />
        </Field>
        <div className="rounded-card border-[0.5px] border-line bg-cream/50 p-4">
          <p className="text-sm font-medium text-ink">Save a custom type</p>
          <div className="mt-3 flex gap-2">
            <input
              className={inputClass}
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              placeholder="Private lesson, drilling, yoga..."
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onAddType(customType);
                setCustomType("");
              }}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function PlanDrawer({
  open,
  plan,
  onClose,
  onSave,
}: {
  open: boolean;
  plan: TrainingFolder | null;
  onClose: () => void;
  onSave: (name: string, goal: string) => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(plan?.name ?? "");
      setGoal(plan?.goal ?? "");
      setError("");
    }
  }, [open, plan]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={plan ? "Edit plan" : "New plan"}
      title={plan ? "Update this training plan" : "Create a full training plan"}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            if (!name.trim()) {
              setError("Give the plan a name.");
              return;
            }
            onSave(name.trim(), goal.trim() || "A focused training block for the next recruiting checkpoint.");
          }}
        >
          {plan ? "Save plan" : "Create plan"}
          {plan ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded-xl bg-[#FBEAE5] px-4 py-3 text-sm text-[#9C3B22]">{error}</p>}
        <Field label="Plan name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Example: Summer tournament block" />
        </Field>
        <Field label="Plan goal">
          <textarea className={textAreaClass} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What should this plan accomplish?" />
        </Field>
      </div>
    </Drawer>
  );
}

function InfoDrawer({
  open,
  onClose,
  eyebrow,
  title,
  body,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <Drawer open={open} onClose={onClose} eyebrow={eyebrow} title={title}>
      <p className="text-sm leading-relaxed text-stone">{body}</p>
      <div className="mt-5 grid gap-3">
        {["Tournament taper", "UTR build week", "Recovery reset"].map((item) => (
          <div key={item} className="rounded-card border-[0.5px] border-line bg-card p-4">
            <p className="font-medium text-ink">{item}</p>
            <p className="mt-1 text-sm text-stone">A polished template designed for junior recruiting rhythms.</p>
          </div>
        ))}
      </div>
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-stone-light">{label}</span>
      {children}
    </label>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-cream/10 px-4 py-3">
      <p className="text-2xl font-light text-leaf-accent">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-cream/62">{label}</p>
    </div>
  );
}

function blankSession(day: WeekdayShort, typeId: string): TrainingPlannerSession {
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

function getType(types: TrainingSessionType[], id: string): TrainingSessionType {
  return types.find((t) => t.id === id) ?? types[0] ?? DEFAULT_TYPES[0];
}

function dateForWeekday(day: WeekdayShort): string {
  const now = new Date();
  const current = (now.getDay() + 6) % 7;
  const target = WEEK_ORDER.indexOf(day);
  const date = new Date(now);
  date.setDate(now.getDate() + (target - current));
  return date.toISOString().slice(0, 10);
}

function ordinal(grade: number): string {
  if (grade === 11) return "11th";
  if (grade === 12) return "12th";
  if (grade === 10) return "10th";
  if (grade === 9) return "9th";
  return `${grade}th`;
}

function sentence(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function recommendation(utr: number, sessions: TrainingPlannerSession[], grade: number): string {
  const matchPrep = sessions.filter((s) => s.typeId === "match-prep").length;
  const recovery = sessions.filter((s) => s.typeId === "recovery").length;
  if (matchPrep === 0) {
    return `Add one match-prep block this week. At UTR ${utr.toFixed(1)}, coaches need to see point patterns under pressure, not just clean drilling.`;
  }
  if (recovery === 0) {
    return `Protect one recovery session. ${ordinal(grade)} grade recruiting weeks only work if the body can repeat quality sessions.`;
  }
  return `This plan is balanced. The best upgrade is a short filmed set after your highest-intensity session.`;
}
