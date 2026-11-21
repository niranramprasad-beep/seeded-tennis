import type { Metadata } from "next";
import { redirect } from "next/navigation";

// Still a private route (it resolves, by redirecting), so it keeps the
// noindex every private page carries.
export const metadata: Metadata = {
  title: "Coaches — Seeded",
  robots: { index: false, follow: false },
};

// /coaches was the Legacy design's coach outreach page. Legacy is deleted
// (2026-11-20, PR-LEGACY); /outreach is the same page now, and old links and
// bookmarks land there.
export default function CoachesPage() {
  redirect("/outreach");
}
