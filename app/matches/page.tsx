import type { Metadata } from "next";
import { MatchHistoryView } from "@/components/matches/match-history-view";

// Behind an AuthGate and disallowed in robots.txt. The meta tag is the
// belt-and-braces half: robots.txt is a request, a meta robots tag is an
// instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Results — Seeded",
  robots: { index: false, follow: false },
};

export default function MatchesPage() {
  return <MatchHistoryView />;
}
