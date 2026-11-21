// Audit A-033. What this browser remembers about an account must not outlive
// the account's session on it: a shared family laptop would otherwise hand
// the next person the last one's role, outreach drafts, filters, verify-flow
// state and the rest. Called on every sign-out (lib/context/player-context.tsx
// signOut, which the sidebar, both Settings views and both account-deletion
// success paths go through) and again explicitly after a deletion.
//
// Kept, because they describe the browser, not the person:
//   - the Appearance choice (Light / Dark / Match system), and the retired
//     design key the pre-paint head script in app/layout.tsx still reads to
//     resolve it — clearing that one could flip a Match-system browser to a
//     fixed mode on the next load;
//   - "seeded.internal", which keeps our own browsers out of analytics.
//
// The Supabase session itself (sb-*-auth-token) is not ours to clear; its own
// signOut() does that.

import {
  RETIRED_DESIGN_STORAGE_KEY,
  SEEDED_MODE_STORAGE_KEY,
  SYSTEM_SYNC_STORAGE_KEY,
} from "@/lib/appearance";
import { GA_INTERNAL_FLAG_KEY } from "@/lib/ga-privacy";

export const SEEDED_STORAGE_PREFIX = "seeded.";

export const PRESERVED_ON_SIGN_OUT: readonly string[] = [
  SEEDED_MODE_STORAGE_KEY,
  SYSTEM_SYNC_STORAGE_KEY,
  RETIRED_DESIGN_STORAGE_KEY,
  GA_INTERNAL_FLAG_KEY,
];

type CleanableStorage = Pick<Storage, "length" | "key" | "removeItem">;

function defaultStorage(): CleanableStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Removes every "seeded.*" key except PRESERVED_ON_SIGN_OUT. Returns the
 * keys it removed. Never throws: storage that is missing or refuses access
 * is left alone. */
export function clearSeededLocalStorage(
  storage: CleanableStorage | null = defaultStorage()
): string[] {
  if (!storage) return [];
  const doomed: string[] = [];
  try {
    // Collect first: removing while walking shifts the indexes.
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(SEEDED_STORAGE_PREFIX) && !PRESERVED_ON_SIGN_OUT.includes(key)) {
        doomed.push(key);
      }
    }
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const key of doomed) {
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      // Keep going; one stuck key must not keep the rest.
    }
  }
  return removed;
}
