import type { Metadata } from "next";
import { redirect } from "next/navigation";

// Still a private route (it resolves, by redirecting), so it keeps the
// noindex every private page carries.
export const metadata: Metadata = {
  title: "Cost calculator — Seeded",
  robots: { index: false, follow: false },
};

// /cost-calculator was the Legacy design's standalone calculator. Legacy is
// deleted (2026-11-20, PR-LEGACY); the same calculator is embedded in the
// family season budget on /family, and old links and bookmarks land there.
export default function CostCalculatorPage() {
  redirect("/family");
}
