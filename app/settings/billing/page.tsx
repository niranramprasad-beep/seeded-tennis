import type { Metadata } from "next";
import { SeededBillingView } from "@/components/seeded/settings/seeded-billing-view";

// Private: behind an AuthGate and disallowed in robots.txt.
export const metadata: Metadata = {
  title: "Billing — Seeded",
  robots: { index: false, follow: false },
};

export default function SettingsBillingPage() {
  return <SeededBillingView />;
}
