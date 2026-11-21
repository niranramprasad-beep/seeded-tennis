import type { Metadata } from "next";
import type { ReactNode } from "react";

// The page is a client component, so its metadata lives here (QA sweep M7:
// it shared the root title and description and had no canonical).
export const metadata: Metadata = {
  title: "For parents — Seeded",
  description:
    "Seeded for tennis parents: see which college programs fit your player's UTR and timeline, the tournaments they've entered and what each costs, their progress, and their coach outreach.",
  alternates: { canonical: "/parents" },
};

export default function ParentsLayout({ children }: { children: ReactNode }) {
  return children;
}
