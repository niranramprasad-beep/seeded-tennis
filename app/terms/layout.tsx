import type { Metadata } from "next";
import type { ReactNode } from "react";

// The page is a client component, so its metadata lives here (QA sweep M7:
// it shared the root title and description and had no canonical).
export const metadata: Metadata = {
  title: "Terms — Seeded",
  description:
    "The terms for using Seeded: what the recruiting and school-comparison tools are for, what they don't guarantee, and how accounts and family access work.",
  alternates: { canonical: "/terms" },
};

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
