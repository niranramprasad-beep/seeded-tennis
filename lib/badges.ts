// Single source of truth for every badge Seeded can award — both the
// catalog shown on the Badges page and the thresholds evaluateBadges()
// checks against real player data are built from these same arrays, so the
// two can never drift the way they used to (the catalog used to start UTR
// badges at 6.0, leaving a realistic 5-6 UTR player with nothing earnable
// and nothing in reach).

export type BadgeType = "UTR" | "Tournament" | "Match" | "Training" | "Recruiting";

export interface BadgeDef {
  key: string;
  type: BadgeType;
  title: string;
  description: string;
}

// Covers the realistic junior UTR range end to end, so there's always a
// next badge in reach no matter where a player's rating actually sits.
export const UTR_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
export const TOURNAMENT_COUNTS = [1, 5, 10, 20, 30, 50, 75, 100];
export const STREAK_DAYS = [3, 7, 14, 30, 60, 100, 200, 365];
export const TRAINING_HOURS = [10, 25, 50, 100, 250, 500, 1000];
export const COACH_EMAIL_COUNTS = [5, 10, 20];

export const BADGE_CATALOG: BadgeDef[] = [
  ...UTR_LEVELS.map((n) => ({
    key: `utr-${n}`,
    type: "UTR" as const,
    title: `${n}.0 UTR`,
    description: `Reached ${n}.0 UTR.`,
  })),
  ...TOURNAMENT_COUNTS.map((n) => ({
    key: `tournaments-${n}`,
    type: "Tournament" as const,
    title: `${n} tournament${n === 1 ? "" : "s"}`,
    description: `Played ${n}+ tournament${n === 1 ? "" : "s"}.`,
  })),
  {
    key: "upset-1-utr",
    type: "Match",
    title: "Rated upset",
    description: "Beat someone 1.0+ UTR higher.",
  },
  {
    key: "win-streak-5",
    type: "Match",
    title: "Five match streak",
    description: "Won five matches in a row.",
  },
  {
    key: "win-streak-10",
    type: "Match",
    title: "Ten match streak",
    description: "Won ten matches in a row.",
  },
  ...STREAK_DAYS.map((n) => ({
    key: `streak-${n}`,
    type: "Training" as const,
    title: `${n} day streak`,
    description: `Checked in ${n} days in a row.`,
  })),
  ...TRAINING_HOURS.map((n) => ({
    key: `hours-${n}`,
    type: "Training" as const,
    title: `${n} hours trained`,
    description: `Logged ${n}+ planned training hours.`,
  })),
  ...COACH_EMAIL_COUNTS.map((n) => ({
    key: `coach-email-${n}`,
    type: "Recruiting" as const,
    title: `${n} coaches emailed`,
    description: `Sent outreach to ${n} programs.`,
  })),
  {
    key: "first-coach-reply",
    type: "Recruiting",
    title: "First coach reply",
    description: "Logged a coach reply.",
  },
];

const BADGE_BY_KEY = new Map(BADGE_CATALOG.map((b) => [b.key, b]));

/** Looks up a catalog entry by key — throws in dev if a key drifts out of
 * sync with the catalog above, instead of silently awarding a badge with no
 * title/description. */
export function badgeDef(key: string): BadgeDef {
  const def = BADGE_BY_KEY.get(key);
  if (!def) throw new Error(`No badge catalog entry for key "${key}"`);
  return def;
}

export function badgesByType(type: BadgeType): BadgeDef[] {
  return BADGE_CATALOG.filter((b) => b.type === type);
}
