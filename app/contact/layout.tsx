import type { Metadata } from "next";
import type { ReactNode } from "react";

// The page is a client component, so its metadata lives here (QA sweep M7:
// it shared the root title and description and had no canonical).
export const metadata: Metadata = {
  title: "Contact — Seeded",
  description: "Questions, feedback or support: how to reach the people behind Seeded.",
  alternates: { canonical: "/contact" },
};

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
