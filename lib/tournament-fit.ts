// Tournament Fit Finder — pure scoring logic.
//
// The verdict weighs three things a family actually trades off when picking
// events, using directionally-correct UTR reasoning:
//   1. Competition fit — UTR moves on results vs. opponents' ratings. Playing a
//      draw at or slightly above your level helps most; beating players far
//      below you does almost nothing, and a field far above you usually means
//      one early loss and little signal. Judged ONLY from the draw's average
//      UTR the family enters — see FIELD_BANDS.
//   2. Cost per meaningful match — entry + travel spread over the matches a
//      junior event realistically guarantees.
//   3. Travel burden — hours on the road, forgiven somewhat for the rare
//      national-level opportunities that are worth traveling for.
//
// /methodology ("Tournament checker") states this rule in plain words.

import { formatPlayerUtr } from "@/lib/utils";

export const UTR_MIN = 1;
export const UTR_MAX = 16.5;

export type FitLevel =
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L5"
  | "L6"
  | "L7"
  | "utr";

export interface LevelInfo {
  value: FitLevel;
  label: string;
  scope: "national" | "sectional" | "district" | "utr";
  description: string;
  // Seeded's working assumption of the matches a format usually guarantees
  // (main draw + backdraw), used only to spread the cost per match. Not a
  // published USTA figure; /methodology says so.
  typicalMatches: number;
}

// Real USTA junior structure: L1 is the top national tier, L7 is entry level.
// UTR events sit outside the USTA ladder and are rated purely by the draw.
// The level no longer implies a UTR range (see FIELD_BANDS) — it sets only
// the cost-per-match divisor and whether long travel is forgiven.
export const LEVELS: LevelInfo[] = [
  { value: "L1", label: "L1 — National championship", scope: "national", description: "Highest USTA tier (e.g. Hard Courts, Winter Nationals). Deepest draws, biggest points.", typicalMatches: 4 },
  { value: "L2", label: "L2 — National", scope: "national", description: "National-level events one tier below the championships.", typicalMatches: 4 },
  { value: "L3", label: "L3 — National / closed sectional", scope: "national", description: "National events and top closed sectional championships.", typicalMatches: 3 },
  { value: "L4", label: "L4 — Sectional", scope: "sectional", description: "Strong sectional events; the backbone of a competitive schedule.", typicalMatches: 3 },
  { value: "L5", label: "L5 — Sectional / regional", scope: "sectional", description: "Regional draws inside your section.", typicalMatches: 3 },
  { value: "L6", label: "L6 — District", scope: "district", description: "District-level events for building match play.", typicalMatches: 3 },
  { value: "L7", label: "L7 — Entry level", scope: "district", description: "Entry tier — first tournaments and early match experience.", typicalMatches: 2 },
  { value: "utr", label: "UTR", scope: "utr", description: "UTR-verified event. Strength comes entirely from the draw, so the average entrant UTR matters most.", typicalMatches: 3 },
];

/**
 * The field rule. Every verdict is judged from ONE number the family types
 * in — the draw's average UTR (from the entry list or last year's draw) —
 * compared with the player's own UTR. gap = draw average − player UTR.
 *
 * There is deliberately NO level-to-UTR table any more. The old one ("L5
 * events are typically competitive for players around UTR 4.5–10.5") had no
 * source, and its windows were so wide that almost every player sat inside
 * almost every level, so almost everything came back "Worth it". A level
 * says nothing reliable about who enters one event (age division and section
 * swing it by several UTR), so without a draw average the checker says
 * NOT_ENOUGH_INFO instead of guessing. /methodology prints these bands from
 * this constant.
 */
export const FIELD_BANDS = {
  /** Draw average from 0.5 below to 1.0 above the player: wins here move a rating most. */
  inRange: { below: 0.5, above: 1.0 },
  /** More than 1.0 and up to 2.0 above: a stretch — "Worth a look" at best. */
  stretchAbove: 2.0,
  /** More than 0.5 and up to 1.5 below: a bit easy — "Worth a look" at best. */
  easyBelow: 1.5,
} as const;

export type FieldBand = "in-range" | "stretch" | "easy" | "too-strong" | "too-weak";

/** Which band a draw average falls in for this player. Pure. */
export function fieldBand(drawUtr: number, playerUtr: number): FieldBand {
  const gap = round2(drawUtr - playerUtr);
  if (gap > FIELD_BANDS.stretchAbove) return "too-strong";
  if (gap > FIELD_BANDS.inRange.above) return "stretch";
  if (gap >= -FIELD_BANDS.inRange.below) return "in-range";
  if (gap >= -FIELD_BANDS.easyBelow) return "easy";
  return "too-weak";
}

/** What the checker, /events and the family pages say when the draw's
 *  average UTR is the only thing missing. */
export const NOT_ENOUGH_INFO = "Not enough info. Add the draw's average UTR for a real verdict.";

export type VerdictBlocker = "level" | "utr" | "entry fee" | "draw";

/**
 * What the checker still needs before it may say "Worth it" or "Skip it".
 * A verdict with no fee scored a blank cost as "$0 / match" and still said
 * "Worth it" (production sweep C15), and a verdict before the level was
 * chosen judged whichever level happened to be pre-selected. The draw's
 * average UTR joined the list in PR D (D5): the verdict is judged from the
 * field relative to the player, and nothing else in the form says who
 * enters. Returns what is missing, in the order the form asks for it; empty
 * means a verdict may be shown. An entry fee of 0 is a real answer (a free
 * event), not missing.
 */
export function verdictBlockers(input: {
  level: FitLevel | null;
  playerUtr: number | null;
  entryCost: number | null;
  drawUtr: number | null;
}): VerdictBlocker[] {
  const missing: VerdictBlocker[] = [];
  if (input.level == null) missing.push("level");
  if (!isUtr(input.playerUtr)) missing.push("utr");
  if (input.entryCost == null || !Number.isFinite(input.entryCost) || input.entryCost < 0) {
    missing.push("entry fee");
  }
  if (!isUtr(input.drawUtr)) missing.push("draw");
  return missing;
}

function isUtr(v: number | null): v is number {
  return v != null && Number.isFinite(v) && v >= UTR_MIN && v <= UTR_MAX;
}

const BLOCKER_PHRASE: Record<VerdictBlocker, string> = {
  level: "choose the level",
  utr: "enter a UTR",
  "entry fee": "add the entry fee",
  draw: "add the draw's average UTR",
};

/** "To see a verdict, choose the level and add the entry fee." — or, when
 *  only the draw is missing, NOT_ENOUGH_INFO. */
export function verdictBlockerSentence(blockers: VerdictBlocker[]): string {
  if (blockers.length === 0) return "";
  if (blockers.length === 1 && blockers[0] === "draw") return NOT_ENOUGH_INFO;
  const parts = blockers.map((b) => BLOCKER_PHRASE[b]);
  const joined =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `To see a verdict, ${joined}.`;
}

export type Verdict = "good" | "decent" | "bad";

export interface FitReason {
  tone: "positive" | "neutral" | "negative";
  text: string;
}

export interface FitInput {
  name: string;
  level: FitLevel;
  playerUtr: number;
  goalUtr: number | null;
  /** Average UTR of the draw's entrants. Required — without it there is no
   *  verdict (verdictBlockers → "draw"); use checkTournamentFit() for rows
   *  whose fields may be blank. */
  drawUtr: number;
  travelHours: number | null;
  distanceMiles: number | null;
  entryCost: number | null; // null = not entered — must not be scored as "free"
  travelCost: number | null;
}

export interface FitResult {
  verdict: Verdict;
  score: number; // 0-100
  competitionScore: number;
  costScore: number;
  travelScore: number;
  costPerMatch: number;
  /** The matches `costPerMatch` divides by — this level's typical count. */
  typicalMatches: number;
  totalCost: number;
  /** False when neither entry nor travel cost was entered: cost is Not tracked. */
  costKnown: boolean;
  /** Only one of entry / travel cost was entered. */
  costPartial: boolean;
  effectiveTravelHours: number;
  /** draw average − player UTR, to two decimals. */
  fieldGap: number;
  fieldBand: FieldBand;
  reasons: FitReason[];
  suggestions: string[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// How much the field helps the rating, from the gap (draw avg − player UTR).
// Peak value sits at "similar to slightly stronger than you" — FIELD_BANDS'
// in-range band.
function competitionFromGap(gap: number): number {
  if (gap >= -0.5 && gap <= 1.0) return 100;
  if (gap > 1.0 && gap <= 2.0) return Math.round(100 - (gap - 1.0) * 45); // 100 → 55
  if (gap > 2.0) return Math.round(Math.max(20, 55 - (gap - 2.0) * 20));
  if (gap >= -1.5) return Math.round(100 + (gap + 0.5) * 40); // -0.5 → 100, -1.5 → 60
  return Math.round(Math.max(10, 60 + (gap + 1.5) * 30)); // fades toward 10
}

function costScoreFor(costPerMatch: number, scope: LevelInfo["scope"]): number {
  // National-tier events justify more spend per match.
  const scale = scope === "national" ? 1.6 : 1;
  const c = costPerMatch / scale;
  if (c <= 50) return 100;
  if (c <= 100) return 88;
  if (c <= 175) return 70;
  if (c <= 275) return 50;
  if (c <= 400) return 32;
  return 15;
}

function travelScoreFor(hours: number, scope: LevelInfo["scope"]): number {
  let score: number;
  if (hours <= 1) score = 100;
  else if (hours <= 2.5) score = 85;
  else if (hours <= 4) score = 65;
  else if (hours <= 6) score = 45;
  else if (hours <= 9) score = 30;
  else score = 18;
  // A true national opportunity is worth the drive/flight.
  if (scope === "national") score = Math.min(100, score + 18);
  return score;
}

export function evaluateTournamentFit(input: FitInput): FitResult {
  const levelInfo = LEVELS.find((l) => l.value === input.level) ?? LEVELS[3];
  const playerUtr = clamp(input.playerUtr, UTR_MIN, UTR_MAX);

  const reasons: FitReason[] = [];
  const suggestions: string[] = [];

  /* ------------------------------------------------ competition (weight 45) */
  const drawUtr = clamp(input.drawUtr, UTR_MIN, UTR_MAX);
  const gap = round2(drawUtr - playerUtr);
  const band = fieldBand(drawUtr, playerUtr);
  const competitionScore = competitionFromGap(gap);
  const gapText = Math.abs(gap).toFixed(1);

  if (band === "in-range") {
    reasons.push({
      tone: "positive",
      text: `The field (avg UTR ${drawUtr.toFixed(1)}) sits right in your improvement zone — wins over similarly or slightly higher-rated players move your UTR the most.`,
    });
  } else if (band === "stretch") {
    reasons.push({
      tone: "neutral",
      text: `The field averages ${gapText} UTR above you. A win there is gold for your rating, but expect tough early rounds.`,
    });
    suggestions.push("Treat this as a stretch event — pair it with an at-level tournament the same month so you still bank winnable matches.");
  } else if (band === "too-strong") {
    reasons.push({
      tone: "negative",
      text: `The field averages ${gapText} UTR above you — you'd likely be overmatched early, and one lopsided loss gives your rating very little to work with.`,
    });
    suggestions.push(`Look for a draw averaging within about 1 UTR of your ${formatPlayerUtr(playerUtr)} — that's where results actually move ratings.`);
  } else if (band === "easy") {
    reasons.push({
      tone: "neutral",
      text: `The field is a bit below you (${gapText} UTR under). You should win matches, but the rating reward per win is limited.`,
    });
  } else {
    reasons.push({
      tone: "negative",
      text: `The field averages ${gapText} UTR below you. Beating players far below your level does almost nothing for your UTR, even if you sweep the draw.`,
    });
    suggestions.push("Move up a level (or find a stronger UTR event) — you've outgrown this field.");
  }

  /* ------------------------------------------------------- cost (weight 30) */
  // A blank entry fee or travel cost means "not entered," not "$0" — treating
  // it as free made every unanswered cost field score as a perfect 100,
  // regardless of what the tournament actually costs.
  const costKnown = input.entryCost != null || input.travelCost != null;
  const costPartial =
    costKnown && (input.entryCost == null || input.travelCost == null);
  const totalCost = Math.max(0, input.entryCost ?? 0) + Math.max(0, input.travelCost ?? 0);
  const costPerMatch = totalCost / levelInfo.typicalMatches;
  // With nothing entered there's nothing to score honestly — a neutral
  // default instead of the misleadingly perfect "$0/match = 100" result.
  const costScore = costKnown ? costScoreFor(costPerMatch, levelInfo.scope) : 60;
  const partialNote = costPartial
    ? ` (only ${input.entryCost == null ? "travel cost" : "entry fee"} entered — add the other for a real total)`
    : "";

  if (!costKnown) {
    reasons.push({
      tone: "neutral",
      text: "No entry fee or travel cost entered, so cost isn't scored yet — add them for a real cost-per-match read.",
    });
    suggestions.push("Enter the entry fee and travel cost to see whether this event is actually worth the spend.");
  } else if (costScore >= 85) {
    reasons.push({
      tone: "positive",
      text: `Roughly $${Math.round(costPerMatch)} per expected match (~${levelInfo.typicalMatches} matches for this format)${partialNote} — efficient development spend.`,
    });
  } else if (costScore >= 50) {
    reasons.push({
      tone: "neutral",
      text: `About $${Math.round(costPerMatch)} per expected match ($${Math.round(totalCost)} total)${partialNote}. Reasonable if the draw is right, but worth comparing to closer options.`,
    });
  } else {
    reasons.push({
      tone: "negative",
      text: `Around $${Math.round(costPerMatch)} per expected match ($${Math.round(totalCost)} total)${partialNote} is expensive for what this event likely returns.`,
    });
    suggestions.push("Compare cost per match across 2-3 candidate events — the same budget often buys twice the matches closer to home.");
  }

  /* ----------------------------------------------------- travel (weight 25) */
  const effectiveTravelHours =
    input.travelHours ?? (input.distanceMiles != null ? input.distanceMiles / 60 : 1.5);
  const travelScore = travelScoreFor(effectiveTravelHours, levelInfo.scope);

  if (travelScore >= 80) {
    reasons.push({
      tone: "positive",
      text: `~${formatHours(effectiveTravelHours)} of travel keeps the weekend low-stress and recovery easy.`,
    });
  } else if (travelScore >= 50) {
    reasons.push({
      tone: "neutral",
      text: `~${formatHours(effectiveTravelHours)} of travel is manageable${levelInfo.scope === "national" ? ", and a national-level draw can justify it" : ", but it adds up over a season"}.`,
    });
  } else {
    reasons.push({
      tone: "negative",
      text: `~${formatHours(effectiveTravelHours)} of travel is a heavy lift${levelInfo.scope === "national" ? ", though national events are sometimes worth it" : " for a non-national event"}.`,
    });
    if (levelInfo.scope !== "national") {
      suggestions.push("Save long trips for L1-L3 or strong UTR events; cover sectional-level match play closer to home.");
    }
  }

  /* --------------------------------------------------------- goal context */
  if (input.goalUtr != null) {
    const goalGap = input.goalUtr - playerUtr;
    if (goalGap > 0 && drawUtr >= playerUtr - 0.5) {
      reasons.push({
        tone: "positive",
        text: `This field points toward your goal of UTR ${formatPlayerUtr(input.goalUtr)} — these are exactly the opponents you need results against to get there.`,
      });
    } else if (goalGap > 0 && drawUtr < playerUtr - 1.5) {
      reasons.push({
        tone: "negative",
        text: `You're chasing UTR ${formatPlayerUtr(input.goalUtr)}, and this field can't give you the results that climb requires.`,
      });
    }
  }

  /* ------------------------------------------------------------- combine */
  let score = Math.round(
    competitionScore * 0.45 + costScore * 0.3 + travelScore * 0.25
  );
  // The field sets the ceiling; cost and travel can only pull it down.
  //   too strong / too weak → "Skip it", however cheap and close;
  //   a stretch / a bit easy → "Worth a look" at best;
  //   in range              → "Worth it" when cost and travel allow.
  // Before PR D the only cap was a competition score ≤ 40, so a local, cheap
  // event whose field sat 2 UTR below the player still read "Worth it".
  if (band === "too-strong" || band === "too-weak") score = Math.min(score, 44);
  else if (band === "stretch" || band === "easy") score = Math.min(score, 69);
  const verdict: Verdict = score >= 70 ? "good" : score >= 45 ? "decent" : "bad";

  if (verdict === "good" && suggestions.length === 0) {
    suggestions.push("Enter early — the right-sized draws fill fastest, and top seeds often decide late.");
  }

  return {
    verdict,
    score,
    competitionScore,
    costScore,
    travelScore,
    costPerMatch,
    typicalMatches: levelInfo.typicalMatches,
    totalCost,
    costKnown,
    costPartial,
    effectiveTravelHours,
    fieldGap: gap,
    fieldBand: band,
    reasons,
    suggestions,
  };
}

/**
 * evaluateTournamentFit for a row whose fields may be blank — a saved
 * tournament, a half-filled form. Null whenever verdictBlockers() names
 * anything missing, so no caller can score a blank draw or a blank fee.
 */
export function checkTournamentFit(
  input: Omit<FitInput, "drawUtr" | "level" | "playerUtr"> & {
    level: FitLevel | null;
    playerUtr: number | null;
    drawUtr: number | null;
  }
): FitResult | null {
  const { level, playerUtr, drawUtr, entryCost } = input;
  if (verdictBlockers({ level, playerUtr, entryCost, drawUtr }).length > 0) return null;
  if (level == null || playerUtr == null || drawUtr == null) return null;
  return evaluateTournamentFit({ ...input, level, playerUtr, drawUtr });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${Math.round(hours * 10) / 10} hr${hours >= 2 ? "s" : ""}`;
}
