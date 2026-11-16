import type { Metadata } from "next";
import { formatTierPrice } from "@/lib/types";
import { getCatalogCounts } from "@/lib/db/schools";
import { PricingView } from "@/components/pricing/pricing-view";
import { Footer } from "@/components/layout/footer";

// CLAUDE.md: "Prices live only in TIER_PRICE_USD (lib/types). Never retype a
// price in a component." This is a server module, so it can interpolate —
// there is no reason for four hand-typed figures here, and one of them
// ($19) is the exact collision CLAUDE.md warns a grep will confuse with the
// legacy Player monthly price.
export const metadata: Metadata = {
  title: "Pricing — Seeded",
  description:
    `Your first fit report is free. Player is ${formatTierPrice("player", "monthly")}/month or ` +
    `${formatTierPrice("player", "yearly")}/year; Family adds a parent view for ` +
    `${formatTierPrice("family", "monthly")}/month or ${formatTierPrice("family", "yearly")}/year. ` +
    `Cancel any time.`,
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  // Counted from the catalogue on the server, so the whole school data set
  // stays out of the client bundle.
  const counts = await getCatalogCounts();

  return (
    <>
      <PricingView counts={counts} />
      <Footer />
    </>
  );
}
