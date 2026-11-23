import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  combinedScore,
  getSchool,
  getSchools,
  utrSourceShortLabel,
} from "@/lib/db/schools";
import { SeededSchoolDetail } from "@/components/seeded/schools/seeded-school-detail";

// Every school page shared the site-wide default title and had no
// canonical, so 37 programs competed as one page in search. Named from the
// school's own real fields — nothing invented. UTR numbers stay out of the
// description deliberately: they are unsourced estimates (P0-3), and a
// search snippet is the last place to present one as fact.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const school = await getSchool(slug);
  if (!school) return { title: "School not found — Seeded" };
  const programType = school.gender === "women" ? "Women's" : "Men's";
  return {
    title: `${school.name} ${programType.toLowerCase()} tennis — Seeded`,
    description: `${school.name} ${programType.toLowerCase()} tennis: ${[school.division, school.conference, school.city, school.state].filter(Boolean).join(", ")}. See how your UTR compares to the team's range and whether the program is a Likely, Target or Reach fit.`,
    alternates: { canonical: `/schools/${school.slug}` },
  };
}

// Every real school is prerendered by generateStaticParams below, so any
// other slug is not a school. Without this, /schools/<anything> streamed a
// 200 (loading.tsx commits the status before notFound() runs) with a "School
// not found" page — a soft 404 a crawler can index. Now a real 404.
export const dynamicParams = false;

export async function generateStaticParams() {
  const schools = await getSchools();
  return schools.map((s) => ({ slug: s.slug }));
}

// Next 15: `params` is a Promise. Dynamic APIs (params, searchParams,
// cookies, headers) became async so a page can start streaming before the
// router has finished resolving them. Awaited once here rather than threaded
// through — nothing below needs it lazily.
export default async function SchoolDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [school, allSchools] = await Promise.all([
    getSchool(slug),
    getSchools(),
  ]);
  if (!school) notFound();

  const inState = school.state === "MD";
  const programType = school.gender === "women" ? "Women's" : "Men's";

  // Real ranking: school's own combinedScore (US News + avg roster UTR,
  // both real fields) against its real same-gender, same-division peers.
  // Not fabricated — same formula the "Seeded score" stat tile uses.
  const peers = allSchools
    .filter((s) => s.gender === school.gender && s.division === school.division)
    // A school with no US News rank has no combined score; it sorts last.
    .sort((a, b) => (combinedScore(b) ?? -1) - (combinedScore(a) ?? -1));
  const nationalRank = peers.findIndex((s) => s.slug === school.slug) + 1;

  // No "Conference rank" tile: that field was an invented number and was
  // removed from the catalog (P0-3). The two UTR tiles say where their
  // numbers come from on the tile itself: a checked roster and its date, or
  // "unverified estimate".
  const score = combinedScore(school);
  const stats = [
    {
      label: school.utrRange ? `Team middle UTR (${utrSourceShortLabel(school)})` : `Avg roster UTR (${utrSourceShortLabel(school)})`,
      value: school.avgRosterUTR.toFixed(1),
    },
    {
      label: school.utrRange ? `Team floor UTR (${utrSourceShortLabel(school)})` : `Min competitive (${utrSourceShortLabel(school)})`,
      value: school.minCompetitiveUTR.toFixed(1),
    },
    { label: "US News", value: school.usNewsRanking === null ? "Not tracked" : `#${school.usNewsRanking}` },
    { label: "Seeded score", value: score === null ? "Not tracked" : String(score) },
  ];

  return (
    <SeededSchoolDetail
      school={school}
      nationalRank={nationalRank}
      stats={stats}
      programType={programType}
      inState={inState}
      allSchools={allSchools}
    />
  );
}
