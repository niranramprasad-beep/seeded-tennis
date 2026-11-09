import type { Metadata } from "next";
import { SeededMethodologyView } from "@/components/seeded/methodology/seeded-methodology-view";

export const metadata: Metadata = {
  title: "Methodology — Seeded",
  description:
    "How Seeded decides which college tennis teams are realistic for you: real rosters, which ratings count, team ranges, players leaving, fit bands, confidence, and what we can't know.",
};

export default function MethodologyPage() {
  return <SeededMethodologyView />;
}
