// Shared guard behind every global keydown shortcut in the app (currently
// just /schools' `/`, `j`/`k`, `s`) — the classic bug this exists to
// prevent is typing "s" in the search box silently starring a row instead
// of typing the letter. Duck-types the target rather than checking
// `instanceof HTMLElement` so it's testable in this project's plain "node"
// vitest environment (no jsdom dependency) while still matching real
// DOM elements' actual shape at runtime.
export function isEditableTarget(target: EventTarget | null): boolean {
  if (target == null || typeof target !== "object") return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable === true
  );
}
