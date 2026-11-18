import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUTR(value: number): string {
  return value.toFixed(2).replace(/\.00$/, ".0");
}

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
  return hasRealUtr(value) ? formatUTR(value) : "Not tracked";
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
