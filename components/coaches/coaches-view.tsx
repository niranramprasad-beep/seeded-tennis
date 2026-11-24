"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Mail } from "lucide-react";
import { FEATURE_TIER, type School } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import {
  buildCoachEmail,
  coachEmailActionState,
  coachEmailWinPhrase,
  type CoachEmailResult,
} from "@/lib/db/schools";
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
import { loadUtrEntries, type UtrEntry } from "@/lib/db/plan";
import { AuthGate } from "@/components/shared/auth-gate";
import { PaidGate } from "@/components/shared/paid-gate";
import { buttonVariants } from "@/components/ui/button";
import { SeededOutreachLayout } from "@/components/seeded/outreach/seeded-outreach-layout";
import { cn, hasRealUtr } from "@/lib/utils";

// Legacy key from before outreach status was synced to Supabase — still read
// once on load so no one's existing tracking silently disappears when this
// switches from a local-only store to a real per-account one. Its values
// predate the 6-stage pipeline (migration 011_outreach_stages.sql), so the
// old "contacted" literal is mapped to its real successor "emailed" below.
const LEGACY_OUTREACH_KEY = "seeded.outreach";

type StatusMap = OutreachStatusMapDated;

export function CoachesView({ schools }: { schools: School[] }) {
  return (
    <AuthGate>
      {/* P1-PRICE-1: was `required="family"`. Outreach is the core recruiting
          loop, so it belongs in Player. The matching RLS change is migration
          024 — this gate is cosmetic on its own, and until that migration is
          applied a Player user would get a board that fails every write. */}
      <PaidGate
        required={FEATURE_TIER.outreach}
        feature="Coach outreach"
        blurb="Draft emails to coaches from your own logged results, edit them to sound like you, and track every coach from first contact to reply."
        perks={[
          "Drafts built from results you logged — nothing invented",
          "Editable and copy-ready; you send it from your own Gmail",
          "Track every coach from researching through to committed",
          "Organized by your target schools",
        ]}
      >
        <CoachesInner schools={schools} />
      </PaidGate>
    </AuthGate>
  );
}

function CoachesInner({ schools }: { schools: School[] }) {
  const { player } = usePlayer();

  const targetSchools = useMemo(
    () => schools.filter((s) => player.targetSchoolSlugs.includes(s.slug)),
    [schools, player.targetSchoolSlugs]
  );

  // No fit bands here (production sweep C28): the pipeline is about where
  // each conversation stands, and the band already lives on /schools and
  // every school page. A band chip on each card crowded the 220px column
  // and read as a second status.

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
          date: m.matchDate || undefined,
          result: coachEmailWinPhrase(m.opponentUtr, player.currentUTR),
        })),
    [matches, player.currentUTR]
  );

  // The date the current rating was logged, so the draft can say "as of"
  // it. Only when the newest utr_entries row IS the current rating — a date
  // attached to a different number would be a false statement. Same
  // "utr-entries" key as the dashboard, so this reuses its cached fetch.
  const { data: utrEntries = [] } = useSWR<UtrEntry[]>("utr-entries", () => loadUtrEntries());
  const utrRecordedAt = useMemo(() => {
    if (!hasRealUtr(player.currentUTR)) return null;
    const latest = utrEntries[utrEntries.length - 1];
    if (!latest || Math.abs(latest.utr - player.currentUTR) > 0.001) return null;
    return latest.recordedAt;
  }, [utrEntries, player.currentUTR]);


  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    targetSchools[0]?.slug ?? null
  );
  // The legacy-migration fallback lives inside the fetcher itself — SWR
  // calls it once per key and caches whichever result (remote or migrated
  // legacy) comes back, so the migration can't re-run on every revisit.
  const { data: statuses = {}, mutate: mutateStatuses, isLoading: statusesLoading } = useSWR<StatusMap>(
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only read of the ?school= deep link
  }, []);

  const selectedSchool = useMemo(
    () => targetSchools.find((s) => s.slug === selectedSlug) ?? targetSchools[0],
    [targetSchools, selectedSlug]
  );

  useEffect(() => {
    if (!selectedSchool) return;
    const email = buildCoachEmail(player, selectedSchool, results, { utrRecordedAt });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- statuses excluded on purpose (see above): it would stomp an in-progress reply note
  }, [selectedSchool, player, results, utrRecordedAt]);

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
    // Every target is on the board now, in Researching when it has no
    // outreach row yet (C13). A reminder is an UPDATE of that row, so a
    // school with none gets its "researching" row first — otherwise the
    // button on its card would silently do nothing.
    const hadRow = Boolean(statuses[slug]);
    const nowIso = new Date().toISOString();
    const remindAt = new Date(Date.now() + REMIND_ME_AFTER_DAYS * 86_400_000).toISOString();
    const base = statuses[slug] ?? { status: "researching" as OutreachStatus, updatedAt: nowIso };
    const next = { ...statuses, [slug]: { ...base, remindAt } };
    mutateStatuses(next, { revalidate: false });
    setOutreachError("");
    try {
      if (!hadRow) await saveCoachOutreachStatus(slug, "researching");
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

  // "New email": a fresh draft for any target school, whatever stage it is
  // in. It used to (a) list only schools with NO outreach row, so a school
  // ever touched (a stage move, "Remind me") could never get a new email,
  // and the button went dead — no reason shown — once every target had a
  // row; (b) write a "researching" row as a side effect, which changed
  // nothing visible because row-less targets already sit in Researching
  // (C13); and (c) swap the editor below the six-column board, off screen,
  // so nothing on screen appeared to happen. It writes nothing now, always
  // rebuilds the draft (even for the school already open), and the layout
  // scrolls the editor into view.
  const startNewEmail = (slug: string) => {
    const school = targetSchools.find((s) => s.slug === slug);
    if (!school) return;
    setSelectedSlug(slug);
    const email = buildCoachEmail(player, school, results, { utrRecordedAt });
    setSubject(email.subject);
    setBody(email.body);
    setRecipient("");
    setCopied(false);
  };

  const copyAll = async () => {
    // Same gate as the button's disabled state, re-checked here so a draft
    // with a [bracket] still in it can never reach the clipboard.
    if (!coachEmailActionState({ subject, body }).copy.enabled) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

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
          href="/schools"
          className={cn(buttonVariants({ variant: "primary", size: "md" }), "mt-6")}
        >
          Choose schools
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <SeededOutreachLayout
        loading={statusesLoading}
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
        startNewEmail={startNewEmail}
        setStatus={setStatus}
        setReminder={setReminder}
        outreachError={outreachError}
        replyNote={replyNote}
        setReplyNote={setReplyNote}
        saveReplyNote={saveReplyNote}
        recipient={recipient}
        setRecipient={setRecipient}
      />
    </div>
  );
}
