"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "@/lib/context/player-context";
import { useDesign } from "@/lib/context/design-context";
import { loadDesignPreference, saveDesignPreference } from "@/lib/db/settings";

// Renders nothing — just reconciles the design/seededMode toggle with the
// signed-in user's profile. Signed-out visitors stay on localStorage only
// (handled entirely inside design-context.tsx).
export function DesignPreferenceSync() {
  const { isAuthed, hydrated: playerHydrated } = usePlayer();
  const { design, setDesign, seededMode, setSeededMode, hydrated: designHydrated } = useDesign();
  // Same "apply the remote value exactly once" guard training-view.tsx uses
  // for its own remote-state resolution — a later write-through effect
  // must never be mistaken for a fresh pull from the server.
  const appliedRemoteRef = useRef(false);
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!playerHydrated || !designHydrated || !isAuthed) return;
    if (appliedRemoteRef.current) return;
    appliedRemoteRef.current = true;
    loadDesignPreference().then((remote) => {
      if (!remote) return;
      if (remote.design && remote.design !== design) setDesign(remote.design);
      if (remote.seededMode && remote.seededMode !== seededMode) setSeededMode(remote.seededMode);
    });
    // Only re-run this pull if auth/hydration state changes, not on every
    // design/seededMode change (that's the write-through effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerHydrated, designHydrated, isAuthed]);

  useEffect(() => {
    if (!playerHydrated || !designHydrated || !isAuthed) return;
    if (!appliedRemoteRef.current) return;
    const key = `${design}:${seededMode}`;
    if (lastWrittenRef.current === key) return;
    lastWrittenRef.current = key;
    saveDesignPreference({ design, seededMode });
  }, [design, seededMode, isAuthed, playerHydrated, designHydrated]);

  return null;
}
