/**
 * Layout hints: what this browser last saw, kept ONLY so the next full page
 * load can reserve the right amount of space before React and the data
 * arrive. app/layout.tsx's head script copies them onto <html> as data
 * attributes; globals.css picks pre-session placeholders by them.
 *
 * They are never an access decision (RLS and route access decide that) and
 * never data: a role word and a page-shape word, no id, no name, no rating.
 * A wrong or stale hint costs one layout shift, nothing else. Every read and
 * write is wrapped, because private mode and blocked storage throw.
 *
 * The head script cannot import this file (it runs as an inline string
 * before any bundle), so it repeats the two keys and the allowed values;
 * lib/layout-hints.test.ts fails the build if the two drift apart.
 */

export const ROLE_HINT_KEY = "seeded.role";
export const SCHOOLS_SHAPE_KEY = "seeded.schools.shape";

/**
 * What /schools rendered above its list, last time it resolved:
 *  - "fit":    fit bands shown — the player's what-if panel, or a parent's
 *              block about their child's rating. Today's placeholders.
 *  - "nofit":  a parent's block with no bands (a locked free family, or a
 *              child who has not logged a rating). No band chips, no fit
 *              column, and the block's no-rating sentence is longer.
 *  - "prompt": the "Enter your UTR" banner and no bands — a player with no
 *              rating, or a parent with no linked player yet.
 *
 * Fit/no-fit alone was not enough: a parent can land on either of the last
 * two, and they differ in height by up to 40px at 375.
 */
export type SchoolsShape = "fit" | "nofit" | "prompt";
export const SCHOOLS_SHAPES: readonly SchoolsShape[] = ["fit", "nofit", "prompt"];

type HintStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): HintStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The /schools shape the page will render, from what it knows once resolved. */
export function schoolsShapeFor(input: {
  isParent: boolean;
  /** A player's own real rating (hasRealUtr). Ignored for a parent. */
  hasOwnUtr: boolean;
  /** A parent with a linked player in their family. Ignored for a player. */
  hasLinkedPlayer: boolean;
  /** The linked player's rating is readable (not null, not plan-locked). */
  childHasUtr: boolean;
}): SchoolsShape {
  if (!input.isParent) return input.hasOwnUtr ? "fit" : "prompt";
  if (!input.hasLinkedPlayer) return "prompt";
  return input.childHasUtr ? "fit" : "nofit";
}

export function readSchoolsShape(storage: HintStorage | null = defaultStorage()): SchoolsShape | null {
  try {
    const v = storage?.getItem(SCHOOLS_SHAPE_KEY);
    return SCHOOLS_SHAPES.includes(v as SchoolsShape) ? (v as SchoolsShape) : null;
  } catch {
    return null;
  }
}

export function rememberSchoolsShape(
  shape: SchoolsShape | null,
  storage: HintStorage | null = defaultStorage()
): void {
  try {
    if (shape) storage?.setItem(SCHOOLS_SHAPE_KEY, shape);
    else storage?.removeItem(SCHOOLS_SHAPE_KEY);
  } catch {
    /* private mode: placeholders fall back to the "fit" shape */
  }
}

/**
 * The signed-in account's role, for the next page load (a parent's /schools
 * placeholder is a different height from a player's). `null` is sign-out,
 * and clears every hint: none of them may outlive the account they describe.
 */
export function rememberRole(
  role: "parent" | "player" | null,
  storage: HintStorage | null = defaultStorage()
): void {
  try {
    if (role) storage?.setItem(ROLE_HINT_KEY, role);
    else storage?.removeItem(ROLE_HINT_KEY);
  } catch {
    /* private mode: placeholders fall back to the player's shape */
  }
  if (!role) rememberSchoolsShape(null, storage);
}
