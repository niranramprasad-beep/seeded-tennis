"use client";

import type { CatalogCounts } from "@/lib/db/schools";
import { SeededPricingView } from "./seeded-pricing-view";

// /pricing is Board 19 (docs/DESIGN_MOCKUP_SPEC_V2.md). The checkout wiring
// lives in use-plan-checkout.ts.
export function PricingView({ counts }: { counts: CatalogCounts }) {
  return <SeededPricingView counts={counts} />;
}
