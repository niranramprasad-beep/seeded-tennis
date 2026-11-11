"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  Copy,
  Inbox,
  Mail,
  MailCheck,
  RefreshCw,
  Reply,
  Send,
} from "lucide-react";
import type { School } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import {
  buildCoachEmail,
  staffDirectorySearchUrl,
  type CoachEmailResult,
} from "@/lib/db/schools";
import { loadUtrEntries } from "@/lib/db/plan";
import {
  loadCoachOutreachDated,
  REMIND_ME_AFTER_DAYS,
  saveCoachOutreachReminder,
  saveCoachOutreachReplyNote,
  saveCoachOutreachStatus,
  type OutreachStatus,
  type OutreachStatusMapDated,
} from "@/lib/db/outreach";
import { loadMatches, type MatchRecord } from "@/lib/db/events";
import { AuthGate } from "@/components/shared/auth-gate";
import { PaidGate } from "@/components/shared/paid-gate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { SchoolBadge } from "@/components/shared/school-badge";
import { useDesign } from "@/lib/context/design-context";
import { SeededOutreachLayout } from "@/components/seeded/outreach/seeded-outreach-layout";
import { cn } from "@/lib/utils";

// Legacy key from before outreach status was synced to Supabase — still read
// once on load so no one's existing tracking silently disappears when this
// switches from a local-only store to a real per-account one. Its values
// predate the 6-stage pipeline (migration 011_outreach_stages.sql), so the
// old "contacted" literal is mapped to its real successor "emailed" below.
const LEGACY_OUTREACH_KEY = "seeded.outreach";

type StatusMap = OutreachStatusMapDated;

// Legacy's UI only ever showed 3 states (To do / Sent / Replied) and still
// does — but the underlying table now spans 6 stages (shared with the new
// Seeded board), so a row this view never wrote itself (e.g. "researching"
// or "call_visit", created via Seeded) must still map onto that same
// 3-state vocabulary correctly rather than silently reading as "To do".
function legacyIsSentOrLater(status?: OutreachStatus): boolean {
  return status !== undefined && status !== "researching";
}

export function CoachesView({ schools }: { schools: School[] }) {
  return (
    <AuthGate>
      <PaidGate
        required="family"
        feature="Coach outreach"
        blurb="Generate personalized recruiting emails from your real results, edit them to sound like you, and track every coach from first contact to reply."
        perks={[
          "Researched, non-generic emails per program",
          "Editable, copy-ready drafts",
          "Track contacted vs. replied for every coach",
          "Organized by your target schools",
        ]}
      >
        <CoachesInner schools={schools} />
      </PaidGate>
    </AuthGate>
  );
}

function CoachesInner({ schools }: { schools: School[] }) {
  const { design } = useDesign();
  const isSeeded = design === "seeded";
  const { player } = usePlayer();

  const targetSchools = useMemo(
    () => schools.filter((s) => player.targetSchoolSlugs.includes(s.slug)),
    [schools, player.targetSchoolSlugs]
  );

  // Same "matches" key as /match-mode and /matches — reuses that cached
  // fetch instead of loading the player's whole match history a third time.
  const { data: matches = [] } = useSWR<MatchRecord[]>("matches", () => loadMatches());

  // The email only ever cites the player's OWN logged wins — never sample
  // data — so nothing fabricated goes in front of a real coach. Best wins
  // (highest-rated opponents) lead.
  const results = useMemo<CoachEmailResult[]>(
    () =>
      matches
        .filter((m) => m.result === "win" && m.tournamentName)
        .sort((a, b) => (b.opponentUtr ?? 0) - (a.opponentUtr ?? 0))
        .slice(0, 2)
        .map((m) => ({
          name: m.tournamentName,
          level: "",
          result:
            m.opponentUtr && m.opponentUtr >= player.currentUTR
              ? `beat a UTR ${m.opponentUtr.toFixed(1)} opponent`
              : "picked up wins",
        })),
    [matches, player.currentUTR]
  );

  // Same "utr-entries" SWR key /today, /plan, and the Schools browser
  // already fetch under — a real cache hit, not a second round-trip,
  // whenever one of those loaded this session. Feeds each card's real fit
  // band via classifySchoolFit (inside SeededOutreachLayout), the exact
  // same function those other surfaces use — never a second fit model.
  const { data: utrEntries } = useSWR("utr-entries", () => loadUtrEntries());
  const projection = useMemo(
    () => ({
      utrHistory: (utrEntries ?? []).map((e) => ({ date: new Date(e.recordedAt), utr: e.utr })),
      graduationYear: player.graduationYear,
      gender: player.gender,
    }),
    [utrEntries, player.graduationYear, player.gender]
  );

  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    targetSchools[0]?.slug ?? null
  );
  // The legacy-migration fallback lives inside the fetcher itself — SWR
  // calls it once per key and caches whichever result (remote or migrated
  // legacy) comes back, so the migration can't re-run on every revisit.
  const { data: statuses = {}, mutate: mutateStatuses } = useSWR<StatusMap>(
    "coach-outreach",
    async () => {
      const remote = await loadCoachOutreachDated();
      if (Object.keys(remote).length > 0) return remote;
      try {
        const stored = window.localStorage.getItem(LEGACY_OUTREACH_KEY);
        // Pre-migration localStorage shape was flat {slug: "contacted"|"replied"}
        // — not the dated map this component now uses everywhere else.
        const legacy = stored ? (JSON.parse(stored) as Record<string, "contacted" | "replied">) : null;
        if (legacy && Object.keys(legacy).length > 0) {
          const nowIso = new Date().toISOString();
          const migrated: StatusMap = {};
          await Promise.all(
            Object.entries(legacy).map(([slug, status]) => {
              const mapped: OutreachStatus = status === "contacted" ? "emailed" : "replied";
              migrated[slug] = { status: mapped, updatedAt: nowIso };
              return saveCoachOutreachStatus(slug, mapped);
            })
          );
          window.localStorage.removeItem(LEGACY_OUTREACH_KEY);
          return migrated;
        }
      } catch {
        // Legacy data is best-effort only — never block the page on it.
      }
      return {};
    }
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyNote, setReplyNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [outreachError, setOutreachError] = useState("");
  // The coach's address, typed by the player per draft. P0-3 removed the
  // invented coachEmail from the catalog and there is no column to persist a
  // real one in, so this is deliberately draft-local and resets with the
  // selected school — better an empty field than a remembered wrong address.
  const [recipient, setRecipient] = useState("");

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search).get("school");
    if (qs && player.targetSchoolSlugs.includes(qs)) setSelectedSlug(qs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSchool = useMemo(
    () => targetSchools.find((s) => s.slug === selectedSlug) ?? targetSchools[0],
    [targetSchools, selectedSlug]
  );

  useEffect(() => {
    if (!selectedSchool) return;
    const email = buildCoachEmail(player, selectedSchool, results);
    setSubject(email.subject);
    setBody(email.body);
    setReplyNote(statuses[selectedSchool.slug]?.replyNote ?? "");
    setRecipient("");
    setCopied(false);
    // statuses is intentionally excluded: it updates far more often (every
    // status/reminder click) than the player actually switches schools, and
    // re-running this would stomp an in-progress edit to the reply note with
    // whatever's currently in the cache. The note is re-seeded on
    // selectedSchool change, which is the only time it should reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchool, player, results]);

  const setStatus = async (slug: string, status: OutreachStatus | null) => {
    const previous = statuses;
    const next = { ...statuses };
    if (status === null) delete next[slug];
    // Preserve any existing remindAt/replyNote across a stage change — this
    // is a stage transition, not a reset of everything else real already
    // tracked on the row.
    else next[slug] = { ...statuses[slug], status, updatedAt: new Date().toISOString() };
    mutateStatuses(next, { revalidate: false });
    setOutreachError("");
    try {
      await saveCoachOutreachStatus(slug, status);
    } catch (err) {
      mutateStatuses(previous, { revalidate: false });
      setOutreachError(
        err instanceof Error ? err.message : "Could not save that — try again."
      );
    }
  };

  const setReminder = async (slug: string) => {
    const previous = statuses;
    if (!statuses[slug]) return; // reminders only apply to a row already being tracked
    const remindAt = new Date(Date.now() + REMIND_ME_AFTER_DAYS * 86_400_000).toISOString();
    const next = { ...statuses, [slug]: { ...statuses[slug], remindAt } };
    mutateStatuses(next, { revalidate: false });
    setOutreachError("");
    try {
      await saveCoachOutreachReminder(slug);
    } catch (err) {
      mutateStatuses(previous, { revalidate: false });
      setOutreachError(
        err instanceof Error ? err.message : "Could not set a reminder — try again."
      );
    }
  };

  const saveReplyNote = async (slug: string, note: string) => {
    const previous = statuses;
    if (!statuses[slug]) return; // a note only applies to a row already being tracked
    const next = { ...statuses, [slug]: { ...statuses[slug], replyNote: note.trim() || null } };
    mutateStatuses(next, { revalidate: false });
    setOutreachError("");
    try {
      await saveCoachOutreachReplyNote(slug, note);
    } catch (err) {
      mutateStatuses(previous, { revalidate: false });
      setOutreachError(
        err instanceof Error ? err.message : "Could not save that note — try again."
      );
    }
  };

  const regenerate = () => {
    if (!selectedSchool) return;
    const email = buildCoachEmail(player, selectedSchool, results);
    setSubject(email.subject);
    setBody(email.body);
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const targetSlugs = targetSchools.map((s) => s.slug);
  const contactedCount = targetSlugs.filter((s) => legacyIsSentOrLater(statuses[s]?.status)).length;
  const repliedCount = targetSlugs.filter((s) => statuses[s]?.status === "replied").length;

  if (targetSchools.length === 0) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-grass-50 text-grass">
          <Mail className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-light text-ink">
          Pick your target schools first
        </h1>
        <p className="mt-2 text-stone">
          Choose the programs you're targeting and we'll draft personalized
          emails to each coach.
        </p>
        <Link
          href="/onboarding"
          className={cn(buttonVariants({ variant: "primary", size: "md" }), "mt-6")}
        >
          Choose schools
        </Link>
      </div>
    );
  }

  if (isSeeded) {
    return (
      <div className="mx-auto max-w-content container-px py-10">
        <SeededOutreachLayout
          targetSchools={targetSchools}
          statuses={statuses}
          selectedSlug={selectedSchool?.slug ?? null}
          setSelectedSlug={setSelectedSlug}
          subject={subject}
          setSubject={setSubject}
          body={body}
          setBody={setBody}
          copied={copied}
          copyAll={copyAll}
          setStatus={setStatus}
          setReminder={setReminder}
          outreachError={outreachError}
          playerUtr={player.currentUTR}
          projection={projection}
          replyNote={replyNote}
          setReplyNote={setReplyNote}
          saveReplyNote={saveReplyNote}
          recipient={recipient}
          setRecipient={setRecipient}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <span className="eyebrow text-gold">Coach outreach</span>
          <h1 className="mt-3 text-4xl sm:text-5xl display-serif text-ink">
            Emails that sound like{" "}
            <span className={isSeeded ? "seeded-gradient-text" : "serif-accent text-grass"}>you</span>.
          </h1>
          <p className="mt-3 text-pretty leading-relaxed text-stone">
            Built from your real results — nothing we couldn't stand behind. Edit
            anything, copy it, and track every coach from sent to replied.
          </p>
        </div>
        {/* pipeline summary */}
        <div className="flex gap-3">
          <Stat icon={Send} label="Contacted" value={`${contactedCount}/${targetSchools.length}`} />
          <Stat icon={Reply} label="Replied" value={String(repliedCount)} />
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[330px_1fr]">
        {/* school list */}
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-ink">Your target schools</span>
          {targetSchools.map((s) => {
            const active = selectedSchool?.slug === s.slug;
            const status = statuses[s.slug]?.status;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedSlug(s.slug)}
                className={cn(
                  "flex items-center gap-3 rounded-card border p-3 text-left transition-all",
                  isSeeded
                    ? active
                      ? "border-transparent seeded-glass shadow-seeded-2"
                      : "border-[rgb(var(--c-line))] hover:shadow-seeded-1"
                    : active
                      ? "border-grass bg-grass-50 shadow-soft"
                      : "border-line bg-card hover:shadow-soft"
                )}
              >
                <SchoolBadge school={s} size={40} />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium text-ink", isSeeded && "font-seeded")}>
                    {s.shortName}
                  </p>
                  <p className="truncate text-xs text-stone-light">
                    {s.division} · {s.conference}
                  </p>
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={status ?? "todo"}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.18 }}
                  >
                    {status === "replied" ? (
                      <Badge variant="leaf" size="sm">
                        <MailCheck className="h-3 w-3" />
                        Replied
                      </Badge>
                    ) : legacyIsSentOrLater(status) ? (
                      <Badge
                        size="sm"
                        variant={isSeeded ? undefined : "default"}
                        style={isSeeded ? { background: "var(--s-accent-gradient)", color: "white" } : undefined}
                      >
                        <Check className="h-3 w-3" />
                        Sent
                      </Badge>
                    ) : (
                      <Badge variant="muted" size="sm">
                        <Inbox className="h-3 w-3" />
                        To do
                      </Badge>
                    )}
                  </motion.span>
                </AnimatePresence>
              </button>
            );
          })}
        </div>

        {/* composer */}
        {selectedSchool && (
          <motion.div
            key={selectedSchool.slug}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className={cn("overflow-hidden", isSeeded && "seeded-glass border-0 shadow-seeded-1")}>
              <div className={cn("flex items-center justify-between border-b p-5", isSeeded ? "border-[rgb(var(--c-line))]" : "border-line bg-cream/50")}>
                <div className="flex items-center gap-3">
                  <SchoolBadge school={selectedSchool} size={42} />
                  <div>
                    <p className="font-medium text-ink">
                      {selectedSchool.shortName}
                    </p>
                    <p className="text-xs text-stone">
                      <a
                        href={staffDirectorySearchUrl(selectedSchool)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-grass hover:underline"
                      >
                        Find the coaching staff
                      </a>{" "}
                      — Seeded doesn&apos;t store coach contacts.
                    </p>
                  </div>
                </div>
                <button
                  onClick={regenerate}
                  className="flex items-center gap-1.5 text-sm text-stone transition-colors hover:text-grass"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline">Regenerate</span>
                </button>
              </div>

              <div className="border-b-[0.5px] border-line p-5">
                <label className="mb-1.5 block text-xs text-stone-light">
                  Subject
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-ink focus:outline-none"
                />
              </div>

              <div className="p-5">
                <label className="mb-1.5 block text-xs text-stone-light">
                  Message
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={18}
                  className="w-full resize-none rounded-card border-[0.5px] border-line bg-cream/40 p-4 text-sm leading-relaxed text-ink focus:outline-none focus:ring-2 focus:ring-grass/20"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t-[0.5px] border-line bg-cream/50 p-5">
                <Button variant="primary" size="md" onClick={copyAll}>
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy email
                    </>
                  )}
                </Button>
                {legacyIsSentOrLater(statuses[selectedSchool.slug]?.status) ? (
                  <Button
                    variant="subtle"
                    size="md"
                    onClick={() => setStatus(selectedSchool.slug, null)}
                  >
                    <Check className="h-4 w-4" />
                    Contacted
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => setStatus(selectedSchool.slug, "emailed")}
                  >
                    <Send className="h-4 w-4" />
                    Mark as contacted
                  </Button>
                )}
                <Button
                  variant={
                    statuses[selectedSchool.slug]?.status === "replied" ? "leaf" : "ghost"
                  }
                  size="md"
                  onClick={() =>
                    setStatus(
                      selectedSchool.slug,
                      statuses[selectedSchool.slug]?.status === "replied"
                        ? "emailed"
                        : "replied"
                    )
                  }
                >
                  <Reply className="h-4 w-4" />
                  {statuses[selectedSchool.slug]?.status === "replied"
                    ? "Coach replied"
                    : "Mark replied"}
                </Button>
                {outreachError && (
                  <p className="w-full rounded-xl bg-error-bg px-4 py-2.5 text-sm text-error">
                    {outreachError}
                  </p>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Send;
  label: string;
  value: string;
}) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-grass-50 text-grass">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-lg font-medium leading-none text-ink">{value}</p>
        <p className="mt-1 text-xs text-stone-light">{label}</p>
      </div>
    </Card>
  );
}
