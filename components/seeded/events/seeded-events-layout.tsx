"use client";

import Link from "next/link";
import type { Player } from "@/lib/types";
import type { MatchRecord } from "@/lib/supabase/features";
import type { TournamentEntry } from "@/lib/supabase/tournaments";
import type { TrainingPlannerSession, TrainingSessionType } from "@/lib/supabase/training";
import { SeededButton } from "@/components/seeded/ui/button";
import { UpcomingTournamentsCard } from "./upcoming-tournaments-card";
import { RecentResultsCard } from "./recent-results-card";
import { EventsCalendarCard } from "./events-calendar-card";

export interface SeededEventsLayoutProps {
  player: Player;
  tournamentEntries: TournamentEntry[];
  matches: MatchRecord[];
  sessions: TrainingPlannerSession[];
  sessionTypes: TrainingSessionType[];
  onMarkEntered: (id: string) => void;
  onAddSession: () => void;
  onLogResult: () => void;
}

// Pixel-exact to "15 Events (schedule + results).png" — the real merge of
// Legacy's two separate screens (Training's calendar, Match mode's log)
// into one schedule. "Upcoming tournaments" is real fit-checked storage
// (lib/supabase/tournaments.ts + lib/tournament-fit.ts's
// evaluateTournamentFit), not mockup copy; "Recent results" is the same
// real loadMatches() data /plan already shows; the calendar card is the
// real month planner's session data, restyled into this narrower column.
// The mockup's "Recruiting" camp-invite row (a coach-initiated ID camp
// invitation) has no real data source anywhere in this codebase — no
// coach-invitation tracking exists — so it's never rendered here, same
// discipline as every other "don't fabricate" call in this redesign.
export function SeededEventsLayout({
  player,
  tournamentEntries,
  matches,
  sessions,
  sessionTypes,
  onMarkEntered,
  onAddSession,
  onLogResult,
}: SeededEventsLayoutProps) {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-seeded text-[30px] font-semibold tracking-tight text-ink">Events</h1>
          <p className="mt-1.5 text-stone">Tournaments, results and practice in one schedule.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/tournament-fit">
            <SeededButton variant="secondary">Check a tournament</SeededButton>
          </Link>
          <SeededButton variant="secondary" onClick={onLogResult}>
            Log a result
          </SeededButton>
          <SeededButton variant="primary" onClick={onAddSession}>
            Add session
          </SeededButton>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <UpcomingTournamentsCard
            entries={tournamentEntries}
            playerUtr={player.currentUTR}
            onMarkEntered={onMarkEntered}
          />
          <RecentResultsCard matches={matches} />
        </div>
        <div className="min-w-0">
          <EventsCalendarCard sessions={sessions} sessionTypes={sessionTypes} tournamentEntries={tournamentEntries} />
        </div>
      </div>
    </div>
  );
}
