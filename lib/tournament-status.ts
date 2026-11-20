// The status of a saved tournament (tournament_entries.status). Pure — no
// Supabase — so lib/family-budget.ts and lib/parent-dashboard.ts can use it
// without pulling in the client.

/**
 * The stored values. "saved" is shown as "Planning": the stored word was
 * kept so no existing row had to be rewritten (migration 047 only widened
 * the CHECK to add 'played'). "entered" and "played" both mean the family
 * paid for the event; the season budget counts both (isCommittedStatus).
 */
export type TournamentEntryStatus = "saved" | "entered" | "played";

/** In the order the control shows them: Planning → Entered → Played. */
export const TOURNAMENT_STATUSES: { value: TournamentEntryStatus; label: string }[] = [
  { value: "saved", label: "Planning" },
  { value: "entered", label: "Entered" },
  { value: "played", label: "Played" },
];

export const TOURNAMENT_STATUS_VALUES: TournamentEntryStatus[] = TOURNAMENT_STATUSES.map((s) => s.value);

export function tournamentStatusLabel(status: TournamentEntryStatus): string {
  return TOURNAMENT_STATUSES.find((s) => s.value === status)?.label ?? "Planning";
}

/** Entered or played: money the family has committed to this event. */
export function isCommittedStatus(status: TournamentEntryStatus): boolean {
  return status === "entered" || status === "played";
}
