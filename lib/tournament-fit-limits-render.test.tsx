import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The tournament checker, rendered. A shared link's query string fills the
// form, so each case below is one real way of arriving with a cost typed in.
const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(nav.query) }));

import { PlayerContext } from "@/lib/context/player-context";
import { emptyPlayer } from "@/lib/data/user";
import { SeededTournamentFitView } from "@/components/seeded/tournament-fit/seeded-tournament-fit-view";

// Bug hunt 2026-11-26. BUG-006: a travel cost over $50,000 was ignored (verdict
// and "Add to my events" went ahead). BUG-008: an entry fee over $50,000 said
// "add the entry fee", and the limit note was neither styled nor linked as an
// error. BUG-009: "$16667 / match", "$50000 entered so far".

const PLAYER = { ...emptyPlayer, name: "Test Player", role: "player" as const, currentUTR: 9.42 };
const CONTEXT = {
  player: PLAYER,
  isAuthed: true,
  hydrated: true,
  connectionError: null,
  userId: "00000000-0000-4000-8000-000000000001",
};

function render(query: string): string {
  nav.query = query;
  return renderToStaticMarkup(
    createElement(PlayerContext.Provider, { value: CONTEXT as never }, createElement(SeededTournamentFitView))
  );
}
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const tags = (html: string, name: string) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((m) => m[0]);
/** The two cost inputs, in the form's order: entry fee, then travel cost. */
const costInputs = (html: string) => tags(html, "input").filter((t) => /type="number"/.test(t));

const FORM = "level=L3&draw=9.6&utr=9.42&travel=local";
const LIMIT = "Each cost can be at most $50,000.";
const VERDICT_HEADLINE = /Worth it|Worth a look|Skip it/;
// The attribute, not Tailwind's `disabled:` variant classes that are on every button.
const DISABLED = /\sdisabled=""/;

/** The <button> that carries the "Add to my events" label. */
function addToEventsButton(html: string): string {
  const at = html.indexOf("Add to my events</button>");
  if (at < 0) throw new Error("no Add to my events button in the output");
  return html.slice(html.lastIndexOf("<button", at), at);
}

describe("sanity: the checker renders in a test", () => {
  it("a usable entry fee gives a verdict and an enabled Add button", () => {
    const html = render(`${FORM}&entry=60`);
    expect(text(html)).toMatch(VERDICT_HEADLINE);
    expect(addToEventsButton(html)).not.toMatch(DISABLED);
    expect(html).not.toContain('role="alert"');
  });
});

describe("BUG-006: a travel cost over the limit is refused, not ignored", () => {
  const html = render(`${FORM}&entry=60&travelCost=60000`);

  it("gives no verdict", () => {
    expect(text(html)).not.toMatch(VERDICT_HEADLINE);
  });

  it("keeps 'Add to my events' off, so nothing is saved without the cost", () => {
    expect(addToEventsButton(html)).toMatch(DISABLED);
  });

  it("says the limit where the verdict would be", () => {
    const verdictNote = /aria-live="polite"[^>]*>([^<]*)</.exec(html)?.[1] ?? "";
    expect(verdictNote.trim()).toBe(LIMIT);
  });

  it("marks the travel cost, not the entry fee, as the invalid field", () => {
    const [entry, travel] = costInputs(html);
    expect(travel).toContain('aria-invalid="true"');
    expect(entry).not.toContain("aria-invalid");
  });
});

describe("BUG-008: an entry fee over the limit says so, and the note is an error tied to the field", () => {
  const html = render(`${FORM}&entry=60000`);

  it("does not ask for an entry fee that was typed", () => {
    expect(text(html)).not.toContain("add the entry fee");
    expect(text(html)).toContain(LIMIT);
  });

  it("marks the entry fee invalid and points it at the note", () => {
    const [entry, travel] = costInputs(html);
    const note = tags(html, "p").find((t) => /role="alert"/.test(t)) ?? "";
    const noteId = /id="([^"]+)"/.exec(note)?.[1];
    expect(noteId).toBeTruthy();
    expect(entry).toContain('aria-invalid="true"');
    expect(entry).toContain(`aria-describedby="${noteId}"`);
    expect(travel).not.toContain("aria-invalid");
  });

  it("styles the note as an error (the error colour the form's other messages use)", () => {
    const note = tags(html, "p").find((t) => /role="alert"/.test(t)) ?? "";
    expect(note).toMatch(/\btext-error\b/);
    expect(note).not.toMatch(/\btext-stone\b/);
  });
});

describe("BUG-009: big amounts have thousands separators", () => {
  it("'$16,667 / match' and '$50,000 entered so far' at the entry fee limit", () => {
    const t = text(render(`${FORM}&entry=50000`));
    expect(t).toContain("$16,667 / match");
    expect(t).toContain("$50,000 entered so far");
    expect(t).not.toContain("$16667");
    expect(t).not.toContain("$50000");
  });

  it("small amounts are unchanged", () => {
    const t = text(render(`${FORM}&entry=60`));
    expect(t).toContain("$20 / match");
    expect(t).toContain("$60 entered so far");
  });
});
