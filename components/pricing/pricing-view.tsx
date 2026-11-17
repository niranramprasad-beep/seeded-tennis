"use client";

import type { CatalogCounts } from "@/lib/db/schools";
import { useDesign } from "@/lib/context/design-context";
import { SeededPricingView } from "./seeded-pricing-view";
import { LegacyPricingView } from "./legacy-pricing-view";

// /pricing picks its design here. The Seeded view is Board 19
// (docs/DESIGN_MOCKUP_SPEC_V2.md); Legacy keeps the page it had. Both share
// the checkout wiring in use-plan-checkout.ts. The Seeded design is the
// server default, so the server HTML is the Board 19 page.
export function PricingView({ counts }: { counts: CatalogCounts }) {
  const { design } = useDesign();
  return design === "seeded" ? (
    <SeededPricingView counts={counts} />
  ) : (
    <LegacyPricingView counts={counts} />
  );
}
