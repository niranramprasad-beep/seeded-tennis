"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "@/lib/context/player-context";
import { systemMode, useDesign } from "@/lib/context/design-context";
import { loadDesignPreference, saveDesignPreference } from "@/lib/db/settings";

// Renders nothing — just reconciles the Light/Dark mode with the signed-in
// user's profile. Signed-out visitors stay on localStorage only (handled
// entirely inside design-context.tsx).
export function DesignPreferenceSync() {
  const { isAuthed, hydrated: playerHydrated } = usePlayer();
  const { seededMode, setSeededMode, setSystemSync, hydrated: designHydrated } = useDesign();
  // Same "apply the remote value exactly once" guard training-view.tsx uses
  // for its own remote-state resolution — a later write-through effect
  // must never be mistaken for a fresh pull from the server.
  const appliedRemoteRef = useRef(false);
  // Set once the server's stored value is known. Until then nothing is
  // written: the write-through below used to fire on the FIRST render of
  // every full page load (lastWrittenRef started null), so every page view
  // by a signed-in user upserted user_settings with the value it already
  // held. Migration 034 rate-limits that table's writes per hour, so after
  // a busy hour a real change — a theme switch, or the training
  // preferences that share this row — was refused "Too many changes at
  // once" (found by the overnight harness: HTTP 500 / 53400 on every
  // signed-in page once the bucket was empty).
  const syncReadyRef = useRef(false);
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!playerHydrated || !designHydrated || !isAuthed) return;
    if (appliedRemoteRef.current) return;
    appliedRemoteRef.current = true;
    loadDesignPreference().then((remote) => {
      let nextMode = seededMode;
      if (remote?.matchSystem) {
        // The account had picked the deleted Legacy design
        // (lib/appearance.ts): show Seeded, following the OS. Nothing is
        // written back for it — the baseline below is what this resolves
        // to, so only a real change from here on is saved.
        nextMode = systemMode();
        setSystemSync(true);
      } else if (remote?.seededMode) {
        nextMode = remote.seededMode;
        if (remote.seededMode !== seededMode) setSeededMode(remote.seededMode);
      }
      // What the server holds (or, if it has never stored one, what this
      // browser shows) is the baseline. Only a change FROM it is written.
      lastWrittenRef.current = nextMode;
      syncReadyRef.current = true;
    });
    // Only re-run this pull if auth/hydration state changes, not on every
    // seededMode change (that's the write-through effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time pull per auth/hydration change; writes are the next effect
  }, [playerHydrated, designHydrated, isAuthed]);

  useEffect(() => {
    if (!playerHydrated || !designHydrated || !isAuthed) return;
    if (!syncReadyRef.current) return;
    if (lastWrittenRef.current === seededMode) return;
    lastWrittenRef.current = seededMode;
    void saveDesignPreference({ seededMode });
  }, [seededMode, isAuthed, playerHydrated, designHydrated]);

  return null;
}
