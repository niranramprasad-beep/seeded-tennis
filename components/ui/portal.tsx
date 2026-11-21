"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Renders overlays on document.body.
 *
 * Every page used to sit inside AppShell's `animate-fade-in` wrapper (removed
 * 2026-11-20), and an animated element is its own stacking context — so a `z-50` drawer inside
 * the page could never rise above the `z-40` mobile header and bottom tab
 * bar. At 320px the check-in drawer's Save button sat under the tab bar
 * and could not be tapped (sweep C18, found by the staging run). Overlays
 * that must cover the whole screen render here instead. */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}
