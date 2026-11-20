"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What every overlay in the app must do while it is open, in one place.
 *
 * None of them did any of it: the shared Drawer, the budget modals, the
 * delete-account dialog, the note and session modals. Esc did nothing, Tab
 * walked out of the panel into the page behind the backdrop, closing left
 * focus on <body>, and the page behind still scrolled. The Drawer was not
 * even announced as a dialog. Found by the 2026-11-15 keyboard pass.
 *
 *  - Esc closes (unless `closeOnEscape` is false, e.g. while saving)
 *  - Tab / Shift+Tab stay inside the panel
 *  - focus moves into the panel on open and back to the opener on close
 *  - the page behind does not scroll
 *
 * `lib/dialog-a11y.test.ts` fails the build if an element with
 * aria-modal="true" exists in a component that does not call this hook.
 */
export function useDialog(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
  { closeOnEscape = true }: { closeOnEscape?: boolean } = {}
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    // Overflow only — deliberately NO compensating padding-right. The
    // scrollbar's width is reserved permanently by `scrollbar-gutter:
    // stable` on <html> (app/globals.css), so hiding it here moves nothing;
    // adding padding as well would shift the page the other way.
    document.body.style.overflow = "hidden";

    // Focus the first control inside the panel once it has mounted (the
    // panel animates in, so wait a frame).
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEscape) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      // Back to whatever opened it, if it is still on the page.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, closeOnEscape, panelRef]);
}
