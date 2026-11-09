import type { Metadata } from "next";
import { Suspense } from "react";
import { TournamentFitView } from "@/components/tournaments/tournament-fit-view";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: "Tournament Fit Finder — Seeded",
  description:
    "Decide if a tournament is worth entering. Seeded weighs the draw strength against your UTR, the cost per match, and the travel — then gives a clear verdict.",
};

export default function TournamentFitPage() {
  return (
    <>
      {/* Seeded's rebuild reads a shared-link's query params via
          useSearchParams (lib/tournament-fit-share.ts) — same Suspense
          requirement /events' page.tsx already has for its own tab
          deep-linking. Legacy's branch doesn't use search params at all. */}
      <Suspense fallback={null}>
        <TournamentFitView />
      </Suspense>
      <Footer />
    </>
  );
}
