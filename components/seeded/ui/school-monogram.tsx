import { cn } from "@/lib/utils";
import type { Division } from "@/lib/types";

// Design polish round 1 (Figma "WD — NiranRamprasad — Seeded", 03/04b): a
// small initials tile so a school row isn't all text. Initials come from the
// school's own short name; the tint says the division. Nothing here needs a
// source, so it is what a school shows when it has no logo we may use, and
// what stays if a logo does not load (school-mark.tsx).

const SKIP = new Set(["of", "the", "at", "and", "university", "college", "u"]);

export function schoolInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s&-]/gu, " ")
    .split(/[\s-]+/)
    .filter((w) => w && !SKIP.has(w.toLowerCase()));
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  // An all-caps short word ("UCLA", "USC", the "NC" of "NC State") keeps its
  // own letters; a following word adds its initial ("NC State" → "NCS", not
  // "NS"), capped at four characters.
  const first = words[0];
  const isAcronym = first.length >= 2 && first.length <= 4 && first === first.toUpperCase() && /\p{L}/u.test(first);
  if (isAcronym) {
    return (words.length > 1 && first.length < 4 ? first + words[1][0] : first).toUpperCase();
  }
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  return (first[0] + words[1][0]).toUpperCase();
}

const DIVISION_TINT: Record<Division, string> = {
  D1: "border-grass-100 bg-grass-50 text-grass",
  D2: "border-[rgb(var(--c-sage-tint-border))] bg-[rgb(var(--c-sage-tint-bg))] text-[rgb(var(--c-sage-tint-text))]",
  D3: "border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]",
};

export function SchoolMonogram({
  name,
  division,
  size = "sm",
  className,
}: {
  name: string;
  division: Division;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[10px] border font-semibold tracking-tight",
        size === "lg" ? "h-12 w-12 text-base" : "h-9 w-9 text-xs",
        DIVISION_TINT[division],
        className
      )}
    >
      {schoolInitials(name)}
    </span>
  );
}
