import type { Metadata } from "next";
import { redirect } from "next/navigation";

// Still a private route (it resolves, by redirecting), so it keeps the
// noindex every private page carries.
export const metadata: Metadata = {
  title: "Dashboard — Seeded",
  robots: { index: false, follow: false },
};

// /dashboard was the Legacy design's home. Legacy is deleted (2026-11-20,
// PR-LEGACY); /today is the same page now.
//
// The query string is DELIBERATELY dropped, exactly as production behaved
// before this PR (the old client-side redirect lost it too). Whop's checkout
// returns to /dashboard?checkout=success; keeping the parameter would make
// CheckoutSync call /api/whop/sync and show its banner on every real
// purchase — a new live call on the payment path that an independent review
// flagged as a billing change needing Niran's sign-off (docs/TODO.md
// "Post-checkout sync never runs"). Until he decides, nothing changes for payers.
export default function DashboardPage() {
  redirect("/today");
}
