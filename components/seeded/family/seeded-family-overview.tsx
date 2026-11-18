"use client";

import { ParentScopeLine } from "@/components/seeded/family/parent-scope-line";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRef } from "react";
import useSWR from "swr";
import type { SchoolLite } from "@/lib/types";
import { SeededButton } from "@/components/seeded/ui/button";
import { usePlayer } from "@/lib/context/player-context";
import { loadCoachOutreachDated } from "@/lib/db/outreach";
import { subjectKey } from "@/lib/db/family-scope";
import { loadFamilyMembers, saveEncouragementNote, type FamilyMember } from "@/lib/db/family";
import { loadUtrEntriesFor } from "@/lib/db/plan";
import { loadTournamentEntries } from "@/lib/db/events";
import { loadBudgetExpenses, loadSeasonBudget, saveBudgetExpense, saveSeasonBudget } from "@/lib/db/family";
import { utrDeltaWithBaseline } from "@/lib/plan-stats";
import { pickFamilyPlayer, resolveFamilyPlayerFacts } from "@/lib/family-view";
import { buildSeasonBudgetSummary, canEditBudget, pendingSkipDecisions } from "@/lib/family-budget";
import { currentSeason, getCurrentGrade, parseLocalDate } from "@/lib/time";
import { gradeStandingName } from "@/lib/utr-projection";
import { formatUTR } from "@/lib/utils";
import { SeasonBudgetCard } from "./season-budget-card";
import { NeedsDecisionCard } from "./needs-decision-card";
import { FamilyMembersCard } from "./family-members-card";
import { JoinRequestsCard } from "./join-requests-card";
import {
  FamilyPendingScreen,
  FamilyRequestDeclined,
  FamilyJoinPrompt,
} from "./family-pending-screen";
import { loadMyFamilyCode, loadFamilyRoster } from "@/lib/db/family-join";
import { loadMyPendingFamilyRequest, type PendingFamilyRequest } from "@/lib/db/family-join";
import { SendNoteModal } from "./send-note-modal";
import { Toast } from "@/components/seeded/ui/toast";
import { useFitReport } from "@/lib/hooks/use-fit-report";
import { ProjectionNote } from "@/components/seeded/ui/projection-note";

function seasonTitle(now: Date): string {
  const s = currentSeason(now);
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} ${now.getFullYear()}`;
}

// Pixel-exact to "18 Parent view + budget.png" — the real Seeded parent
// Overview. Every number traces to a real source:
//   - UTR + delta: loadUtrEntries() (now family-readable, migration 015)
//     against the player's family row, same utrDeltaWithBaseline() math
//     /plan already charts.
//   - coaches emailed/replied + target schools + "on track for N of M":
//     the real target-school list (now surfaced on FamilyMember, since a
//     parent's OWN profile has no target_school_slugs of its own) scored
//     against loadCoachOutreachDated()/classifySchoolFit() — the exact
//     same sources and the exact same "on track" rule (fit !== reach &&
//     fit !== out-of-range) /today's own badge uses.
//   - season budget: lib/family-budget.ts's buildSeasonBudgetSummary(),
//     combining real tournament_entries + budget_expenses (migration 015).
export function SeededFamilyOverview({ schools }: { schools: SchoolLite[] }) {
  const { player } = usePlayer();
  const now = useMemo(() => new Date(), []);

  const { data: members = [], isLoading: membersLoading } = useSWR<FamilyMember[]>("family-members", () =>
    loadFamilyMembers()
  );
  // The PLAYER's history, explicitly — same reason as the weekly report.
  const playerUserId = pickFamilyPlayer(members)?.id ?? null;
  const { data: utrEntries } = useSWR(
    playerUserId ? ["utr-entries", playerUserId] : null,
    () => loadUtrEntriesFor(playerUserId!)
  );
  // The player's outreach, by id; the budget's spend across the family's
  // players, explicitly. See lib/db/family-scope.ts DataSubject.
  const { data: outreach } = useSWR(
    playerUserId ? ["coach-outreach-dated", subjectKey({ userId: playerUserId })] : null,
    () => loadCoachOutreachDated({ userId: playerUserId! })
  );
  const { data: tournamentEntries = [] } = useSWR(
    ["tournament-entries", subjectKey("family-players")],
    () => loadTournamentEntries("family-players")
  );
  const { data: seasonBudget, mutate: mutateSeasonBudget } = useSWR("season-budget", () => loadSeasonBudget());
  const { data: expenses = [], mutate: mutateExpenses } = useSWR("budget-expenses", () => loadBudgetExpenses());
  // A pending joiner can read nothing, so /family would otherwise render as
  // a page of empty cards. Show them where they actually are instead.
  const { data: pendingRequest, mutate: mutatePending, isLoading: pendingLoading } = useSWR<PendingFamilyRequest | null>(
    "my-pending-family-request",
    () => loadMyPendingFamilyRequest()
  );
  // A joiner's own profile has no family_code (they are linked through
  // parent_accounts), so the invite code has to come from the database.
  const { data: resolvedFamilyCode, mutate: mutateFamilyCode, isLoading: codeLoading } = useSWR<string | null>(
    "my-family-code",
    () => loadMyFamilyCode()
  );
  const { mutate: mutateRoster } = useSWR("family-roster", () => loadFamilyRoster());
  const familyCode = resolvedFamilyCode ?? player.familyCode;

  // Remembers that this tab saw a pending request, so a denial can be told
  // apart from "never asked". Deliberately not persisted.
  const sawPendingRef = useRef(false);
  if (pendingRequest) sawPendingRef.current = true;

  const refreshJoinState = async () => {
    await Promise.all([mutatePending(), mutateFamilyCode(), mutateRoster()]);
  };

  const playerMember = pickFamilyPlayer(members);
  // Never the viewer's own name — see the weekly report.
  const playerName = playerMember?.name || "your player";
  const firstName = playerName.split(" ")[0];
  // `playerMember?.currentUtr ?? player.currentUTR` looked harmless and was
  // not: when the family has no approved PLAYER, `player` is the signed-in
  // PARENT's own profile, whose current_utr is null in the database and whose
  // Player mapping substitutes the `emptyPlayer` placeholder of 7
  // (lib/auth.ts:455, lib/data/user.ts). /family rendered "7.0 UTR" for a
  // rating that exists nowhere. Found while capturing the real screenshots
  // for TASK B — the /dev/family-preview fixture had a UTR, so it hid this.
  //
  // Null now means "not tracked" and is rendered as those words. The `??`
  // is gone on purpose: a player member with a null UTR must NOT fall
  // through to the viewer's own number.
  const playerFacts = resolveFamilyPlayerFacts(playerMember, player);
  const currentUTR = playerFacts.currentUtr;
  // Same correction as the UTR above, for the same reason. An independent
  // review pointed out that fixing only `currentUtr` left these two still
  // falling through to the signed-in PARENT's own row whenever the player's
  // value is null — so a parent's graduation_year could be printed as the
  // player's class year (the original bug report named exactly that), and
  // the parent's gender could pick the growth curve used to project the
  // player's UTR. A girl's trajectory drawn with her father's curve is a
  // fabricated number with extra steps.
  const graduationYear = playerFacts.graduationYear;
  const gender = playerFacts.gender ?? undefined;
  // A parent's OWN profile has no target schools of its own — always prefer
  // the real PLAYER row's list (see FamilyMember's targetSchoolSlugs
  // comment in lib/db/family.ts (formerly lib/supabase/features.ts)).
  const targetSlugs = playerMember?.targetSchoolSlugs ?? player.targetSchoolSlugs;
  const targetSchools = useMemo(
    () => schools.filter((s) => targetSlugs.includes(s.slug)),
    [schools, targetSlugs]
  );

  // A class year we do not have is not a class year we may guess at. The
  // standing line only renders when this is real.
  const grade = graduationYear == null ? null : getCurrentGrade(graduationYear, now);
  const standing = grade == null ? null : gradeStandingName(grade);
  const seasonWord = currentSeason(now);

  // A projection needs a real UTR, a real class year AND a real gender (the
  // growth curve differs). Missing any one of them means there is no
  // trajectory to draw, so this returns null and classifySchoolFit is never
  // called — the one-fit-path rule stays intact.
  const fitProjection = useMemo(() => {
    if (currentUTR == null || graduationYear == null || gender == null) return null;
    const real = (utrEntries ?? []).map((e) => ({ date: parseLocalDate(e.recordedAt), utr: e.utr }));
    const utrHistory = real.length > 0 ? real : [{ date: now, utr: currentUTR }];
    return { utrHistory, graduationYear, gender, now };
  }, [utrEntries, currentUTR, graduationYear, gender, now]);

  // null, not 0. "on track for 0 of 5 targets" is a claim — and a
  // discouraging one to show a parent — when the truth is that we cannot
  // tell yet.
  // Same report as every other screen. A parent reading "on track for 3 of
  // 5" here and the player seeing different bands on /schools was exactly
  // the kind of contradiction this consolidation exists to remove.
  // currentUTR/graduationYear/gender are all nullable here: this screen
  // renders for a PARENT, reading facts about someone else's profile that
  // may not be filled in. Zeroes would be a claim; the hook returns null
  // for an unusable rating and the UI says "not tracked yet".
  const fitReport = useFitReport({
    player: {
      currentUTR: currentUTR ?? 0,
      graduationYear: graduationYear ?? new Date().getFullYear(),
      gender: gender ?? "male",
    },
    schools: targetSchools,
  });
  const onTrackCount = useMemo(
    () =>
      fitReport == null
        ? null
        : targetSchools.filter((s) => {
            const fit = fitReport.bandBySlug.get(s.slug);
            return fit != null && fit !== "reach" && fit !== "out-of-range";
          }).length,
    [targetSchools, fitReport]
  );

  const utrDelta = useMemo(
    () => (utrEntries ? utrDeltaWithBaseline(utrEntries, 6, now) : null),
    [utrEntries, now]
  );

  const outreachForTargets = useMemo(
    () => Object.entries(outreach ?? {}).filter(([slug]) => targetSlugs.includes(slug)),
    [outreach, targetSlugs]
  );
  const emailedCount = outreachForTargets.filter(([, v]) => v.status !== "researching").length;
  const repliedCount = outreachForTargets.filter(([, v]) =>
    ["replied", "call_visit", "offer", "committed"].includes(v.status)
  ).length;

  const seasonLabel = seasonBudget?.seasonLabel ?? seasonTitle(now);
  const totalBudget = seasonBudget?.totalBudget ?? 0;
  const budgetSummary = useMemo(
    () =>
      buildSeasonBudgetSummary({
        totalBudget,
        playerUtr: currentUTR,
        entries: tournamentEntries,
        expenses,
        judgedUserId: playerUserId,
      }),
    [totalBudget, currentUTR, tournamentEntries, expenses, playerUserId]
  );

  const decisions = useMemo(
    () => pendingSkipDecisions(tournamentEntries, currentUTR, playerUserId).slice(0, 3),
    [tournamentEntries, currentUTR, playerUserId]
  );

  const [noteOpen, setNoteOpen] = useState(false);
  const [toast, setToast] = useState("");

  const sendNote = async (body: string) => {
    await saveEncouragementNote(body);
    setToast(`Note sent to ${firstName}.`);
  };

  const saveBudget = async (input: { seasonLabel: string; totalBudget: number }) => {
    const saved = await saveSeasonBudget(input);
    if (saved) mutateSeasonBudget(saved, { revalidate: false });
  };

  const addExpense = async (input: Parameters<typeof saveBudgetExpense>[0]) => {
    const saved = await saveBudgetExpense(input);
    if (saved) mutateExpenses([saved, ...expenses], { revalidate: false });
  };

  // Until these three have answered, every branch below would be a guess:
  // with the roster still loading, a parent with a player saw "no player has
  // joined yet" for half a second; a parent who joined with the code saw the
  // join-a-family prompt. A skeleton instead, keyed so its nodes are not
  // reused by the real page (which Chrome would count as a layout shift).
  if (membersLoading || pendingLoading || codeLoading) {
    return (
      <div key="family-skeleton" className="mx-auto max-w-content container-px py-10" aria-busy="true">
        <p className="sr-only" role="status">Loading your family…</p>
        <div className="h-[72px] animate-pulse rounded-lg bg-line/40 motion-reduce:animate-none" aria-hidden />
        <div className="mt-6 h-10 w-72 animate-pulse rounded-lg bg-line/50 motion-reduce:animate-none" aria-hidden />
        <div className="mt-6 min-h-[50vh] animate-pulse rounded-xl bg-line/40 motion-reduce:animate-none" aria-hidden />
      </div>
    );
  }

  if (pendingRequest) {
    return <FamilyPendingScreen request={pendingRequest} onChanged={() => void refreshJoinState()} />;
  }

  // A request that was here a moment ago and is now gone, from someone still
  // without a family, means it was denied (026 deletes on deny rather than
  // recording a refusal). Session-scoped on purpose — see the comment on
  // FamilyRequestDeclined.
  if (sawPendingRef.current && !familyCode) {
    return (
      <FamilyRequestDeclined
        onRetry={() => {
          sawPendingRef.current = false;
          void refreshJoinState();
        }}
      />
    );
  }

  if (!familyCode) {
    return <FamilyJoinPrompt onJoined={() => void refreshJoinState()} />;
  }

  // A parent whose family has no approved PLAYER has no player data to show.
  // Everything below this line reads the player's row; with no player member
  // it read the PARENT's own row instead and presented it as the player's —
  // "<parent's first name>'s recruiting", the parent's graduation_year as the
  // class year, and the placeholder UTR. None of it was the player's and the
  // UTR was nobody's.
  //
  // This is the ordinary under-13 path, where the parent creates the account
  // first and the player joins after, so it is a first-run screen, not an
  // edge case.
  if (!playerMember && player.role !== "player") {
    return <FamilyAwaitingPlayer familyCode={familyCode} />;
  }

  return (
    <div key="family-overview" className="mx-auto max-w-content container-px py-10">
      <ParentScopeLine />
      <div className="h-6" aria-hidden />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">
            {firstName}&rsquo;s recruiting
          </h1>
          <p className="mt-1.5 text-stone">
            {[
              graduationYear == null ? null : `Class of ${graduationYear}`,
              standing == null
                ? null
                : `${standing.charAt(0).toUpperCase()}${standing.slice(1)} ${seasonWord}`,
              targetSchools.length === 0
                ? null
                : onTrackCount == null
                  ? `${targetSchools.length} target${targetSchools.length === 1 ? "" : "s"} · not enough data to say how many are in range`
                  : `on track for ${onTrackCount} of ${targetSchools.length} targets`,
            ]
              .filter(Boolean)
              .join(" · ") || "No player details to show yet."}
          </p>
          {targetSchools.length > 0 && (
            <ProjectionNote utr={fitReport?.utr} who={firstName} className="mt-1.5 max-w-2xl" />
          )}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <SeededButton variant="secondary" onClick={() => setNoteOpen(true)}>
            Send {firstName} a note
          </SeededButton>
          <Link href="/family/weekly-reports">
            <SeededButton>This week&rsquo;s report</SeededButton>
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          value={currentUTR == null ? "No UTR yet" : formatUTR(currentUTR)}
          label={
            <>
              UTR
              {utrDelta && (
                <>
                  {" · "}
                  <span className="text-grass">
                    {utrDelta.delta >= 0 ? "+" : ""}
                    {utrDelta.delta.toFixed(2)}
                  </span>{" "}
                  since {monthName(utrDelta.baselineDate)}
                </>
              )}
            </>
          }
        />
        <StatTile value={`${emailedCount} / ${repliedCount}`} label="coaches emailed / replied" />
        <StatTile value={String(targetSchools.length)} label="Target schools" />
        <StatTile value={money(budgetSummary.remaining)} label="left in season budget" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <SeasonBudgetCard
            seasonLabel={seasonLabel}
            summary={budgetSummary}
            compact
            canEdit={canEditBudget(player.role)}
            onSaveBudget={saveBudget}
            onAddExpense={addExpense}
          />
        </div>
        <div className="space-y-4">
          <JoinRequestsCard />
          <NeedsDecisionCard decisions={decisions} />
          <FamilyMembersCard familyCode={familyCode} />
        </div>
      </div>

      <SendNoteModal open={noteOpen} onClose={() => setNoteOpen(false)} playerName={firstName} onSend={sendNote} />
      <Toast open={!!toast} onDismiss={() => setToast("")} variant="success">
        {toast || " "}
      </Toast>
    </div>
  );
}

/** /family with no readable player row. Shows the real state of the family —
 * who is in it, who has asked to join, and the invite code — and deliberately
 * shows no ratings, class year or targets, because there is no player data to
 * base them on.
 *
 * The copy deliberately says "no player data to show" rather than "nobody has
 * joined": an APPROVED joiner's profile is currently unreadable by the parent
 * (their `profiles.family_code` stays NULL and `family_members_read` requires
 * it to be non-null — see docs/TODO.md), so "nobody has joined" would be a
 * false statement on a screen that is listing that very person under Family
 * members. */
function FamilyAwaitingPlayer({ familyCode }: { familyCode: string }) {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <h1 className="font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">
        Your family
      </h1>
      <p className="mt-1.5 max-w-prose text-stone">
        No player data to show yet. Once a player&rsquo;s own account is linked
        to this family, their UTR, results, target schools and season budget
        show up here.
      </p>

      <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-xl border border-line bg-card p-5">
          <p className="font-medium text-ink">Nothing to show yet</p>
          <p className="mt-1.5 text-sm text-stone">
            Seeded won&rsquo;t estimate a rating, a class year or a target list
            for a player it hasn&rsquo;t met. Share your invite code and approve
            the request, and this page fills in with their real numbers.
          </p>
        </div>
        <div className="space-y-4">
          <JoinRequestsCard />
          <FamilyMembersCard familyCode={familyCode} />
        </div>
      </div>
    </div>
  );
}

function StatTile({ value, label }: { value: string; label: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <p className="font-mono text-3xl text-ink">{value}</p>
      <p className="mt-1.5 text-sm text-stone">{label}</p>
    </div>
  );
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function monthName(iso: string): string {
  return new Date(`${iso.length <= 10 ? iso + "T00:00:00" : iso}`).toLocaleDateString("en-US", { month: "long" });
}
