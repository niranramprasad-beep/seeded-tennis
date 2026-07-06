import type { Metadata } from "next";
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
      <TournamentFitView />
      <Footer />
    </>
  );
}
