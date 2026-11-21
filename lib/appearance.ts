// Appearance preference: the one design (Seeded), in Light, Dark or Match
// system. Pure — no React, no Supabase — so the head script's rule, the
// provider and the signed-in sync can be tested against one definition.
//
// The Legacy design was deleted on 2026-11-20 (PR-LEGACY). Browsers and
// accounts that had picked it still hold the value "legacy" in two places:
//   - localStorage `seeded.design` (RETIRED_DESIGN_STORAGE_KEY), and
//   - `user_settings.notification_preferences.design` (RETIRED_DESIGN_BAG_KEY).
// No migration rewrites them (docs/TODO.md has the optional cleanup). This
// file is the ONE place that value is read: it means "Match system" — the
// Seeded design following the OS — never a crash and never Legacy.
// lib/no-legacy-theme.test.ts fails the build if "legacy" is read as a
// design anywhere else.

export type SeededMode = "dark" | "light";

/** localStorage key the deleted design switcher wrote ("legacy" | "seeded"). */
export const RETIRED_DESIGN_STORAGE_KEY = "seeded.design";
/** localStorage key the deleted Legacy palette picker wrote (grass, clay, night…). */
export const RETIRED_THEME_STORAGE_KEY = "seeded.theme";
/** Key in user_settings.notification_preferences the deleted switcher wrote. */
export const RETIRED_DESIGN_BAG_KEY = "design";

/** True for a stored value that picked the deleted Legacy design. */
export function choseRetiredDesign(value: unknown): boolean {
  return value === "legacy";
}

export function parseSeededMode(value: unknown): SeededMode | undefined {
  return value === "dark" || value === "light" ? value : undefined;
}

/**
 * Whether the browser follows the OS ("Match system"), from what it has
 * stored. A browser that never saved a preference follows the OS (a
 * brand-new visitor's first default); one that had picked Legacy follows it
 * too, whatever `seeded.mode.system` says. Mirrored by the head script in
 * app/layout.tsx, which runs before any bundle and cannot import this.
 */
export function resolveStoredSystemSync(stored: {
  systemSync: string | null;
  design: string | null;
}): boolean {
  if (choseRetiredDesign(stored.design)) return true;
  return stored.systemSync === null ? true : stored.systemSync === "1";
}

export interface RemoteAppearance {
  /** The account's saved Light/Dark choice, when it has one. */
  seededMode?: SeededMode;
  /** The account had picked Legacy: show Seeded, following the OS. */
  matchSystem: boolean;
}

/** Reads the appearance keys out of the user_settings preferences bag. */
export function parseRemoteAppearance(bag: Record<string, unknown> | null): RemoteAppearance | null {
  if (!bag) return null;
  if (choseRetiredDesign(bag[RETIRED_DESIGN_BAG_KEY])) return { matchSystem: true };
  return { seededMode: parseSeededMode(bag.seededMode), matchSystem: false };
}
