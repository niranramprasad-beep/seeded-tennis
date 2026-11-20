"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, CheckCircle2 } from "lucide-react";
import type { School } from "@/lib/types";
import { coachEmailActionState } from "@/lib/db/schools";
import type { OutreachStatus, OutreachStatusMapDated } from "@/lib/db/outreach";
import { REMIND_ME_AFTER_DAYS } from "@/lib/db/outreach";
import { daysSince, FOLLOW_UP_AFTER_DAYS } from "@/lib/today-actions";
import { StaffDirectoryHint } from "@/components/seeded/ui/staff-directory-hint";
import { SeededButton } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { cn, isValidEmailAddress, plural } from "@/lib/utils";
import { formatShortDate } from "@/lib/time";

/**
 * The column a target school sits in. A saved target with no outreach row
 * yet is "Researching" — it used to sit in no column at all, so the header
 * said "4 programs" over a board showing one (production sweep C13).
 */
export function boardStageFor(
  slug: string,
  statuses: OutreachStatusMapDated
): OutreachStatus {
  return statuses[slug]?.status ?? "researching";
}

// Every date on a card ("Oct 25", no year) goes through lib/time.ts's
// formatShortDate — a date-only value is a local day, a timestamp an instant.

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
  /** "New email": select this target school and replace the editor's
   * contents with a freshly built draft for it. Writes nothing — the stage
   * only moves when the player says so ("Mark sent"). */
  startNewEmail: (slug: string) => void;
  setStatus: (slug: string, status: OutreachStatus | null) => void;
  setReminder: (slug: string) => void;
  outreachError: string;
  /** True until the saved statuses have loaded. The board used to render
   * with every school "not started", then re-sort into its real columns a
   * moment later, pushing everything below it down (CLS 0.18 on /outreach at
   * 375). It shows a skeleton until the real columns are known. */
  loading?: boolean;
  /** Draft text for the optional note a player can attach when marking a
   * school "replied" (migration 017_coach_outreach_reply_note.sql). */
  replyNote: string;
  setReplyNote: (v: string) => void;
  saveReplyNote: (slug: string, note: string) => void;
  /** The coach address, typed by the user. Seeded holds no coach contacts
   * (P0-3 removed the invented ones), so this starts empty on every draft
   * and must be a valid address before "Open in Gmail" will do anything. */
  recipient: string;
  setRecipient: (v: string) => void;
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
  startNewEmail,
  setStatus,
  setReminder,
  outreachError,
  replyNote,
  setReplyNote,
  saveReplyNote,
  recipient,
  setRecipient,
  loading = false,
}: SeededOutreachLayoutProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Bumped on every "New email" pick; the effect below brings the editor on
  // screen once the new draft has rendered.
  const [newEmailTick, setNewEmailTick] = useState(0);
  const editorRef = useRef<HTMLElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const bySlug = (slug: string) => targetSchools.find((s) => s.slug === slug);
  const selectedSchool = selectedSlug ? bySlug(selectedSlug) : undefined;
  const currentStatus = selectedSchool ? statuses[selectedSchool.slug]?.status : undefined;
  const recipientValid = isValidEmailAddress(recipient);
  // Only complain once they've actually typed something — an empty field on a
  // fresh draft is the expected starting state, not an error.
  const recipientInvalid = recipient.trim().length > 0 && !recipientValid;
  // The one gate for Copy and Open in Gmail (lib/db/schools.ts). A draft with
  // a [bracket] still in it never leaves Seeded.
  const actions = coachEmailActionState({ subject, body, recipientValid });

  useEffect(() => {
    if (newEmailTick === 0) return;
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    editorRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    toRef.current?.focus({ preventScroll: true });
  }, [newEmailTick]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  const emailedCount = targetSchools.filter((s) => statuses[s.slug]?.status === "emailed").length;
  const repliedCount = targetSchools.filter((s) => statuses[s.slug]?.status === "replied").length;
  const dueCount = targetSchools.filter((s) => {
    const entry = statuses[s.slug];
    return entry?.status === "emailed" && daysSince(entry.updatedAt) >= FOLLOW_UP_AFTER_DAYS;
  }).length;

  if (loading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <p className="sr-only" role="status">Loading your outreach…</p>
        <div className="h-9 w-56 animate-pulse rounded-lg bg-line/50 motion-reduce:animate-none" aria-hidden />
        <div className="min-h-[60vh] animate-pulse rounded-xl bg-line/40 motion-reduce:animate-none" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-seeded text-[30px] font-semibold tracking-[-0.02em] text-ink">Outreach</h1>
          <p className="mt-1.5 text-ink/70">
            {plural(targetSchools.length, "program", "programs")} · {emailedCount} emailed · {repliedCount} replied ·{" "}
            {dueCount} follow-up{dueCount === 1 ? "" : "s"} due this week
          </p>
        </div>
        <div className="relative">
          {/* Secondary: the editor's "Mark sent" below is this screen's one
              green button (design system v2 rule 1). */}
          {/* Every target school, whatever its stage — a follow-up to an
              emailed coach is a new email too. This used to list only schools
              with no outreach row at all and wrote a "researching" row on
              pick; see startNewEmail in coaches-view.tsx for the full story. */}
          <SeededButton
            variant="secondary"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
            aria-controls="outreach-new-email-picker"
          >
            New email
          </SeededButton>
          {pickerOpen && (
            <div
              id="outreach-new-email-picker"
              className="absolute right-0 top-full z-10 mt-2 max-h-80 w-64 overflow-y-auto rounded-lg border border-line bg-card p-2 shadow-card"
            >
              <p className="px-2.5 pb-1.5 pt-1 text-xs text-ink/60">Start a fresh draft to</p>
              {targetSchools.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => {
                    startNewEmail(s.slug);
                    setPickerOpen(false);
                    setNewEmailTick((t) => t + 1);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-grass-50"
                >
                  <span className="truncate">{s.shortName}</span>
                  <span className="shrink-0 text-xs text-ink/60">
                    {STAGES.find((st) => st.key === boardStageFor(s.slug, statuses))?.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Six columns that share the width at 1440 (6 × 170px + gaps fits the
          1112px content area beside the sidebar) and scroll sideways only
          when the screen is narrower. Fixed 220px columns overflowed by
          ~270px, so Offer and Committed sat clipped off the right edge
          with nothing saying the board scrolled (C28). */}
      <div
        className="grid auto-cols-[minmax(170px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2"
        role="list"
        aria-label="Outreach board"
      >
        {STAGES.map((stage) => {
          const schools = targetSchools.filter((s) => boardStageFor(s.slug, statuses) === stage.key);
          return (
            <div key={stage.key} role="listitem" className="flex min-w-0 flex-col gap-2.5">
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
                  // "Contacted" (an email actually went out) is every status
                  // past "researching" — the same vocabulary
                  // legacyIsSentOrLater() in coaches-view.tsx uses.
                  const contacted = Boolean(entry && entry.status !== "researching");
                  // The real upcoming due date while a card is emailed but
                  // not yet overdue — once `due` flips true, the chip below
                  // already communicates it; this plain-text line only fills
                  // the gap before that, so the date isn't a surprise.
                  const followUpBy =
                    stage.key === "emailed" && entry && !due
                      ? new Date(new Date(entry.updatedAt).getTime() + FOLLOW_UP_AFTER_DAYS * 86_400_000)
                      : null;
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
                      {contacted && (
                        <span className="text-xs text-ink/60">Last contact {formatShortDate(entry!.updatedAt)}</span>
                      )}
                      {followUpBy && (
                        <span className="text-xs text-ink/60">Follow up by {formatShortDate(followUpBy)}</span>
                      )}
                      {due && chip("border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]", "Follow up due")}
                      {stage.key === "replied" &&
                        chip("border-grass-100 bg-grass-50 text-grass", "Replied")}
                      {reminderDue && chip("border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]", "Reminder due")}
                      {!reminderDue && remindAt && (
                        <span className="text-xs text-ink/50">
                          Reminder set for {formatShortDate(remindAt)}
                        </span>
                      )}
                      <select
                        value={stage.key}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setStatus(s.slug, e.target.value as OutreachStatus)}
                        className="mt-1 min-h-11 w-full rounded-md border border-line bg-cream px-2 py-1 text-xs text-ink sm:min-h-8"
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
                        className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-grass hover:text-grass-600 sm:min-h-6"
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

      {/* The editor gets the page's full width (C22): it was a 448px aside
          with a 9-row message box, at 1440 and on phones alike. */}
      <section
        ref={editorRef}
        className="w-full scroll-mt-6 rounded-xl border border-line bg-card p-5 sm:p-6"
        aria-label="Email editor"
      >
        {!selectedSchool ? (
          <EmptyState
            title="No email selected."
            description="Pick a school from the board, or start a new email, to draft a message."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-semibold text-ink">
                {currentStatus === "emailed" ? "Follow-up" : "Email"} · {selectedSchool.shortName}
              </h2>
              {chip("border-line bg-card text-ink/70", "Draft")}
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="outreach-to" className="text-[13px] font-medium text-ink/60">
                    To
                  </label>
                  <input
                    ref={toRef}
                    id="outreach-to"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    spellCheck={false}
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    aria-invalid={recipientInvalid}
                    aria-describedby={recipientInvalid ? "outreach-to-error" : "outreach-find-coach"}
                    placeholder="Paste the coach's email address"
                    className={cn(
                      "h-11 rounded-md border bg-cream px-3 text-sm text-ink",
                      recipientInvalid ? "border-error" : "border-input"
                    )}
                  />
                  {recipientInvalid && (
                    <p id="outreach-to-error" className="text-xs text-error">
                      That doesn&rsquo;t look like an email address yet.
                    </p>
                  )}
                </div>
                <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink/60">
                  Subject
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="h-11 rounded-md border border-input bg-cream px-3 text-sm text-ink"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink/60">
                  Message
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={16}
                    className="min-h-[360px] resize-y rounded-md border border-input bg-cream p-3 text-sm leading-[1.6] text-ink"
                  />
                </label>
              </div>

              {/* Where to find the address. Said once — the To field's own
                  help line used to repeat "Seeded doesn't store coach
                  contacts" right above this (C16). */}
              <div id="outreach-find-coach" className="min-w-0 rounded-lg border border-line bg-cream/50 p-4 lg:self-start">
                <StaffDirectoryHint school={selectedSchool} />
                <p className="mt-3 text-xs text-ink/60">
                  The draft uses only what you&rsquo;ve logged and the program&rsquo;s name, division
                  and conference. Parts in [brackets] are yours to write. Edit it before you send.
                  Seeded never sends for you.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <SeededButton
                  variant="secondary"
                  disabled={!actions.gmail.enabled}
                  aria-describedby={actions.gmail.enabled ? undefined : "outreach-gmail-reason"}
                  onClick={() => {
                    // Real Gmail web compose deep link — never the Gmail API,
                    // never sent on the player's behalf. Opens a normal
                    // pre-filled compose window in a new tab for the player to
                    // review and send themselves. The recipient is whatever the
                    // player typed above; we never supply one.
                    if (!actions.gmail.enabled) return;
                    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                      recipient.trim()
                    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                >
                  Open in Gmail
                </SeededButton>
                <SeededButton
                  variant="ghost"
                  onClick={copyAll}
                  disabled={!actions.copy.enabled}
                  aria-describedby={actions.copy.enabled ? undefined : "outreach-gmail-reason"}
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" aria-hidden /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden /> Copy
                    </>
                  )}
                </SeededButton>
                {/* Status actions sit on the same row, pushed right — "Mark
                    replied" used to wrap onto a line of its own (C28). */}
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  {currentStatus === undefined || currentStatus === "researching" ? (
                    <SeededButton variant="primary" onClick={() => setStatus(selectedSchool.slug, "emailed")}>
                      Mark sent
                    </SeededButton>
                  ) : null}
                  {currentStatus === "replied" ? (
                    chip("border-grass-100 bg-grass-50 text-grass", <><Check className="mr-1 inline h-3 w-3" aria-hidden />Coach replied</>)
                  ) : (
                    <SeededButton variant="secondary" onClick={() => setStatus(selectedSchool.slug, "replied")}>
                      Mark replied
                    </SeededButton>
                  )}
                </div>
              </div>
              {actions.copy.reason ? (
                // The draft itself isn't ready: both buttons are off, and
                // this says why (a [bracket] still in it, or no message).
                <p id="outreach-gmail-reason" role="status" className="text-xs font-medium text-ink/80">
                  {actions.copy.reason}
                </p>
              ) : !actions.gmail.enabled ? (
                <p id="outreach-gmail-reason" className="text-xs text-ink/60">
                  Paste the coach&rsquo;s email in To to open Gmail. Or use Copy and paste the draft
                  into any email app.
                </p>
              ) : null}
            </div>

            {currentStatus === "replied" && (
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink/60">
                Reply note (optional)
                <textarea
                  value={replyNote}
                  onChange={(e) => setReplyNote(e.target.value)}
                  onBlur={() => saveReplyNote(selectedSchool.slug, replyNote)}
                  rows={3}
                  placeholder="What did the coach say?"
                  className="resize-y rounded-md border border-input bg-cream p-3 text-sm leading-[1.55] text-ink"
                />
              </label>
            )}
            {outreachError && (
              <p role="alert" className="rounded-lg bg-error-bg px-3 py-2 text-sm text-error">{outreachError}</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
