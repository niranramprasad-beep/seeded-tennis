import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeededHomeView } from "@/components/seeded/home/seeded-home-view";
import { codeOnly } from "./testing/source-text";
import type { SchoolLite } from "./types";

// Bug hunt 2026-11-26, BUG-012: the home page had two <h1>, a phone hero and
// a desktop hero, both always in the HTML with CSS hiding one. One page, one
// <h1> (the accessibility baseline), and it has to be the one a visitor sees
// at every width — so it may not sit inside either hidden half.

const school = (slug: string): SchoolLite => ({
  id: slug,
  slug,
  name: slug,
  shortName: slug,
  city: "",
  state: "CA",
  conference: "",
  division: "D1",
  gender: "women",
  primaryColor: "",
  secondaryColor: "",
  textColor: "",
  avgRosterUTR: 10,
  minCompetitiveUTR: 9,
  usNewsRanking: 1,
});

const html = renderToStaticMarkup(createElement(SeededHomeView, { schools: [school("a"), school("b")] }));

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** The class tokens of every element enclosing the character at `index`. */
function ancestorClasses(source: string, index: number): string[][] {
  const stack: { tag: string; classes: string[] }[] = [];
  for (const m of source.slice(0, index).matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClosing] = m;
    if (closing) {
      const at = stack.map((s) => s.tag).lastIndexOf(tag.toLowerCase());
      if (at >= 0) stack.length = at;
    } else if (!selfClosing && !VOID.has(tag.toLowerCase())) {
      stack.push({ tag: tag.toLowerCase(), classes: (/\bclass="([^"]*)"/.exec(attrs)?.[1] ?? "").split(/\s+/).filter(Boolean) });
    }
  }
  return stack.map((s) => s.classes);
}

describe("the home page has exactly one <h1>", () => {
  it("in the rendered page", () => {
    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
  });

  it("in the source of the home view", () => {
    const src = codeOnly("components/seeded/home/seeded-home-view.tsx");
    expect(src.match(/<h1\b/g) ?? []).toHaveLength(1);
  });

  it("which says what the hero always said", () => {
    expect(html).toMatch(/<h1\b[^>]*>Know which teams you can make, and what to do this month\.<\/h1>/);
  });

  it("and is not inside a half of the page that is hidden at some width", () => {
    const at = html.indexOf("<h1");
    expect(at).toBeGreaterThan(0);
    const hiding = ancestorClasses(html, at)
      .flat()
      .filter((c) => c === "hidden" || c === "lg:hidden" || c === "invisible" || c === "sr-only");
    expect(hiding).toEqual([]);
  });

  it("the phone and the desktop hero still each have their own subhead and the calculator", () => {
    // Pinned by lib/honest-zero-state.test.ts as two separate sentences.
    expect((html.match(/a hand-checked roster where we have one, our estimate where we don(?:'|&#x27;)t/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Free · no card · Takes about 90 seconds.");
  });
});
