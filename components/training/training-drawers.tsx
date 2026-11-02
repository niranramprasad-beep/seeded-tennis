"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { Intensity, WeekdayShort } from "@/lib/types";
import type {
  TrainingFolder,
  TrainingPlannerSession,
  TrainingSessionType,
} from "@/lib/supabase/training";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import {
  blankSession,
  dateForWeekday,
  TEMPLATE_DEFINITIONS,
  WEEK_ORDER,
  type TemplateKey,
} from "./training-helpers";
import { Field, inputClass, textAreaClass } from "./training-shared-ui";

export function SessionDrawer({
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
      widthClass="max-w-2xl"
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
                className="flex items-center gap-1.5 text-sm text-error transition-colors hover:text-error-strong focus:outline-none focus:ring-2 focus:ring-error/30"
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
        {error && <p className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">{error}</p>}
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

export function PlanDrawer({
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
        {error && <p className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">{error}</p>}
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

export function InfoDrawer({
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
    </Drawer>
  );
}

export function TemplatesDrawer({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (key: TemplateKey) => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Templates"
      title="Start from a proven recruiting week"
    >
      <p className="text-sm leading-relaxed text-stone">
        Replaces your active plan with a ready-made week. You can edit every
        session afterward.
      </p>
      <div className="mt-5 grid gap-3">
        {TEMPLATE_DEFINITIONS.map((template) => (
          <button
            key={template.key}
            onClick={() => onApply(template.key)}
            className="group rounded-card border-[0.5px] border-line bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-grass/30 hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-grass/30"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-ink">{template.name}</p>
              <ChevronRight className="h-4 w-4 text-stone-light transition-transform group-hover:translate-x-0.5 group-hover:text-grass" />
            </div>
            <p className="mt-1 text-sm text-stone">{template.description}</p>
          </button>
        ))}
      </div>
    </Drawer>
  );
}
