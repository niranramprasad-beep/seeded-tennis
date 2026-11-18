import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * THE formatter for a player's own rating — logged, current, typed, in a
 * chip, a chart label, an input, a coach email or an export. Always two
 * decimals: 5.95, 5.80, 9.00.
 *
 * UTR is published to two decimals, and `utr_entries.utr` / `profiles.
 * current_utr` are numeric(4,2). Rounding one to a single decimal is not a
 * display choice, it is a different rating: 5.95 printed as "6.0" on the
 * school page, the tournament checker and — worst — the subject line of a
 * coach email a minor signs ("UTR 6.0 (self-reported)"). Guarded by
 * lib/player-utr-format.test.ts.
 *
 * Estimates (the projection to the summer before senior year, team ranges)
 * are a different kind of number and use `formatUtrEstimate` — see
 * docs/DECISIONS.md, 2026-11-18.
 */
export function formatPlayerUtr(value: number): string {
  return value.toFixed(2);
}

/**
 * A number Seeded estimated rather than one a player logged: the projection
 * to the summer before senior year, a team's floor/average/range. One
 * decimal, because a second would claim a precision the estimate does not
 * have (lib/fit.ts rounds projections to 0.1 for the same reason).
 */
export function formatUtrEstimate(value: number): string {
  return value.toFixed(1);
}

/** Picks between the two by what the number IS — for a value that is an
 * estimate before the summer before senior year and the player's real
 * rating after it (lib/fit.ts `RecruitingTimeUtr.isProjected`). */
export function formatUtrFor(value: number, isEstimate: boolean): string {
  return isEstimate ? formatUtrEstimate(value) : formatPlayerUtr(value);
}

/** @deprecated Use `formatPlayerUtr`. Kept as an alias so existing callers
 * get the same two-decimal rule instead of the old "9.0" / "9.50" mix. */
export const formatUTR = formatPlayerUtr;

/** True when this is a UTR somebody actually entered.
 *
 * `currentUTR <= 0` is this codebase's convention for "not logged yet"
 * (lib/fit.ts:94, explainSchoolFit's note, lib/data/user.ts). Use this
 * wherever a rating is DISPLAYED, so an unknown one reads "Not tracked"
 * instead of "0.0" — which would be a different invented number, not an
 * improvement on 7.0. */
export function hasRealUtr(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** `formatUTR` for display: the number when it is real, "Not tracked"
 * otherwise. */
export function formatUtrOrNotTracked(value: number | null | undefined): string {
  return hasRealUtr(value) ? formatPlayerUtr(value) : "Not tracked";
}

/** What a UTR input starts with: the player's rating at two decimals (the
 * chip beside it says "5.80"; the input said "5.8" — C19), or empty when
 * there is none, so the 0 sentinel never appears as "0.00" in a field. */
export function utrInputValue(value: number | null | undefined): string {
  return hasRealUtr(value) ? formatPlayerUtr(value) : "";
}

export function monthsBetween(from: Date, to: Date): number {
  return Math.max(
    0,
    (to.getFullYear() - from.getFullYear()) * 12 +
      (to.getMonth() - from.getMonth())
  );
}

// Guards the coach-outreach "To" field: the recipient is typed by the user
// (Seeded stores no coach contacts — P0-3), so this is the only thing between
// a typo and a Gmail compose window addressed to nobody. Deliberately a
// shape check, not RFC 5322 — it exists to catch "coach@" and "no spaces
// allowed", and nothing client-side can tell us an address really exists.
const EMAIL_SHAPE = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

export function isValidEmailAddress(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 254 && EMAIL_SHAPE.test(trimmed);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** "1 match", "2 matches", "0 matches". The one way a count meets a noun —
 * "1 matches logged" shipped because every screen hand-rolled its own
 * `${n} …s`. Pass both forms: English plurals are not a suffix rule
 * ("match"/"matches", "entry"/"entries"). */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
