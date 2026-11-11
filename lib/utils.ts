import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUTR(value: number): string {
  return value.toFixed(2).replace(/\.00$/, ".0");
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
