"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { AuthGate } from "@/components/shared/auth-gate";
import { PaidGate } from "@/components/shared/paid-gate";
import { usePlayer } from "@/lib/context/player-context";
import {
  deleteTournamentEntry,
  loadMatches,
  loadTournamentEntries,
  restoreTournamentEntry,
  setTournamentEntryStatus,
  tournamentStatusLabel,
  type TournamentEntry,
  type TournamentEntryStatus,
} from "@/lib/db/events";
import { loadTrainingSessions, type TrainingSession } from "@/lib/db/training";
import { Drawer } from "@/components/ui/drawer";
import { Toast, type ToastAction, type ToastVariant } from "@/components/seeded/ui/toast";
import { ConfirmDialog } from "@/components/seeded/ui/dialog";
import { MatchResultForm } from "@/components/matches/match-result-form";
import { SESSIONS_KEY, useEventsCalendar } from "@/lib/hooks/use-events-calendar";
import { formatDate } from "@/lib/time";
import { SeededEventsLayout } from "./seeded-events-layout";
import { SessionFormModal, type SessionFormResult } from "./session-form-modal";
import { TournamentEntryDialog } from "./tournament-entry-dialog";

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

interface PageToast {
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

const byEventDate = (a: TournamentEntry, b: TournamentEntry) => a.eventDate.localeCompare(b.eventDate);

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

  const [editingTournament, setEditingTournament] = useState<TournamentEntry | null>(null);
  const [pendingRemove, setPendingRemove] = useState<TournamentEntry | null>(null);
  const [removing, setRemoving] = useState(false);
  const [tournamentToast, setTournamentToast] = useState<PageToast | null>(null);
  const dismissTournamentToast = useCallback(() => setTournamentToast(null), []);

  // Optimistic, no revalidate: the row's status changes in place, and the
  // list sorts by date only, so nothing moves on the page.
  const setStatus = async (id: string, status: TournamentEntryStatus) => {
    const before = tournamentEntries.find((t) => t.id === id);
    void mutateTournaments((prev = []) => prev.map((t) => (t.id === id ? { ...t, status } : t)), { revalidate: false });
    try {
      await setTournamentEntryStatus(id, status);
    } catch (err) {
      // Re-read so the list shows what is really stored, and say so.
      void mutateTournaments();
      setTournamentToast({
        message: err instanceof Error && err.message ? err.message : "That change didn't save. Try again.",
        variant: "error",
      });
      return;
    }
    if (before) setTournamentToast({ message: `${before.name}: ${tournamentStatusLabel(status)}.`, variant: "success" });
  };

  // Same pattern as /matches: ask in the Seeded dialog, delete, then offer
  // Undo, which puts the same record back under the same id.
  const restoreTournament = async (entry: TournamentEntry) => {
    try {
      const restored = await restoreTournamentEntry(entry);
      await mutateTournaments((prev = []) => [...prev.filter((t) => t.id !== restored.id), restored].sort(byEventDate), {
        revalidate: false,
      });
      setTournamentToast({ message: "Tournament restored.", variant: "success" });
    } catch (err) {
      setTournamentToast({
        message: err instanceof Error && err.message ? err.message : "Could not restore it. Try again.",
        variant: "error",
      });
    }
  };

  const confirmRemove = async () => {
    const entry = pendingRemove;
    if (!entry) return;
    setRemoving(true);
    try {
      await deleteTournamentEntry(entry.id);
      await mutateTournaments((prev = []) => prev.filter((t) => t.id !== entry.id), { revalidate: false });
      setPendingRemove(null);
      setTournamentToast({
        message: "Tournament removed.",
        variant: "default",
        action: { label: "Undo", onClick: () => void restoreTournament(entry) },
      });
    } catch (err) {
      setPendingRemove(null);
      setTournamentToast({
        message: err instanceof Error && err.message ? err.message : "Could not remove it. Try again.",
        variant: "error",
      });
    } finally {
      setRemoving(false);
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
        onSetTournamentStatus={(id, status) => void setStatus(id, status)}
        onEditTournament={setEditingTournament}
        onRemoveTournament={setPendingRemove}
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

      <TournamentEntryDialog
        entry={editingTournament}
        onClose={() => setEditingTournament(null)}
        onSaved={(saved) => {
          setEditingTournament(null);
          void mutateTournaments((prev = []) => prev.map((t) => (t.id === saved.id ? saved : t)).sort(byEventDate), {
            revalidate: false,
          });
          setTournamentToast({ message: "Tournament saved.", variant: "success" });
        }}
      />

      <ConfirmDialog
        open={!!pendingRemove}
        title="Remove this tournament?"
        description={
          pendingRemove ? `${pendingRemove.name}, ${formatDate(pendingRemove.eventDate)}. You can undo right after.` : undefined
        }
        confirmLabel="Remove"
        busy={removing}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingRemove(null)}
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
      <Toast
        open={!!tournamentToast}
        onDismiss={dismissTournamentToast}
        variant={tournamentToast?.variant ?? "default"}
        action={tournamentToast?.action}
        duration={tournamentToast?.action ? 8000 : 4000}
      >
        {tournamentToast?.message ?? " "}
      </Toast>
      <Toast open={resultSaved} onDismiss={dismissResultToast} variant="success">
        Result saved.
      </Toast>
    </>
  );
}
