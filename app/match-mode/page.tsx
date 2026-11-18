import type { Metadata } from "next";
import { redirect } from "next/navigation";

// Still a private route (it resolves, by redirecting), so it keeps the
// noindex every private page carries.
export const metadata: Metadata = {
  title: "Match mode — Seeded",
  robots: { index: false, follow: false },
};

// Match mode is gone (docs/DECISIONS.md, 2026-11-18). Its one feature was a
// "prep plan" Seeded wrote for the player — warm-up, tactics, a packing
// list — from a template, which is the auto-generated plan CLAUDE.md rules
// out. Logging a result is what /matches does. Old links and bookmarks land
// there.
export default function MatchModePage() {
  redirect("/matches");
}
