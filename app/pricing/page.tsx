import type { Metadata } from "next";
import { PricingView } from "@/components/pricing/pricing-view";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: "Pricing — Seeded",
  description:
    "Your first fit report is free. Player is $12/month or $99/year; Family adds a parent view for $19/month or $159/year. Cancel any time.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <>
      <PricingView />
      <Footer />
    </>
  );
}
