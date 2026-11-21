import { describe, expect, it } from "vitest";
import { metadata as howItWorks } from "@/app/how-it-works/layout";
import { metadata as parents } from "@/app/parents/layout";
import { metadata as contact } from "@/app/contact/layout";
import { metadata as terms } from "@/app/terms/layout";
import { metadata as notFound } from "@/app/not-found";

// QA sweep 2026-11-20, M7: four public pages are client components with no
// metadata, so they shared the home page's <title> and description and had
// no canonical; the 404 had the home title too.

const ROOT_TITLE = "Seeded — your path to college tennis, mapped";

describe("public client pages carry their own metadata", () => {
  const pages = { "/how-it-works": howItWorks, "/parents": parents, "/contact": contact, "/terms": terms };

  it("each has a unique title, a description and a self canonical", () => {
    const titles = new Set<string>();
    for (const [path, m] of Object.entries(pages)) {
      expect(typeof m.title, path).toBe("string");
      expect(m.title, path).not.toBe(ROOT_TITLE);
      expect(m.title as string, path).toMatch(/ — Seeded$/);
      titles.add(m.title as string);
      expect((m.description ?? "").length, path).toBeGreaterThan(40);
      expect(m.alternates?.canonical, path).toBe(path);
    }
    expect(titles.size).toBe(Object.keys(pages).length);
  });

  it("the 404 has its own title", () => {
    expect(notFound.title).toBe("Page not found — Seeded");
  });
});
