"use client";

import { useState } from "react";
import { Check, Copy, CheckCircle2 } from "lucide-react";
import type { School } from "@/lib/types";
import type { OutreachStatus, OutreachStatusMapDated } from "@/lib/supabase/features";
import { REMIND_ME_AFTER_DAYS } from "@/lib/supabase/features";
import { daysSince, FOLLOW_UP_AFTER_DAYS } from "@/lib/today-actions";
import { SeededButton } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { cn } from "@/lib/utils";

// Pixel-exact to Outreach.dc.html's 5-column board (Researching/Emailed/
// Replied/Call-visit/Offer), plus a 6th "Committed" column the mockup
// screenshot doesn't show but the phase spec's written stage list names —
// same .col/.colh/.k visual language extended one column further.
const STAGES: { key: OutreachStatus; label: string }[] = [
  { key: "researching", label: "Researching" },
  { key: "emailed", label: "Emailed" },
  { key: "replied", label: "Replied" },
  { key: "call_visit", label: "Call / visit" },
  { key: "offer", label: "Offer" },
  { key: "committed", label: "Committed" },
];

function chip(className: string, children: React.ReactNode) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
        className
      )}
    >
      {children}
    </span>
  );
}

export interface SeededOutreachLayoutProps {
  targetSchools: School[];
  statuses: OutreachStatusMapDated;
  selectedSlug: string | null;
  setSelectedSlug: (slug: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  copied: boolean;
  copyAll: () => void;
  setStatus: (slug: string, status: OutreachStatus | null) => void;
  setReminder: (slug: string) => void;
  outreachError: string;
}

export function SeededOutreachLayout({
  targetSchools,
  statuses,
  selectedSlug,
  setSelectedSlug,
  subject,
  setSubject,
  body,
  setBody,
  copied,
  copyAll,
  setStatus,
  setReminder,
  outreachError,
}: SeededOutreachLayoutProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const bySlug = (slug: string) => targetSchools.find((s) => s.slug === slug);
  const selectedSchool = selectedSlug ? bySlug(selectedSlug) : undefined;

  const notStarted = targetSchools.filter((s) => !statuses[s.slug]);
  const emailedCount = targetSchools.filter((s) => statuses[s.slug]?.status === "emailed").length;
  const repliedCount = targetSchools.filter((s) => statuses[s.slug]?.status === "replied").length;
  const dueCount = targetSchools.filter((s) => {
    const entry = statuses[s.slug];
    return entry?.status === "emailed" && daysSince(entry.updatedAt) >= FOLLOW_UP_AFTER_DAYS;
  }).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-seeded text-[30px] font-semibold tracking-[-0.02em] text-ink">Outreach</h1>
          <p className="mt-1.5 text-ink/70">
            {targetSchools.length} programs · {emailedCount} emailed · {repliedCount} replied ·{" "}
            {dueCount} follow-up{dueCount === 1 ? "" : "s"} due this week
          </p>
        </div>
        <div className="relative">
          <SeededButton variant="primary" onClick={() => setPickerOpen((v) => !v)} disabled={notStarted.length === 0}>
            New email
          </SeededButton>
          {pickerOpen && notStarted.length > 0 && (
            <div className="absolute right-0 top-full z-10 mt-2 w-64 rounded-lg border border-line bg-card p-2 shadow-card">
              {notStarted.map((s) => (
                <button
                  key={s.slug}
                  onClick={() => {
                    setStatus(s.slug, "researching");
                    setSelectedSlug(s.slug);
                    setPickerOpen(false);
                  }}
                  className="block w-full rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-grass-50"
                >
                  {s.shortName}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const schools = targetSchools.filter((s) => statuses[s.slug]?.status === stage.key);
          return (
            <div key={stage.key} className="flex w-[220px] shrink-0 flex-col gap-2.5">
              <div className="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-[0.04em] text-ink/60">
                <span>{stage.label}</span>
                <span>{schools.length}</span>
              </div>
              {schools.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-input p-3 text-sm text-ink/60">
                  {stage.key === "offer"
                    ? "Offers land here."
                    : stage.key === "committed"
                      ? "Commitments land here."
                      : "Nothing here yet."}
                </div>
              ) : (
                schools.map((s) => {
                  const entry = statuses[s.slug];
                  const due =
                    stage.key === "emailed" &&
                    entry &&
                    daysSince(entry.updatedAt) >= FOLLOW_UP_AFTER_DAYS;
                  const remindAt = entry?.remindAt ? new Date(entry.remindAt) : null;
                  const reminderDue = Boolean(remindAt && remindAt.getTime() <= Date.now());
                  return (
                    <div
                      key={s.slug}
                      className={cn(
                        "flex cursor-pointer flex-col gap-1.5 rounded-[10px] border bg-card p-3 text-sm transition-colors hover:border-grass/40",
                        selectedSlug === s.slug ? "border-grass" : "border-line",
                        due && "border-gold"
                      )}
                      onClick={() => setSelectedSlug(s.slug)}
                    >
                      <strong className="text-ink">{s.shortName}</strong>
                      <span className="text-xs text-ink/60">
                        {s.division} · {s.conference}
                      </span>
                      {due && chip("border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]", "Follow up due")}
                      {stage.key === "replied" &&
                        chip("border-grass-100 bg-grass-50 text-grass", "Replied")}
                      {reminderDue && chip("border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]", "Reminder due")}
                      {!reminderDue && remindAt && (
                        <span className="text-xs text-ink/50">
                          Reminder set for{" "}
                          {remindAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                      <select
                        value={stage.key}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setStatus(s.slug, e.target.value as OutreachStatus)}
                        className="mt-1 rounded-md border border-line bg-cream px-2 py-1 text-xs text-ink"
                        aria-label={`Move ${s.shortName} to a different stage`}
                      >
                        {STAGES.map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReminder(s.slug);
                        }}
                        className="self-start text-xs font-semibold text-grass hover:text-grass-600"
                      >
                        Remind me in {REMIND_ME_AFTER_DAYS} days
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      <aside className="w-full max-w-md rounded-xl border border-line bg-card p-5">
        {!selectedSchool ? (
          <EmptyState
            title="No email selected."
            description="Pick a school from the board, or start a new email, to draft a message."
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-ink">
                {statuses[selectedSchool.slug]?.status === "emailed" ? "Follow-up" : "Email"} ·{" "}
                {selectedSchool.shortName}
              </h2>
              {chip("border-line bg-card text-ink/70", "Draft")}
            </div>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink/60">
              To
              <input
                readOnly
                value={`${selectedSchool.coachName} (${selectedSchool.coachEmail})`}
                className="h-[42px] rounded-md border border-input bg-cream px-3 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink/60">
              Subject
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-[42px] rounded-md border border-input bg-cream px-3 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink/60">
              Message
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                className="resize-y rounded-md border border-input bg-cream p-3 text-sm leading-[1.55] text-ink"
              />
            </label>
            <p className="text-xs text-ink/60">
              Filled from your real results and the school&rsquo;s page. Edit before sending. Seeded
              never sends for you.
            </p>
            <div className="flex flex-wrap gap-2">
              <SeededButton
                variant="primary"
                onClick={() => {
                  copyAll();
                  setStatus(selectedSchool.slug, "emailed");
                }}
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden /> Copy and mark sent
                  </>
                )}
              </SeededButton>
              <SeededButton
                variant="secondary"
                onClick={() => {
                  const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                    selectedSchool.coachEmail
                  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                Open in Gmail
              </SeededButton>
              {statuses[selectedSchool.slug]?.status === "replied" ? (
                chip("border-grass-100 bg-grass-50 text-grass", <><Check className="mr-1 inline h-3 w-3" aria-hidden />Coach replied</>)
              ) : (
                <SeededButton variant="ghost" onClick={() => setStatus(selectedSchool.slug, "replied")}>
                  Mark replied
                </SeededButton>
              )}
            </div>
            {outreachError && (
              <p className="rounded-lg bg-error-bg px-3 py-2 text-sm text-error">{outreachError}</p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
