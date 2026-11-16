// Pure logic behind the Tournament Fit screen's "Share with my coach"
// button. There's no backend sharing/link infrastructure anywhere in this
// codebase, so the only honest, functional version of "share" is a real
// deep link: encode what the player entered as query params on /tournament-
// fit's own URL, and let the live calculator re-derive the identical verdict
// when the link is opened — no server round-trip, nothing fabricated.
//
// Kept framework-free (no useSearchParams/window here) so it's unit-testable
// without a DOM, and reusable from both the live view and its tests.
import { LEVELS, UTR_MAX, UTR_MIN, type FitLevel } from "./tournament-fit";

// The mockup's Travel control is three discrete pills, not a free-form
// number — "Local"/"1-3 hrs"/"Overnight" map to a representative travelHours
// figure fed into evaluateTournamentFit. These are deliberately round,
// documented numbers (not measured), same honesty bar as the rest of this
// screen's "estimate" framing.
export type TravelPill = "local" | "short" | "overnight";

export const TRAVEL_PILLS: { value: TravelPill; label: string; hours: number }[] = [
  { value: "local", label: "Local", hours: 0.5 },
  { value: "short", label: "1-3 hrs", hours: 2 },
  { value: "overnight", label: "Overnight", hours: 5 },
];

export function travelHoursForPill(pill: TravelPill): number {
  return TRAVEL_PILLS.find((p) => p.value === pill)?.hours ?? TRAVEL_PILLS[0].hours;
}

export interface ShareableFitState {
  name: string;
  level: FitLevel;
  /** null = "use whatever UTR the opener has" (their own profile, if any). */
  playerUtr: number | null;
  travel: TravelPill;
  entryCost: number | null;
  travelCost: number | null;
}

const PARAM = {
  name: "name",
  level: "level",
  utr: "utr",
  travel: "travel",
  entry: "entry",
  travelCost: "travelCost",
} as const;

/** Builds the query string for a shareable /tournament-fit deep link. Omits any field that's empty/null so a partial check still produces a clean URL. */
export function encodeTournamentFitShareParams(state: ShareableFitState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.name.trim()) params.set(PARAM.name, state.name.trim());
  params.set(PARAM.level, state.level);
  if (state.playerUtr != null && Number.isFinite(state.playerUtr)) {
    params.set(PARAM.utr, state.playerUtr.toFixed(2));
  }
  params.set(PARAM.travel, state.travel);
  if (state.entryCost != null && Number.isFinite(state.entryCost)) {
    params.set(PARAM.entry, String(state.entryCost));
  }
  if (state.travelCost != null && Number.isFinite(state.travelCost)) {
    params.set(PARAM.travelCost, String(state.travelCost));
  }
  return params;
}

/**
 * Reads a /tournament-fit URL's query params back into partial calculator
 * state. Every field is validated against the same bounds the live
 * calculator itself enforces (real FitLevel, UTR_MIN..UTR_MAX, a real travel
 * pill) — a malformed or tampered link degrades to "field left at its
 * default" per-field, never a crash or a silently out-of-range score.
 */
export function decodeTournamentFitShareParams(
  params: URLSearchParams
): Partial<ShareableFitState> {
  const out: Partial<ShareableFitState> = {};

  const name = params.get(PARAM.name);
  if (name && name.trim()) out.name = name.trim().slice(0, 200);

  const level = params.get(PARAM.level);
  if (level && LEVELS.some((l) => l.value === level)) out.level = level as FitLevel;

  const utrRaw = params.get(PARAM.utr);
  if (utrRaw !== null) {
    const utr = Number(utrRaw);
    if (Number.isFinite(utr) && utr >= UTR_MIN && utr <= UTR_MAX) out.playerUtr = utr;
  }

  const travel = params.get(PARAM.travel);
  if (travel && TRAVEL_PILLS.some((p) => p.value === travel)) out.travel = travel as TravelPill;

  const entryRaw = params.get(PARAM.entry);
  if (entryRaw !== null) {
    const entry = Number(entryRaw);
    if (Number.isFinite(entry) && entry >= 0) out.entryCost = entry;
  }

  const travelCostRaw = params.get(PARAM.travelCost);
  if (travelCostRaw !== null) {
    const travelCost = Number(travelCostRaw);
    if (Number.isFinite(travelCost) && travelCost >= 0) out.travelCost = travelCost;
  }

  return out;
}
