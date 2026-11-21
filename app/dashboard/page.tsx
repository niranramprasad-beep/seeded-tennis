import type { Metadata } from "next";
import { redirect } from "next/navigation";

// Still a private route (it resolves, by redirecting), so it keeps the
// noindex every private page carries.
export const metadata: Metadata = {
  title: "Dashboard — Seeded",
  robots: { index: false, follow: false },
};

// /dashboard was the Legacy design's home. Legacy is deleted (2026-11-20,
// PR-LEGACY); /today is the same page now. The query string is kept: the
// Whop checkout still returns to /dashboard?checkout=success
// (app/api/whop/checkout/route.ts), and CheckoutSync — mounted on every
// route — needs that parameter when the player lands on /today.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
    for (const v of values) qs.append(key, v);
  }
  const query = qs.toString();
  redirect(query ? `/today?${query}` : "/today");
}
