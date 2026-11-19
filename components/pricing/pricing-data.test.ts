import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FAMILY_PLAN_MAX_PARENTS,
  FAMILY_PLAN_MAX_PLAYERS,
  FEATURE_TIER,
  FREE_TIER_TARGET_SCHOOL_LIMIT,
  TIER_PRICE_USD,
  type SubscriptionTier,
} from "@/lib/types";
import type { CatalogCounts } from "@/lib/db/schools";
import {
  ALWAYS_FREE_FEATURES,
  COMPARE_FEATURES,
  TIERS,
  compareGroups,
  planCards,
  priceBlockFor,
  tierIncludes,
  yearlyToggleLabel,
  type GatedFeature,
} from "./pricing-data";

// /pricing's claims, checked against the constants they must come from.
// Board 19: the comparison table is generated from FEATURE_TIER. These tests
// make that load-bearing: a new FEATURE_TIER key the table does not render,
// a row whose ticks disagree with the tier gating, or a table component that
// stops reading compareGroups() all fail the build.

const counts: CatalogCounts = {
  total: 68,
  men: 37,
  women: 31,
  d1: 1,
  d2: 1,
  d3: 1,
  divisionLabel: "D1, D2 and D3",
};

describe("comparison table is generated from FEATURE_TIER", () => {
  const groups = compareGroups();
  const rows = groups.flatMap((g) => g.rows);

  it("renders every FEATURE_TIER key — the table cannot drift from the gating", () => {
    const rendered = new Set(rows.map((r) => r.source).filter(Boolean));
    for (const key of Object.keys(FEATURE_TIER)) {
      expect(rendered.has(key as GatedFeature), `FEATURE_TIER.${key} has no row on /pricing`).toBe(true);
    }
  });

  it("has a display entry for exactly FEATURE_TIER's keys, no more", () => {
    expect(Object.keys(COMPARE_FEATURES).sort()).toEqual(Object.keys(FEATURE_TIER).sort());
    for (const key of Object.keys(COMPARE_FEATURES) as GatedFeature[]) {
      expect(COMPARE_FEATURES[key].rows.length, key).toBeGreaterThan(0);
    }
  });

  it("ticks each gated row exactly for the tiers FEATURE_TIER lets in", () => {
    for (const row of rows) {
      if (row.source === null || row.source === "target-limit" || row.source === "family-size") continue;
      const required = FEATURE_TIER[row.source];
      for (const t of TIERS) {
        expect(row.cells[t], `${row.label} / ${t}`).toEqual({
          kind: "check",
          included: tierIncludes(t, required),
        });
      }
    }
  });

  it("ticks ungated rows for every tier", () => {
    const ungated = rows.filter((r) => r.source === null);
    expect(ungated.map((r) => r.label).sort()).toEqual(ALWAYS_FREE_FEATURES.map((f) => f.label).sort());
    for (const row of ungated) {
      for (const t of TIERS) expect(row.cells[t]).toEqual({ kind: "check", included: true });
    }
  });

  it("quotes the real free-tier target limit: 3 / Unlimited / Unlimited", () => {
    const target = rows.find((r) => r.source === "target-limit");
    expect(target).toBeDefined();
    expect(target!.cells).toEqual({
      free: { kind: "text", value: String(FREE_TIER_TARGET_SCHOOL_LIMIT) },
      player: { kind: "text", value: "Unlimited" },
      family: { kind: "text", value: "Unlimited" },
    });
  });

  it("states the Family plan's size from the same caps the database enforces (045)", () => {
    const size = rows.find((r) => r.source === "family-size");
    expect(size).toBeDefined();
    expect(size!.cells).toEqual({
      free: { kind: "check", included: false },
      player: { kind: "check", included: false },
      family: {
        kind: "text",
        value: `1 family: ${FAMILY_PLAN_MAX_PLAYERS} players, ${FAMILY_PLAN_MAX_PARENTS} parents`,
      },
    });
    const familyCard = planCards(counts).find((c) => c.tier === "family")!;
    expect(familyCard.tagline).toBe("For one family: up to 4 players and 2 parents.");
  });

  it("groups rows as SCHOOLS · PLANNING · FAMILY, none empty", () => {
    expect(groups.map((g) => g.group)).toEqual(["Schools", "Planning", "Family"]);
    for (const g of groups) expect(g.rows.length, g.group).toBeGreaterThan(0);
  });

  it("the table component renders from compareGroups() and hand-writes no tier", () => {
    const src = readFileSync(join(__dirname, "compare-table.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).toMatch(/compareGroups\(\)/);
    // No per-tier booleans or feature labels typed into the component.
    expect(src).not.toMatch(/\b(?:free|player|family)\s*:\s*(?:true|false)\b/);
    for (const key of Object.keys(COMPARE_FEATURES) as GatedFeature[]) {
      for (const label of COMPARE_FEATURES[key].rows) expect(src).not.toContain(label);
    }
  });
});

describe("prices are derived from TIER_PRICE_USD", () => {
  it("matches Board 19's yearly copy at today's prices", () => {
    expect(priceBlockFor("player", "yearly")).toEqual({
      amount: "$99",
      cadence: "per year",
      note: "About $8.25 a month. Saves $45 a year.",
    });
    expect(priceBlockFor("family", "yearly")).toEqual({
      amount: "$159",
      cadence: "per year",
      note: "About $13.25 a month. Saves $69 a year.",
    });
  });

  it("matches Board 19's monthly copy at today's prices", () => {
    expect(priceBlockFor("player", "monthly")).toEqual({ amount: "$12", cadence: "per month", note: "Or $99 a year." });
    expect(priceBlockFor("family", "monthly")).toEqual({ amount: "$19", cadence: "per month", note: "Or $159 a year." });
    expect(priceBlockFor("free", "monthly")).toEqual({ amount: "$0", cadence: "forever", note: "No card needed." });
  });

  it("every figure tracks the table (no price is typed in)", () => {
    for (const t of ["player", "family"] as SubscriptionTier[]) {
      const { monthly, yearly } = TIER_PRICE_USD[t];
      expect(priceBlockFor(t, "yearly").amount).toBe(`$${yearly}`);
      expect(priceBlockFor(t, "monthly").amount).toBe(`$${monthly}`);
      expect(priceBlockFor(t, "yearly").note).toContain(`Saves $${monthly * 12 - yearly} a year.`);
    }
  });

  it("the toggle says 'save about 30%', never 'months free', and never overstates", () => {
    const label = yearlyToggleLabel();
    expect(label).toBe("Yearly · save about 30%");
    expect(label).not.toMatch(/months? free/i);
    const pct = Number(label.match(/(\d+)%/)![1]);
    for (const t of ["player", "family"] as SubscriptionTier[]) {
      const { monthly, yearly } = TIER_PRICE_USD[t];
      expect((monthly * 12 - yearly) / (monthly * 12)).toBeGreaterThanOrEqual(pct / 100 - 0.005);
    }
  });

  it("no pricing component types a dollar amount", () => {
    for (const f of ["seeded-pricing-view.tsx", "compare-table.tsx", "pricing-data.ts"]) {
      const src = readFileSync(join(__dirname, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/\$\d/);
    }
  });
});

describe("plan cards", () => {
  const cards = planCards(counts);

  it("quote the catalogue count and the free limit, not literals", () => {
    expect(cards[0].features).toContain("Browse 68 D1, D2 and D3 programs");
    expect(cards[0].features).toContain(`Track ${FREE_TIER_TARGET_SCHOOL_LIMIT} target schools`);
    expect(planCards({ ...counts, total: 12, divisionLabel: "D1" })[0].features[0]).toBe("Browse 12 D1 programs");
  });

  it("recommend Player and only Player", () => {
    expect(cards.filter((c) => c.recommended).map((c) => c.tier)).toEqual(["player"]);
  });

  it("never describe the family report as something that arrives", () => {
    const all = cards.flatMap((c) => c.features).join(" ");
    expect(all).not.toMatch(/email|inbox|sent|deliver/i);
  });
});

describe("plan cards advertise only what their tier unlocks", () => {
  const cards = planCards({ total: 68, divisionLabel: "D1, D2 and D3" } as Parameters<typeof planCards>[0]);
  // Lines that need no gate: free for everyone, the target-school limit, or
  // "Everything in …". Anything else on a card must name its FEATURE_TIER key.
  const UNGATED = [/^Browse \d+ .+ programs$/, /^Your fit report$/, /target schools$/, /^Every school page$/, /^Everything in (Free|Player)$/];

  it("every line has a gate entry", () => {
    for (const c of cards) expect(c.gates.length, c.tier).toBe(c.features.length);
  });

  it("a gated line sits on exactly the card of its tier", () => {
    for (const c of cards) {
      c.features.forEach((f, i) => {
        const g = c.gates[i];
        if (g) expect(FEATURE_TIER[g], `${c.tier}: "${f}"`).toBe(c.tier);
        else expect(UNGATED.some((r) => r.test(f)), `${c.tier}: "${f}" has no gate and is not a free/limit line`).toBe(true);
      });
    }
  });

  it("every FEATURE_TIER key is advertised on its own tier's card", () => {
    for (const key of Object.keys(FEATURE_TIER) as (keyof typeof FEATURE_TIER)[]) {
      const card = cards.find((c) => c.tier === FEATURE_TIER[key])!;
      expect(card.gates, key).toContain(key);
    }
  });

  it("the compare table renders no hand-typed cell text", () => {
    // Every cell's text comes from compareGroups() through a {…} slot; a
    // literal like <td>Weekly emailed family report</td> got past the first
    // version of these tests.
    const src = readFileSync(join(__dirname, "compare-table.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const cells = [...src.matchAll(/<(t[hd])\b(?:[^>{]|\{[^}]*\})*>([\s\S]*?)<\/\1>/g)];
    expect(cells.length).toBeGreaterThan(0);
    for (const [, , inner] of cells) {
      const literal = inner.replace(/\{[\s\S]*?\}/g, "").replace(/<[^>]+>/g, "").trim();
      // The one literal allowed: the first column's own heading.
      if (literal === "Feature") continue;
      expect(literal, `hand-typed cell text: "${literal}"`).toBe("");
    }
  });
});
