import type { Metadata } from "next";
import type { ReactNode } from "react";

// The page is a client component, so its metadata lives here (QA sweep M7:
// it shared the root title and description and had no canonical).
export const metadata: Metadata = {
  title: "How it works — Seeded",
  description:
    "How Seeded works: build the player profile, see whether each college tennis program is a Safe bet, Good match, Stretch or Long shot for your UTR, set your plan UTR, and keep coach outreach in one place.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksLayout({ children }: { children: ReactNode }) {
  return children;
}
