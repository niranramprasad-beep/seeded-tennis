"use client";

import type { Player } from "@/lib/types";
import type { MatchRecord, TournamentEntry, TournamentEntryStatus } from "@/lib/db/events";
import type { TrainingSession } from "@/lib/db/training";
import { SeededButton } from "@/components/seeded/ui/button";
import { UpcomingTournamentsCard } from "./upcoming-tournaments-card";
import { RecentResultsCard } from "./recent-results-card";
import { EventsCalendarCard } from "./events-calendar-card";

export interface SeededEventsLayoutProps {
  player: Player;
  tournamentEntries: TournamentEntry[];
  matches: MatchRecord[] | undefined;
  /** undefined while loading. */
  sessions: TrainingSession[] | undefined;
  onSetTournamentStatus: (id: string, status: TournamentEntryStatus) => void;
  onEditTournament: (entry: TournamentEntry) => void;
  onRemoveTournament: (entry: TournamentEntry) => void;
  /** Opens the session form; a date/time when it came from a calendar slot. */
  onAddSession: (date?: string, time?: string) => void;
  onEditSession: (session: TrainingSession) => void;
  onMoveSession: (id: string, date: string, startTime: string) => void;
  onResizeSession: (id: string, duration: number) => void;
  onLogResult: () => void;
}

// /events: the player's own schedule. The calendar is full width (it was
// squeezed into a 400px column — Mon–Thu visible, the rest behind a
// sideways scroll); tournaments and results sit below it, side by side, each
// as tall as its own content — stretched to match, a two-result card was a
// tall empty box beside a long tournament list (sweep C22). "Add session" is
// the screen's one green button.
// The mockup's "Recruiting" camp-invite row has no data source anywhere, so
// it is not drawn.
export function SeededEventsLayout({
  player,
  tournamentEntries,
  matches,
  sessions,
  onSetTournamentStatus,
  onEditTournament,
  onRemoveTournament,
  onAddSession,
  onEditSession,
  onMoveSession,
  onResizeSession,
  onLogResult,
}: SeededEventsLayoutProps) {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold tracking-tight text-ink">Events</h1>
          <p className="mt-1.5 text-stone">Your training, tournaments and results.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <SeededButton variant="secondary" onClick={onLogResult} className="flex-1 sm:flex-none">
            Log a result
          </SeededButton>
          <SeededButton onClick={() => onAddSession()} className="flex-1 sm:flex-none">
            Add session
          </SeededButton>
        </div>
      </div>

      <div className="mt-6">
        <EventsCalendarCard
          sessions={sessions}
          tournamentEntries={tournamentEntries}
          onAdd={onAddSession}
          onEdit={onEditSession}
          onOpenTournament={onEditTournament}
          onMove={onMoveSession}
          onResize={onResizeSession}
        />
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 md:items-start">
        <UpcomingTournamentsCard
          entries={tournamentEntries}
          playerUtr={player.currentUTR}
          onSetStatus={onSetTournamentStatus}
          onEdit={onEditTournament}
          onRemove={onRemoveTournament}
        />
        <RecentResultsCard matches={matches} />
      </div>
    </div>
  );
}
