"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type { SchoolLite } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { loadCoachOutreachDated } from "@/lib/db/outreach";
import { subjectKey } from "@/lib/db/family-scope";
import {
  loadBudgetExpenses,
  loadFamilyMembers,
  loadSeasonBudget,
  saveEncouragementNote,
  saveSeasonBudget,
  type FamilyMember,
} from "@/lib/db/family";
import { loadFamilyPlanStatus, type FamilyPlanStatus } from "@/lib/db/family-plan";
import { loadUtrEntriesFor } from "@/lib/db/plan";
import { loadTournamentEntries } from "@/lib/db/events";
import { multiPlayerNote, parentSidebarNote, pickFamilyPlayer, resolveFamilyPlayerFacts } from "@/lib/family-view";
import { buildSeasonBudgetSummary, canEditBudget } from "@/lib/family-budget";
import { buildParentDashboard } from "@/lib/parent-dashboard";
import { currentSeason } from "@/lib/time";
import { JoinRequestsCard } from "./join-requests-card";
import { FamilyMembersCard } from "./family-members-card";
import { FamilyPendingScreen, FamilyRequestDeclined, FamilyJoinPrompt } from "./family-pending-screen";
import { loadMyFamilyCode, loadFamilyRoster } from "@/lib/db/family-join";
import { loadMyPendingFamilyRequest, type PendingFamilyRequest } from "@/lib/db/family-join";
import { SendNoteModal } from "./send-note-modal";
import { EditBudgetModal } from "./budget-modals";
import { Toast } from "@/components/seeded/ui/toast";
import { useFitReport } from "@/lib/hooks/use-fit-report";
import { DashboardBody } from "./dashboard/dashboard-body";
import { FamilyDashboardSkeleton } from "./dashboard/dashboard-skeleton";
import { FamilyPlanPaywall } from "./dashboard/family-plan-paywall";
import * as L from "./dashboard/layout";

function seasonTitle(now: Date): string {
  const s = currentSeason(now);
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} ${now.getFullYear()}`;
}

// /family — Board 22, the parent's overview of their child's season.
//
// Whose rows: the CHILD's, by id (pickFamilyPlayer → { userId }), never the
// pooled family and never the parent's own profile. The season budget is
// the family's money, so its spend counts every player's entered events
// ("family-players"), explicitly. lib/data-scoping.test.ts holds both.
//
// What it computes: nothing. lib/parent-dashboard.ts turns the rows and the
// one fit report (useFitReport, the child's history) into every number and
// sentence; this file loads, gates and renders.
//
// Gates, in order: the family itself (pending / declined / no family / no
// player yet) — none of which is paywalled, because approving a joiner and
// recording an under-13's consent must work on any plan — then the Family
// plan, then the dashboard. Nothing renders until everything it needs has
// answered, and until then the skeleton holds the dashboard's exact boxes:
// that is what fixed PR A's 0.058 CLS on redirects into /family, where the
// cards used to fill in one at a time.
export function SeededFamilyOverview({ schools }: { schools: SchoolLite[] }) {
  const { player } = usePlayer();
  const now = useMemo(() => new Date(), []);

  const members = useSWR<FamilyMember[]>("family-members", () => loadFamilyMembers());
  const pending = useSWR<PendingFamilyRequest | null>("my-pending-family-request", () => loadMyPendingFamilyRequest());
  // A joiner's own profile has no family_code (they are linked through
  // parent_accounts), so the code has to come from the database.
  const code = useSWR<string | null>("my-family-code", () => loadMyFamilyCode());
  const roster = useSWR("family-roster", () => loadFamilyRoster());
  const plan = useSWR<FamilyPlanStatus>("family-plan-status", () => loadFamilyPlanStatus());
  const unlocked = plan.data?.unlocked === true;

  const playerMember = pickFamilyPlayer(members.data ?? []);
  const playerId = playerMember?.id ?? null;
  // Locked: none of these start. RLS would return them empty, and empty
  // reads as "no data", which is not what is true.
  const live = unlocked && playerId != null;

  const utrEntries = useSWR(live ? ["utr-entries", playerId] : null, () => loadUtrEntriesFor(playerId!));
  const outreach = useSWR(live ? ["coach-outreach-dated", subjectKey({ userId: playerId! })] : null, () =>
    loadCoachOutreachDated({ userId: playerId! })
  );
  const childEntries = useSWR(live ? ["tournament-entries", subjectKey({ userId: playerId! })] : null, () =>
    loadTournamentEntries({ userId: playerId! })
  );
  const familyEntries = useSWR(live ? ["tournament-entries", subjectKey("family-players")] : null, () =>
    loadTournamentEntries("family-players")
  );
  const seasonBudget = useSWR(live ? "season-budget" : null, () => loadSeasonBudget());
  const expenses = useSWR(live ? "budget-expenses" : null, () => loadBudgetExpenses());

  // Remembers that this tab saw a pending request, so a denial can be told
  // apart from "never asked". Deliberately not persisted.
  const sawPendingRef = useRef(false);
  if (pending.data) sawPendingRef.current = true;
  const refreshJoinState = async () => {
    await Promise.all([pending.mutate(), code.mutate(), roster.mutate(), members.mutate(), plan.mutate()]);
  };

  const familyCode = code.data ?? player.familyCode;
  const firstName = (playerMember?.name || "your player").split(" ")[0];
  // Never the viewer's own rating, class year or gender — see
  // lib/family-view.ts. A missing one stays missing.
  const facts = resolveFamilyPlayerFacts(playerMember, player);
  const targetSlugs = useMemo(() => playerMember?.targetSchoolSlugs ?? [], [playerMember]);
  const targetSchools = useMemo(() => schools.filter((s) => targetSlugs.includes(s.slug)), [schools, targetSlugs]);

  // The one fit report, on the child's real history. Without a class year
  // AND a gender there is no honest projection (the growth curve differs),
  // so the rating is withheld and the report is null — never a default.
  const projectable = facts.graduationYear != null && facts.gender != null;
  const fitReport = useFitReport({
    player: {
      currentUTR: projectable ? (facts.currentUtr ?? 0) : 0,
      graduationYear: facts.graduationYear ?? now.getFullYear(),
      gender: facts.gender ?? "female",
    },
    schools: targetSchools,
    historyUserId: playerId,
    withHistory: live,
  });

  const seasonLabel = seasonBudget.data?.seasonLabel ?? seasonTitle(now);
  const model = useMemo(() => {
    if (!live) return null;
    const summary = buildSeasonBudgetSummary({
      totalBudget: seasonBudget.data?.totalBudget ?? 0,
      playerUtr: facts.currentUtr,
      entries: familyEntries.data ?? [],
      expenses: expenses.data ?? [],
      judgedUserId: playerId,
    });
    return buildParentDashboard({
      childFirst: firstName,
      classYear: facts.graduationYear,
      gender: facts.gender,
      currentUtr: facts.currentUtr,
      utrEntries: utrEntries.data ?? [],
      fitReport,
      targetSchools,
      budgetSummary: summary,
      childEntries: childEntries.data ?? [],
      familyEntries: familyEntries.data ?? [],
      expenses: expenses.data ?? [],
      outreachUpdatedAt: Object.values(outreach.data ?? {}).map((v) => v.updatedAt),
      now,
    });
  }, [
    live,
    seasonBudget.data,
    facts.currentUtr,
    facts.graduationYear,
    facts.gender,
    familyEntries.data,
    expenses.data,
    playerId,
    firstName,
    utrEntries.data,
    fitReport,
    targetSchools,
    childEntries.data,
    outreach.data,
    now,
  ]);

  const [noteOpen, setNoteOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [toast, setToast] = useState("");

  const familyLoading = members.isLoading || pending.isLoading || code.isLoading || roster.isLoading || plan.isLoading;
  const dataLoading =
    utrEntries.isLoading ||
    outreach.isLoading ||
    childEntries.isLoading ||
    familyEntries.isLoading ||
    seasonBudget.isLoading ||
    expenses.isLoading;

  if (familyLoading || (live && dataLoading)) return <FamilyDashboardSkeleton />;

  if (pending.data) {
    return <FamilyPendingScreen request={pending.data} onChanged={() => void refreshJoinState()} />;
  }
  // A request that was here a moment ago and is now gone, from someone still
  // without a family, means it was denied (026 deletes on deny).
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
  if (!familyCode) return <FamilyJoinPrompt onJoined={() => void refreshJoinState()} />;

  // No approved PLAYER: nothing of a child's to show, on any plan. This is
  // the ordinary under-13 path (parent first, player joins after), so it is
  // a first-run screen — and the approval/consent card must be reachable.
  if (!playerMember) return <FamilyAwaitingPlayer familyCode={familyCode} />;

  if (!unlocked || !model) {
    return (
      <>
        <JoinRequestsSlot />
        <FamilyPlanPaywall page="overview" childFirst={firstName} />
      </>
    );
  }

  const sendNote = async (body: string) => {
    await saveEncouragementNote(body);
    setToast(`Note sent to ${firstName}.`);
  };
  const saveBudget = async (input: { seasonLabel: string; totalBudget: number }) => {
    const saved = await saveSeasonBudget(input);
    if (saved) seasonBudget.mutate(saved, { revalidate: false });
  };
  const canEdit = canEditBudget(player.role);

  return (
    <>
      <JoinRequestsSlot />
      <div key="family-overview" className={L.PAGE}>
        <DashboardBody
          model={model}
          eyebrow={now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          playerNote={multiPlayerNote(members.data ?? [], firstName)}
          canEditBudget={canEdit}
          onSendNote={() => setNoteOpen(true)}
          onEditBudget={() => setBudgetOpen(true)}
          seasonLabel={seasonLabel}
        />
        {/* The sidebar carries this on desktop; phones have a tab bar. */}
        <p className="mt-10 text-sm text-stone lg:hidden">{parentSidebarNote(firstName)}</p>
      </div>

      <SendNoteModal open={noteOpen} onClose={() => setNoteOpen(false)} playerName={firstName} onSend={sendNote} />
      {canEdit && (
        <EditBudgetModal
          open={budgetOpen}
          onClose={() => setBudgetOpen(false)}
          initialLabel={seasonLabel}
          initialTotal={seasonBudget.data?.totalBudget ?? 0}
          onSave={saveBudget}
        />
      )}
      <Toast open={!!toast} onDismiss={() => setToast("")} variant="success">
        {toast || " "}
      </Toast>
    </>
  );
}

/** Join requests (and under-13 consent) on any plan. Renders nothing on the
 *  usual day with no requests; its roster is loaded before the page shows,
 *  so it never pops in above a page that has already drawn. */
function JoinRequestsSlot() {
  return (
    <div className="mx-auto max-w-content container-px [&:has(>*)]:pt-10 [&>*]:mb-0">
      <JoinRequestsCard />
    </div>
  );
}

/** /family with no readable player row: who is in the family, who has asked
 *  to join, and the invite code — and deliberately no ratings, class year or
 *  targets, because there is no player data to base them on. */
function FamilyAwaitingPlayer({ familyCode }: { familyCode: string }) {
  return (
    <div className={L.PAGE}>
      <h1 className="font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">Your family</h1>
      <p className="mt-1.5 max-w-prose text-stone">
        No player data to show yet. Once a player&rsquo;s own account is linked to this family, their UTR, results,
        target schools and season budget show up here.
      </p>

      <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-xl border border-line bg-card p-5">
          <p className="font-medium text-ink">Nothing to show yet</p>
          <p className="mt-1.5 text-sm text-stone">
            Seeded won&rsquo;t estimate a rating, a class year or a target list for a player it hasn&rsquo;t met. Share
            your invite code and approve the request, and this page fills in with their real numbers.
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
