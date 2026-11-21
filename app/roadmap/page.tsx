import type { Metadata } from "next";
import { redirect } from "next/navigation";

// Still a private route (it resolves, by redirecting), so it keeps the
// noindex every private page carries.
export const metadata: Metadata = {
  title: "Roadmap — Seeded",
  robots: { index: false, follow: false },
};

// /roadmap was the Legacy design's year-by-year roadmap. Legacy is deleted
// (2026-11-20, PR-LEGACY); /plan is the same page now, and old links and
// bookmarks land there.
export default function RoadmapPage() {
  redirect("/plan");
}
