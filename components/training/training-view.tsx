"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Sparkles } from "lucide-react";
import type { TrainingPlan, WeekdayShort } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { AuthGate } from "@/components/shared/auth-gate";
import { PaidGate } from "@/components/shared/paid-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HoursDonutChart } from "@/components/charts/hours-donut-chart";
import { getCurrentGrade } from "@/lib/time";
import {
  createUuid,
  loadTrainingPlannerState,
  saveTrainingPlannerState,
  saveTrainingTemplate,
  type SavedTrainingTemplate,
  type TrainingFolder,
  type TrainingPreferences,
  type TrainingPlannerSession,
  type TrainingPlannerState,
} from "@/lib/supabase/training";
import {
  DEFAULT_TYPES,
  TEMPLATE_DEFINITIONS,
  WEEK_ORDER,
  buildTemplateSessions,
  dateForWeekday,
  generatePersonalizedPlan,
  getType,
  recommendation,
  sentence,
  weekLabel,
  type TemplateKey,
} from "./training-helpers";
import { MiniMetric, type PlannerDrawer, type PlannerView } from "./training-shared-ui";
import { TrainingActionRail, TrainingQuestionnaire } from "./training-action-rail";
import { DayPlanner, MonthPlanner, WeekPlanner } from "./training-planner-views";
import {
  InfoDrawer,
  PlanDrawer,
  SessionDrawer,
  TemplatesDrawer,
} from "./training-drawers";

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
  const currentGrade = getCurrentGrade(player.graduationYear);
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
      preferences: undefined,
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
  const [weekOffset, setWeekOffset] = useState(0);

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
    if (!state.preferences) return;
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

  const applyPreferences = (preferences: TrainingPreferences) => {
    const generated = generatePersonalizedPlan({
      preferences,
      playerUtr: player.currentUTR,
      grade: currentGrade,
      weaknesses: player.weaknesses,
    });
    setState((prev) => ({
      ...prev,
      preferences,
      sessions: generated.sessions,
      plans: [generated.plan],
      activePlanId: generated.plan.id,
    }));
  };

  const applyTemplate = (key: TemplateKey) => {
    const def = TEMPLATE_DEFINITIONS.find((t) => t.key === key);
    if (!def || !state.preferences) return;
    const sessions = buildTemplateSessions(key, state.preferences);
    const planId = createUuid();
    setState((prev) => ({
      ...prev,
      sessions: [...prev.sessions, ...sessions],
      plans: [
        ...prev.plans,
        { id: planId, name: def.name, goal: def.goal, sessionIds: sessions.map((s) => s.id) },
      ],
      activePlanId: planId,
    }));
    setDrawer(null);
  };

  if (!state.preferences) {
    return (
      <div className="mx-auto max-w-content container-px py-12">
        <TrainingQuestionnaire
          playerName={player.name.split(" ")[0]}
          currentUtr={player.currentUTR}
          grade={currentGrade}
          onComplete={applyPreferences}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-8 xl:grid-cols-[360px_minmax(0,1fr)]">
        <TrainingActionRail
          view={view}
          setView={setView}
          onNewPlan={() => {
            setEditingPlan(null);
            setDrawer("plan");
          }}
          onTemplates={() => setDrawer("templates")}
          onProgress={() => setDrawer("progress")}
          onSettings={() => setDrawer("settings")}
        />

        <div className="min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-[30px] border-[0.5px] border-line bg-card shadow-soft"
          >
            <div className="border-b-[0.5px] border-line bg-grass px-6 py-7 text-cream sm:px-10 lg:px-12">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <span className="eyebrow text-gold">Training planner</span>
                  <h1 className="display-serif mt-2 max-w-2xl text-3xl sm:text-4xl">
                    Build the week that moves your UTR.
                  </h1>
                </div>
                <div className="grid w-full gap-3 rounded-[24px] border border-cream/12 bg-cream/10 p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:grid-cols-3 xl:max-w-[480px]">
                  <MiniMetric label="planned" value={`${Math.round(totalMinutes / 60)}h`} />
                  <MiniMetric label="complete" value={`${progress}%`} />
                  <MiniMetric label="sessions" value={String(activeSessions.length)} />
                </div>
              </div>
            </div>

            <div className="grid gap-8 p-5 sm:p-8 lg:p-10 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="min-w-0">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <select
                      value={state.activePlanId}
                      onChange={(e) => setState((prev) => ({ ...prev, activePlanId: e.target.value }))}
                      className="h-10 max-w-full rounded-xl border-[0.5px] border-line bg-card px-3 text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
                      aria-label="Choose training plan"
                    >
                      {state.plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 truncate text-sm text-stone">{activePlan?.goal}</p>
                    <p className="mt-1 text-xs text-stone-light">
                      {syncStatus === "saving"
                        ? "Saving…"
                        : syncStatus === "saved"
                          ? "Synced"
                          : syncStatus === "local"
                            ? "Local mode"
                            : syncStatus === "error"
                              ? syncError ?? "Sync error"
                              : "Loading…"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => {
                        setEditingPlan(activePlan ?? null);
                        setDrawer("plan");
                      }}
                      className="rounded-full px-3 py-2 text-sm text-stone transition-colors hover:bg-grass-50 hover:text-ink"
                    >
                      Edit
                    </button>
                    <button
                      onClick={duplicateActivePlan}
                      className="rounded-full px-3 py-2 text-sm text-stone transition-colors hover:bg-grass-50 hover:text-ink"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={deleteActivePlan}
                      disabled={state.plans.length <= 1}
                      className="rounded-full px-3 py-2 text-sm text-stone transition-colors hover:bg-grass-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Delete
                    </button>
                    <Button size="sm" onClick={() => openNewSession()}>
                      <Plus className="h-4 w-4" />
                      New session
                    </Button>
                  </div>
                </div>

                <div className="mt-8 flex flex-col gap-3 rounded-[24px] border-[0.5px] border-line bg-cream/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {weekLabel(weekOffset)}
                    </p>
                    <p className="text-xs text-stone-light">
                      Drag sessions between days, then open any card to edit the details.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setWeekOffset((value) => value - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button variant="subtle" size="sm" onClick={() => setWeekOffset(0)}>
                      <RotateCcw className="h-4 w-4" />
                      Today
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setWeekOffset((value) => value + 1)}>
                      Next
                      <ChevronRight className="h-4 w-4" />
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
                    className="mt-6"
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
                        weekOffset={weekOffset}
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

              <aside className="space-y-5">
                <Card className="p-6">
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

                <Card className="p-6">
                  <h2 className="text-base font-medium text-ink">Recommended next move</h2>
                  <p className="mt-2 text-sm leading-relaxed text-stone">
                    {recommendation(player.currentUTR, activeSessions, currentGrade)}
                  </p>
                  <Button variant="subtle" size="sm" className="mt-4 w-full" onClick={() => openNewSession("Sat")}>
                    Add suggested session
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Card>
              </aside>
            </div>
          </motion.div>
        </div>
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
      <TemplatesDrawer
        open={drawer === "templates"}
        onClose={() => setDrawer(null)}
        onApply={applyTemplate}
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
