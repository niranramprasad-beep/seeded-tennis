"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { AuthGate } from "@/components/shared/auth-gate";
import { PaidGate } from "@/components/shared/paid-gate";
import { usePlayer } from "@/lib/context/player-context";
import { loadMatches, loadTournamentEntries, setTournamentEntryStatus } from "@/lib/db/events";
import { loadTrainingSessions, type TrainingSession } from "@/lib/db/training";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/seeded/ui/toast";
import { MatchResultForm } from "@/components/matches/match-result-form";
import { SESSIONS_KEY, useEventsCalendar } from "@/lib/hooks/use-events-calendar";
import { SeededEventsLayout } from "./seeded-events-layout";
import { SessionFormModal, type SessionFormResult } from "./session-form-modal";

export function EventsInner() {
  return (
    <AuthGate>
      <PaidGate
        required="player"
        feature="Events"
        // Sell only what Player actually adds. The tournament checker is free
        // on /tournament-fit (and "Add to my events" there writes a real
        // entry on Free), and a Free player logs a result on /matches —
        // neither table is tier-gated in RLS. What IS gated, by 010/019, is
        // the training calendar.
        blurb="Your own training calendar, with the tournaments and match results you log, on one schedule."
        perks={[
          "A calendar for the sessions you plan yourself",
          "Your sessions, tournaments and results on one schedule",
          "Weekly repeats you choose, removable in one go",
        ]}
      >
        <EventsContent />
      </PaidGate>
    </AuthGate>
  );
}

function EventsContent() {
  const { player } = usePlayer();

  const { data: tournamentEntries = [], mutate: mutateTournaments } = useSWR("tournament-entries", () =>
    loadTournamentEntries()
  );
  // Same "matches" key /matches uses: a result logged in the drawer below
  // shows in "Recent results" at once.
  const { data: matches } = useSWR("matches", () => loadMatches());
  // ONE list of sessions — Week and Month both render it (see
  // events-calendar-card.tsx). Only the player's own manual sessions; see
  // lib/db/training.ts for why old generated rows are not in it.
  const { data: sessions, mutate: mutateSessions } = useSWR<TrainingSession[]>(SESSIONS_KEY, () => loadTrainingSessions());

  const calendar = useEventsCalendar(sessions, mutateSessions);
  const [form, setForm] = useState<{ session: TrainingSession | null; date?: string; time?: string } | null>(null);
  const [logResultOpen, setLogResultOpen] = useState(false);
  const [resultSaved, setResultSaved] = useState(false);
  const dismissResultToast = useCallback(() => setResultSaved(false), []);

  const markEntered = async (id: string) => {
    mutateTournaments((prev = []) => prev.map((t) => (t.id === id ? { ...t, status: "entered" } : t)), {
      revalidate: false,
    });
    try {
      await setTournamentEntryStatus(id, "entered");
    } catch {
      // Revalidate so the list shows what is really stored.
      mutateTournaments();
    }
  };

  const save = (values: SessionFormResult) => {
    const editing = form?.session;
    setForm(null);
    if (editing) void calendar.updateSession(editing.id, values);
    else void calendar.addSession(values);
  };

  const remove = (scope: "one" | "series") => {
    const editing = form?.session;
    setForm(null);
    if (editing) void calendar.deleteSession(editing, scope);
  };

  return (
    <>
      <SeededEventsLayout
        player={player}
        tournamentEntries={tournamentEntries}
        matches={matches}
        sessions={sessions}
        onMarkEntered={markEntered}
        onAddSession={(date, time) => setForm({ session: null, date, time })}
        onEditSession={(session) => setForm({ session })}
        onMoveSession={(id, date, time) => void calendar.moveSession(id, date, time)}
        onResizeSession={(id, duration) => void calendar.resizeSession(id, duration)}
        onLogResult={() => setLogResultOpen(true)}
      />

      <SessionFormModal
        open={!!form}
        onClose={() => setForm(null)}
        session={form?.session ?? null}
        defaultDate={form?.date}
        defaultTime={form?.time}
        onSave={save}
        onDelete={remove}
      />

      <Drawer open={logResultOpen} onClose={() => setLogResultOpen(false)} title="Log a result">
        <MatchResultForm
          onSaved={() => {
            setLogResultOpen(false);
            setResultSaved(true);
          }}
        />
      </Drawer>

      <Toast
        open={!!calendar.toast}
        onDismiss={calendar.dismissToast}
        variant={calendar.toast?.variant ?? "default"}
        action={calendar.toast?.action}
        duration={calendar.toast?.action ? 8000 : 4000}
      >
        {calendar.toast?.message ?? " "}
      </Toast>
      <Toast open={resultSaved} onDismiss={dismissResultToast} variant="success">
        Result saved.
      </Toast>
    </>
  );
}
