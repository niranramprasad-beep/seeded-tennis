// The kinds of session a player can put on their own calendar. A fixed
// list: the old /training page let a player invent types and stored them
// in user_settings, but that page is gone (it also generated plans — see
// lib/training-no-autogen.test.ts) and a row with an unknown type simply
// shows as the first type here.
//
// Colours are tokens, never hex (design system v2), so they follow the
// light/dark theme. They mark the session's left edge and its month dot —
// never a fill behind text.

export interface SessionType {
  id: string;
  label: string;
  color: string;
}

export const SESSION_TYPES: SessionType[] = [
  { id: "tennis", label: "Tennis", color: "rgb(var(--c-primary))" },
  { id: "match-prep", label: "Match play", color: "rgb(var(--c-primary) / 0.55)" },
  { id: "strength", label: "Strength", color: "rgb(var(--c-leaf))" },
  { id: "conditioning", label: "Conditioning", color: "rgb(var(--c-gold))" },
  { id: "mobility", label: "Mobility", color: "rgb(var(--c-leaf) / 0.55)" },
  { id: "recovery", label: "Recovery", color: "rgb(var(--c-stone-light))" },
  // Not --c-stone: beside Recovery's --c-stone-light the two greys could not
  // be told apart as month dots.
  { id: "mental", label: "Mental work", color: "rgb(var(--c-sage-tint-text))" },
];

export const SESSION_TYPE_IDS = SESSION_TYPES.map((t) => t.id) as [string, ...string[]];

export function sessionType(id: string): SessionType {
  return SESSION_TYPES.find((t) => t.id === id) ?? SESSION_TYPES[0];
}
