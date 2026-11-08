import Link from "next/link";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Award,
  Building2,
  CalendarDays,
  GraduationCap,
  MapPin,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { combinedScore, getSchool, getSchools } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { SchoolBadge } from "@/components/shared/school-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Footer } from "@/components/layout/footer";
import { SeededSchoolDetail } from "@/components/seeded/schools/seeded-school-detail";
import { SchoolDetailSwitch } from "@/components/seeded/schools/school-detail-switch";

// recharts loads as its own chunk instead of being bundled into every
// school page. `ssr: false` isn't allowed here (this file is a Server
// Component) — omitting it still code-splits the chart into a separate
// chunk, which is the actual bundle-size win.
const RosterDistributionChart = dynamic(
  () => import("@/components/charts/roster-distribution-chart").then((mod) => mod.RosterDistributionChart),
  { loading: () => <Skeleton className="h-56 w-full" /> }
);

export async function generateStaticParams() {
  const schools = await getSchools();
  return schools.map((s) => ({ slug: s.slug }));
}

export default async function SchoolDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const [school, allSchools] = await Promise.all([
    getSchool(params.slug),
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
    .sort((a, b) => combinedScore(b) - combinedScore(a));
  const nationalRank = peers.findIndex((s) => s.slug === school.slug) + 1;

  const stats = [
    { label: "Avg roster UTR", value: school.avgRosterUTR.toFixed(1) },
    { label: "Min competitive", value: school.minCompetitiveUTR.toFixed(1) },
    { label: "Conference rank", value: `#${school.conferenceRank}` },
    { label: "US News", value: `#${school.usNewsRanking}` },
    { label: "Seeded score", value: String(combinedScore(school)) },
  ];

  return (
    <SchoolDetailSwitch
      seeded={
        <SeededSchoolDetail
          school={school}
          nationalRank={nationalRank}
          stats={stats}
          programType={programType}
          inState={inState}
        />
      }
      legacy={
        <>
          {/* hero */}
          <section
        className="relative overflow-hidden"
        style={{ backgroundColor: school.primaryColor, color: school.textColor }}
      >
        <div className="relative mx-auto max-w-content container-px py-12">
          <Link
            href="/schools"
            className="inline-flex items-center gap-1.5 text-sm opacity-80 transition-opacity hover:opacity-100"
          >
            <ArrowLeft className="h-4 w-4" />
            All schools
          </Link>

          <div className="mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold"
              style={{
                backgroundColor: school.textColor,
                color: school.primaryColor,
                boxShadow: `inset 0 0 0 4px ${school.secondaryColor}`,
              }}
            >
              {school.shortName
                .replace(/[^A-Za-z\s]/g, "")
                .split(/\s+/)
                .map((w) => w[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-light tracking-tight sm:text-4xl">
                {school.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm opacity-90">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {school.city}, {school.state}
                </span>
                <span>{school.conference}</span>
                <span>
                  {programType} · {school.division}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <span
                className="rounded-pill px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: `${school.textColor}22` }}
              >
                #{nationalRank} in {programType} {school.division}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-content container-px py-10">
        {/* stat tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <Card key={s.label} className="p-4">
              <p className="text-xs text-stone-light">{s.label}</p>
              <p className="mt-1 text-2xl font-light text-ink">{s.value}</p>
            </Card>
          ))}
        </div>

        {/* roster + coach */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="min-w-0 lg:col-span-2 p-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">Roster</h2>
            </div>
            <div className="mt-3">
              <RosterDistributionChart
                avgUTR={school.avgRosterUTR}
                minUTR={school.minCompetitiveUTR}
                height={160}
              />
            </div>
            <MissingData className="mt-4" title="Verified roster data coming soon." />
          </Card>

          {/* coach */}
          <Card className="flex flex-col p-6">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">Head coach</h2>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-card border-[0.5px] border-line bg-cream/50 p-3">
              <SchoolBadge school={school} size={42} />
              <p className="text-xs text-stone-light">{programType} Tennis</p>
            </div>
            <MissingData className="mt-4 flex-1" title="Verified coach contact coming soon." />
          </Card>
        </div>

        {/* results + standings */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">Recent results</h2>
            </div>
            <MissingData className="mt-4" title="Verified match results coming soon." />
          </Card>

          <Card className="min-w-0 p-6">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">
                {school.conference} standings
              </h2>
            </div>
            <MissingData className="mt-4" title="Verified conference standings coming soon." />
          </Card>
        </div>

        {/* recruiting + campus */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 p-6">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">
                Recruiting class history
              </h2>
            </div>
            <MissingData className="mt-4" title="Verified recruiting class data coming soon." />
          </Card>

          {/* campus & cost */}
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">Campus & cost</h2>
            </div>
            <MissingData className="mt-4" title="Verified campus and cost data coming soon." />
          </Card>
        </div>
      </div>
          <Footer />
        </>
      }
    />
  );
}

// Local, Legacy-styled placeholder for a data section we don't have a real
// source for yet (see Phase 4's SchoolProfile rebuild) — reuses Legacy's own
// existing tokens rather than a Seeded-specific primitive.
function MissingData({ title, className }: { title: string; className?: string }) {
  return (
    <div className={`rounded-card border border-dashed border-line p-4 text-sm text-stone ${className ?? ""}`}>
      <strong className="text-ink">{title}</strong>{" "}
      <span className="text-stone-light">We&apos;ll add this once we have a verified source.</span>
    </div>
  );
}
