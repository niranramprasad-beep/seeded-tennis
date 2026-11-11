"use client";

import { useState } from "react";
import { Check, Copy, CheckCircle2 } from "lucide-react";
import type { School } from "@/lib/types";
import type { OutreachStatus, OutreachStatusMapDated } from "@/lib/db/outreach";
import { REMIND_ME_AFTER_DAYS } from "@/lib/db/outreach";
import { daysSince, FOLLOW_UP_AFTER_DAYS } from "@/lib/today-actions";
import { classifySchoolFit, type SchoolFitProjectionInput } from "@/lib/school-fit";
import { staffDirectorySearchUrl } from "@/lib/db/schools";
import { FitBadge } from "@/components/seeded/ui/fit-badge";
import { SeededButton } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { cn, isValidEmailAddress } from "@/lib/utils";

// Same plain "Oct 25" (no year) format the board already used inline for
// "Reminder set for {date}" — reused here for last-contact/follow-up-by too
// so every date on a card reads consistently.
function shortDate(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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
  /** The player's real current UTR — drives each card's real fit band via
   * classifySchoolFit, the same function /today, /plan, and the Schools
   * browser already use. */
  playerUtr: number;
  /** Real UTR history + grad-year context, same shape every other
   * classifySchoolFit caller passes — optional because a brand-new account
   * with <3 logged entries genuinely has none yet (classifySchoolFit falls
   * back to "reach" honestly in that case, not a fabricated band). */
  projection?: SchoolFitProjectionInput;
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
  setStatus,
  setReminder,
  outreachError,
  playerUtr,
  projection,
  replyNote,
  setReplyNote,
  saveReplyNote,
  recipient,
  setRecipient,
}: SeededOutreachLayoutProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const bySlug = (slug: string) => targetSchools.find((s) => s.slug === slug);
  const selectedSchool = selectedSlug ? bySlug(selectedSlug) : undefined;
  const currentStatus = selectedSchool ? statuses[selectedSchool.slug]?.status : undefined;
  const recipientValid = isValidEmailAddress(recipient);
  // Only complain once they've actually typed something — an empty field on a
  // fresh draft is the expected starting state, not an error.
  const recipientInvalid = recipient.trim().length > 0 && !recipientValid;

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
                  const band = classifySchoolFit(playerUtr, s, projection);
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
                      <div className="flex items-start justify-between gap-2">
                        <strong className="text-ink">{s.shortName}</strong>
                        <FitBadge band={band} className="shrink-0" />
                      </div>
                      <span className="text-xs text-ink/60">
                        {s.division} · {s.conference}
                      </span>
                      {contacted && (
                        <span className="text-xs text-ink/60">Last contact {shortDate(entry!.updatedAt)}</span>
                      )}
                      {followUpBy && (
                        <span className="text-xs text-ink/60">Follow up by {shortDate(followUpBy)}</span>
                      )}
                      {due && chip("border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]", "Follow up due")}
                      {stage.key === "replied" &&
                        chip("border-grass-100 bg-grass-50 text-grass", "Replied")}
                      {reminderDue && chip("border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]", "Reminder due")}
                      {!reminderDue && remindAt && (
                        <span className="text-xs text-ink/50">
                          Reminder set for {shortDate(remindAt)}
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
                {currentStatus === "emailed" ? "Follow-up" : "Email"} · {selectedSchool.shortName}
              </h2>
              {chip("border-line bg-card text-ink/70", "Draft")}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="outreach-to" className="text-[13px] font-medium text-ink/60">
                To
              </label>
              <input
                id="outreach-to"
                type="email"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                aria-invalid={recipientInvalid}
                aria-describedby="outreach-to-help"
                placeholder="Paste the coach's email address"
                className={cn(
                  "h-[42px] rounded-md border bg-cream px-3 text-sm text-ink",
                  recipientInvalid ? "border-error" : "border-input"
                )}
              />
              <p id="outreach-to-help" className="text-xs text-ink/60">
                {recipientInvalid ? (
                  <span className="text-error">
                    That doesn&rsquo;t look like an email address yet.
                  </span>
                ) : (
                  <>
                    Seeded doesn&rsquo;t store coach contacts — look it up and paste it here.{" "}
                    <a
                      href={staffDirectorySearchUrl(selectedSchool)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-grass hover:text-grass-600"
                    >
                      Find {selectedSchool.shortName}&rsquo;s staff directory
                    </a>
                  </>
                )}
              </p>
            </div>
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
              Filled from what you&rsquo;ve logged — your results, your UTR, your focus areas.
              Nothing about the program beyond its name, division and conference. Edit before
              sending. Seeded never sends for you.
            </p>
            <div className="flex flex-wrap gap-2">
              <SeededButton
                variant="secondary"
                disabled={!recipientValid}
                title={recipientValid ? undefined : "Add the coach's email address first"}
                onClick={() => {
                  // Real Gmail web compose deep link — never the Gmail API,
                  // never sent on the player's behalf. Opens a normal
                  // pre-filled compose window in a new tab for the player to
                  // review and send themselves. The recipient is whatever the
                  // player typed above; we never supply one.
                  if (!recipientValid) return;
                  const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                    recipient.trim()
                  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                Open in Gmail
              </SeededButton>
              {currentStatus === undefined || currentStatus === "researching" ? (
                <SeededButton variant="primary" onClick={() => setStatus(selectedSchool.slug, "emailed")}>
                  Mark sent
                </SeededButton>
              ) : null}
              <SeededButton variant="ghost" onClick={copyAll}>
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
              {currentStatus === "replied" ? (
                chip("border-grass-100 bg-grass-50 text-grass", <><Check className="mr-1 inline h-3 w-3" aria-hidden />Coach replied</>)
              ) : (
                <SeededButton variant="ghost" onClick={() => setStatus(selectedSchool.slug, "replied")}>
                  Mark replied
                </SeededButton>
              )}
            </div>
            {currentStatus === "replied" && (
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink/60">
                Reply note (optional)
                <textarea
                  value={replyNote}
                  onChange={(e) => setReplyNote(e.target.value)}
                  onBlur={() => saveReplyNote(selectedSchool.slug, replyNote)}
                  rows={2}
                  placeholder="What did the coach say?"
                  className="resize-y rounded-md border border-input bg-cream p-3 text-sm leading-[1.55] text-ink"
                />
              </label>
            )}
            {outreachError && (
              <p className="rounded-lg bg-error-bg px-3 py-2 text-sm text-error">{outreachError}</p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
