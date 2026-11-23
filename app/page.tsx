import type { Metadata } from "next";
import { getCatalogCounts, getSchoolsLite } from "@/lib/db/schools";
import { SeededHomeView } from "@/components/seeded/home/seeded-home-view";
import { AuthedHomeRedirect } from "@/components/home/authed-home-redirect";

// A-035 (2026-11-21): the description says what the comparison is against —
// our ESTIMATED team ranges — and how many teams, counted from the catalogue
// (getCatalogCounts), never typed.
export async function generateMetadata(): Promise<Metadata> {
  const { total } = await getCatalogCounts();
  return {
    title: "Seeded — your path to college tennis, mapped",
    description: `Enter your UTR and grad year. Seeded compares your UTR with the range for ${total} college teams (a hand-checked roster where we have one, our estimate elsewhere), sorts them into Reach, Target, Likely and Out of range, and turns the gap into season targets you plan against, with a family view your parents can follow.`,
    alternates: { canonical: "/" },
  };
}

export default async function HomePage() {
  const schools = await getSchoolsLite();

  return (
    <>
      <AuthedHomeRedirect />
      <SeededHomeView schools={schools} />
    </>
  );
}
