// Tournament Fit Finder — pure scoring logic.
//
// The verdict weighs three things a family actually trades off when picking
// events, using directionally-correct UTR reasoning:
//   1. Competition fit — UTR moves on results vs. opponents' ratings. Playing a
//      draw at or slightly above your level helps most; beating players far
//      below you does almost nothing, and a field far above you usually means
//      one early loss and little signal.
//   2. Cost per meaningful match — entry + travel spread over the matches a
//      junior event realistically guarantees.
//   3. Travel burden — hours on the road, forgiven somewhat for the rare
//      national-level opportunities that are worth traveling for.

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
  // Guaranteed-ish match count typical for the format (main draw + backdraw).
  typicalMatches: number;
}

// Real USTA junior structure: L1 is the top national tier, L7 is entry level.
// UTR events sit outside the USTA ladder and are rated purely by the draw.
export const LEVELS: LevelInfo[] = [
  { value: "L1", label: "L1 — National championship", scope: "national", description: "Highest USTA tier (e.g. Hard Courts, Winter Nationals). Deepest draws, biggest points.", typicalMatches: 4 },
  { value: "L2", label: "L2 — National", scope: "national", description: "National-level events one tier below the championships.", typicalMatches: 4 },
  { value: "L3", label: "L3 — National / closed sectional", scope: "national", description: "National events and top closed sectional championships.", typicalMatches: 3 },
  { value: "L4", label: "L4 — Sectional", scope: "sectional", description: "Strong sectional events; the backbone of a competitive schedule.", typicalMatches: 3 },
  { value: "L5", label: "L5 — Sectional / regional", scope: "sectional", description: "Regional draws inside your section.", typicalMatches: 3 },
  { value: "L6", label: "L6 — District", scope: "district", description: "District-level events for building match play.", typicalMatches: 3 },
  { value: "L7", label: "L7 — Entry level", scope: "district", description: "Entry tier — first tournaments and early match experience.", typicalMatches: 2 },
  { value: "utr", label: "UTR event", scope: "utr", description: "UTR-verified event. Strength comes entirely from the draw, so the average entrant UTR matters most.", typicalMatches: 3 },
];

// Rough player-UTR windows where each USTA level is usually competitive for
// juniors. Used ONLY when the user can't estimate draw strength — a real draw
// average always overrides this. Ranges are deliberately wide because level
// strength varies a lot by age division and section.
const LEVEL_UTR_WINDOW: Record<FitLevel, [number, number]> = {
  L1: [9, 16.5],
  L2: [8, 15],
  L3: [7, 13.5],
  L4: [6, 12],
  L5: [4.5, 10.5],
  L6: [3, 9],
  L7: [1, 7],
  utr: [1, 16.5],
};

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
  drawUtr: number | null; // average UTR of entrants, if known/estimated
  travelHours: number | null;
  distanceMiles: number | null;
  entryCost: number;
  travelCost: number;
}

export interface FitResult {
  verdict: Verdict;
  score: number; // 0-100
  competitionScore: number;
  costScore: number;
  travelScore: number;
  costPerMatch: number;
  totalCost: number;
  effectiveTravelHours: number;
  drawEstimated: boolean;
  reasons: FitReason[];
  suggestions: string[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// How much the field helps the rating, from the gap (draw avg − player UTR).
// Peak value sits at "similar to slightly stronger than you".
function competitionFromGap(gap: number): number {
  if (gap >= -0.5 && gap <= 1.0) return 100;
  if (gap > 1.0 && gap <= 2.0) return Math.round(100 - (gap - 1.0) * 45); // 100 → 55
  if (gap > 2.0) return Math.round(Math.max(20, 55 - (gap - 2.0) * 20));
  if (gap >= -1.5) return Math.round(100 + (gap + 0.5) * 40); // -0.5 → 100, -1.5 → 60
  return Math.round(Math.max(10, 60 + (gap + 1.5) * 30)); // fades toward 10
}

function competitionFromLevel(level: FitLevel, playerUtr: number): number {
  const [lo, hi] = LEVEL_UTR_WINDOW[level];
  if (playerUtr >= lo && playerUtr <= hi) {
    // Inside the window: better toward the middle-upper part of the band.
    const mid = (lo + hi) / 2;
    const half = (hi - lo) / 2;
    const off = Math.abs(playerUtr - mid) / half; // 0 center → 1 edge
    return Math.round(90 - off * 25);
  }
  const overshoot = playerUtr > hi ? playerUtr - hi : lo - playerUtr;
  return Math.round(Math.max(15, 60 - overshoot * 18));
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
  const drawEstimated = input.drawUtr == null;
  let competitionScore: number;

  if (input.drawUtr != null) {
    const drawUtr = clamp(input.drawUtr, UTR_MIN, UTR_MAX);
    const gap = drawUtr - playerUtr;
    competitionScore = competitionFromGap(gap);

    if (gap >= -0.5 && gap <= 1.0) {
      reasons.push({
        tone: "positive",
        text: `The field (avg UTR ${drawUtr.toFixed(1)}) sits right in your improvement zone — wins over similarly or slightly higher-rated players move your UTR the most.`,
      });
    } else if (gap > 1.0 && gap <= 2.0) {
      reasons.push({
        tone: "neutral",
        text: `The field averages ${gap.toFixed(1)} UTR above you. A win there is gold for your rating, but expect tough early rounds.`,
      });
      suggestions.push("Treat this as a stretch event — pair it with an at-level tournament the same month so you still bank winnable matches.");
    } else if (gap > 2.0) {
      reasons.push({
        tone: "negative",
        text: `The field averages ${gap.toFixed(1)} UTR above you — you'd likely be overmatched early, and one lopsided loss gives your rating very little to work with.`,
      });
      suggestions.push(`Look for a draw averaging within about 1 UTR of your ${playerUtr.toFixed(1)} — that's where results actually move ratings.`);
    } else if (gap >= -1.5) {
      reasons.push({
        tone: "neutral",
        text: `The field is a bit below you (${Math.abs(gap).toFixed(1)} UTR under). You should win matches, but the rating reward per win is limited.`,
      });
    } else {
      reasons.push({
        tone: "negative",
        text: `The field averages ${Math.abs(gap).toFixed(1)} UTR below you. Beating players far below your level does almost nothing for your UTR, even if you sweep the draw.`,
      });
      suggestions.push("Move up a level (or find a stronger UTR event) — you've outgrown this field.");
    }
  } else {
    competitionScore = competitionFromLevel(input.level, playerUtr);
    const [lo, hi] = LEVEL_UTR_WINDOW[input.level];
    if (playerUtr >= lo && playerUtr <= hi) {
      reasons.push({
        tone: "neutral",
        text: `No draw strength given, so this is estimated from the level: ${levelInfo.label.split("—")[0].trim()} events are typically competitive for players around UTR ${lo}–${Math.min(hi, 16.5)}, and you're at ${playerUtr.toFixed(1)}.`,
      });
    } else if (playerUtr > hi) {
      reasons.push({
        tone: "negative",
        text: `At UTR ${playerUtr.toFixed(1)} you're likely above the typical ${input.level === "utr" ? "" : `${input.level} `}field — expect little rating value from wins here.`,
      });
      suggestions.push("Check the entry list before committing — if the top seeds are 1+ UTR below you, pick a higher level.");
    } else {
      reasons.push({
        tone: "negative",
        text: `At UTR ${playerUtr.toFixed(1)} this level's typical field would be a big step up — you may run into much higher-rated players in round one.`,
      });
      suggestions.push("Build results at the level below first, then use this event as a target once you're inside its typical range.");
    }
    suggestions.push("If you can find the average entrant UTR (event page or last year's draw), re-run this — a real draw number beats the level estimate.");
  }

  /* ------------------------------------------------------- cost (weight 30) */
  const totalCost = Math.max(0, input.entryCost) + Math.max(0, input.travelCost);
  const costPerMatch = totalCost / levelInfo.typicalMatches;
  const costScore = costScoreFor(costPerMatch, levelInfo.scope);

  if (costScore >= 85) {
    reasons.push({
      tone: "positive",
      text: `Roughly $${Math.round(costPerMatch)} per expected match (~${levelInfo.typicalMatches} matches for this format) — efficient development spend.`,
    });
  } else if (costScore >= 50) {
    reasons.push({
      tone: "neutral",
      text: `About $${Math.round(costPerMatch)} per expected match ($${Math.round(totalCost)} total). Reasonable if the draw is right, but worth comparing to closer options.`,
    });
  } else {
    reasons.push({
      tone: "negative",
      text: `Around $${Math.round(costPerMatch)} per expected match ($${Math.round(totalCost)} total) is expensive for what this event likely returns.`,
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
  if (input.goalUtr != null && input.drawUtr != null) {
    const goalGap = input.goalUtr - playerUtr;
    if (goalGap > 0 && input.drawUtr >= playerUtr - 0.5) {
      reasons.push({
        tone: "positive",
        text: `This field points toward your goal of UTR ${input.goalUtr.toFixed(1)} — these are exactly the opponents you need results against to get there.`,
      });
    } else if (goalGap > 0 && input.drawUtr < playerUtr - 1.5) {
      reasons.push({
        tone: "negative",
        text: `You're chasing UTR ${input.goalUtr.toFixed(1)}, and this field can't give you the results that climb requires.`,
      });
    }
  }

  /* ------------------------------------------------------------- combine */
  const score = Math.round(
    competitionScore * 0.45 + costScore * 0.3 + travelScore * 0.25
  );
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
    totalCost,
    effectiveTravelHours,
    drawEstimated,
    reasons,
    suggestions,
  };
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${Math.round(hours * 10) / 10} hr${hours >= 2 ? "s" : ""}`;
}
