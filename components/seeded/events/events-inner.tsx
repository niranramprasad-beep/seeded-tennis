"use client";

import { useState } from "react";
import useSWR from "swr";
import type { TrainingPlan } from "@/lib/types";
import { AuthGate } from "@/components/shared/auth-gate";
import { PaidGate } from "@/components/shared/paid-gate";
import { usePlayer } from "@/lib/context/player-context";
import { loadMatches } from "@/lib/supabase/features";
import { loadTournamentEntries, setTournamentEntryStatus } from "@/lib/supabase/tournaments";
import { loadTrainingPlannerState, type TrainingPlannerState } from "@/lib/supabase/training";
import { DEFAULT_TYPES, TrainingView } from "@/components/training/training-view";
import { MatchModeView } from "@/components/matches/match-mode-view";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/seeded/ui/toast";
import { useEventsCalendar } from "@/lib/hooks/use-events-calendar";
import { SeededEventsLayout } from "./seeded-events-layout";

// A real-but-empty planner fallback for /events' calendar card. Unlike
// /training's own fallback (which seeds a personalized week from `plans` +
// the player's UTR), this card is read-mostly and shouldn't invent sessions
// nobody actually created — a brand-new user with zero real training_plans
// rows correctly sees an empty calendar here, exactly like /training does
// for the same user before they complete its onboarding questionnaire
// (that questionnaire's output, not this fallback, is what ever populates
// real sessions either way).
const EMPTY_PLANNER_STATE: TrainingPlannerState = {
  sessions: [],
  sessionTypes: DEFAULT_TYPES,
  plans: [],
  activePlanId: "",
  templates: [],
  preferences: undefined,
};

function trainingStorageKey(playerName: string): string {
  return `seeded.training.${playerName.replace(/\s+/g, "-").toLowerCase()}`;
}

export function EventsInner({ plans }: { plans: TrainingPlan[] }) {
  return (
    <AuthGate>
      <PaidGate
        required="player"
        feature="Events"
        blurb="Tournaments, match results, and practice in one real schedule — with a fit check on every event you're considering."
        perks={[
          "Fit-checked upcoming tournaments, scored against your real UTR",
          "Match results logged straight into your real history",
          "A real calendar for your own training sessions",
        ]}
      >
        <EventsContent plans={plans} />
      </PaidGate>
    </AuthGate>
  );
}

function EventsContent({ plans }: { plans: TrainingPlan[] }) {
  const { player } = usePlayer();
  const storageKey = trainingStorageKey(player.name);

  const { data: tournamentEntries = [], mutate: mutateTournaments } = useSWR(
    "tournament-entries",
    () => loadTournamentEntries()
  );
  // Same "matches" key MatchModeView/MatchHistoryView use — logging a result
  // in the drawer below (real <MatchModeView />) shares this exact SWR
  // cache entry, so this card's "Recent results" updates immediately.
  const { data: matches = [] } = useSWR("matches", () => loadMatches());
  // Same key tuple /training's own planner uses, so adding a session in the
  // drawer below (real <TrainingView />) shares this cache entry too.
  const { data: plannerState, mutate: mutatePlanner } = useSWR(
    ["training-planner-state", storageKey],
    () => loadTrainingPlannerState(EMPTY_PLANNER_STATE)
  );

  const [addSessionOpen, setAddSessionOpen] = useState(false);
  const [logResultOpen, setLogResultOpen] = useState(false);

  // Real add/edit/delete/move/resize/repeat CRUD for the calendar card's
  // own week view — reads and writes this exact plannerState/mutatePlanner
  // pair, the same training_plans/workout_sessions rows TrainingView (in
  // the drawer below) already owns. See lib/hooks/use-events-calendar.ts.
  const { addSession, updateSession, moveSession, resizeSession, deleteSession, toast, dismissToast } =
    useEventsCalendar(plannerState ?? EMPTY_PLANNER_STATE, mutatePlanner);

  const markEntered = async (id: string) => {
    mutateTournaments((prev = []) => prev.map((t) => (t.id === id ? { ...t, status: "entered" } : t)), {
      revalidate: false,
    });
    try {
      await setTournamentEntryStatus(id, "entered");
    } catch {
      // Best-effort optimistic update — a revalidation on next focus/mount
      // will correct the list if the write actually failed (e.g. migration
      // 013_tournament_entries.sql not applied yet).
    }
  };

  return (
    <>
      <SeededEventsLayout
        player={player}
        tournamentEntries={tournamentEntries}
        matches={matches}
        sessions={plannerState?.sessions ?? []}
        sessionTypes={plannerState?.sessionTypes ?? DEFAULT_TYPES}
        onMarkEntered={markEntered}
        onAddSession={() => setAddSessionOpen(true)}
        onLogResult={() => setLogResultOpen(true)}
        onAddCalendarSession={addSession}
        onUpdateCalendarSession={updateSession}
        onMoveCalendarSession={moveSession}
        onResizeCalendarSession={resizeSession}
        onDeleteCalendarSession={deleteSession}
      />

      <Drawer
        open={addSessionOpen}
        onClose={() => {
          setAddSessionOpen(false);
          mutatePlanner();
        }}
        title="Training"
        widthClass="max-w-4xl"
      >
        <TrainingView plans={plans} />
      </Drawer>

      <Drawer
        open={logResultOpen}
        onClose={() => setLogResultOpen(false)}
        title="Match mode"
        widthClass="max-w-4xl"
      >
        <MatchModeView />
      </Drawer>

      <Toast open={!!toast} onDismiss={dismissToast} variant={toast?.variant ?? "default"} action={toast?.action}>
        {toast?.message ?? " "}
      </Toast>
    </>
  );
}
