import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Award,
  Building2,
  CalendarDays,
  DollarSign,
  GraduationCap,
  Mail,
  MapPin,
  Trophy,
  User,
  Users,
} from "lucide-react";
import {
  combinedScore,
  getSchool,
  getSchools,
  getSchoolProfile,
} from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SchoolBadge } from "@/components/shared/school-badge";
import { RosterDistributionChart } from "@/components/charts/roster-distribution-chart";
import { CoachEmailCTA } from "@/components/schools/coach-email-cta";
import { Footer } from "@/components/layout/footer";

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

  const profile = getSchoolProfile(school, allSchools);
  const inState = school.state === "MD";
  const programType = school.gender === "women" ? "Women's" : "Men's";

  const stats = [
    { label: "Avg roster UTR", value: school.avgRosterUTR.toFixed(1) },
    { label: "Min competitive", value: school.minCompetitiveUTR.toFixed(1) },
    { label: "Conference rank", value: `#${school.conferenceRank}` },
    { label: "US News", value: `#${school.usNewsRanking}` },
    { label: "Seeded score", value: String(combinedScore(school)) },
  ];

  return (
    <>
      {/* hero */}
      <section
        className="relative overflow-hidden"
        style={{ backgroundColor: school.primaryColor, color: school.textColor }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(circle at 85% 20%, ${school.secondaryColor}, transparent 55%)`,
          }}
        />
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
                #{profile.nationalRank} in {programType} {school.division}
              </span>
              <span
                className="rounded-pill px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: `${school.textColor}22` }}
              >
                {profile.record} season
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

        <p className="mt-3 text-xs leading-relaxed text-stone-light">
          UTR benchmarks are Seeded estimates for planning. Roster names,
          results, standings, and recruiting classes below are illustrative
          sample data — always verify details with the program before making
          recruiting decisions.
        </p>

        {/* roster + coach */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 p-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">
                Current roster — {profile.roster.length} players
              </h2>
            </div>
            <div className="mt-3">
              <RosterDistributionChart
                avgUTR={school.avgRosterUTR}
                minUTR={school.minCompetitiveUTR}
                height={160}
              />
            </div>
            <div className="mt-4 overflow-hidden rounded-card border-[0.5px] border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-[0.5px] border-line bg-cream/50 text-left text-xs text-stone-light">
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-4 py-2.5 font-medium">Player</th>
                    <th className="px-4 py-2.5 font-medium">Class</th>
                    <th className="px-4 py-2.5 font-medium">Hometown</th>
                    <th className="px-4 py-2.5 text-right font-medium">UTR</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.roster.map((p, i) => (
                    <tr key={p.name + i} className={i % 2 ? "bg-cream/30" : undefined}>
                      <td className="px-4 py-2.5 text-stone-light">{p.position}</td>
                      <td className="px-4 py-2.5 font-medium text-ink">{p.name}</td>
                      <td className="px-4 py-2.5 text-stone">'{String(p.classYear).slice(2)}</td>
                      <td className="px-4 py-2.5 text-stone">{p.hometown}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-grass">
                        {p.utr.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* coach */}
          <Card className="flex flex-col p-6">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">Head coach</h2>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-card border-[0.5px] border-line bg-cream/50 p-3">
              <SchoolBadge school={school} size={42} />
              <div>
                <p className="font-medium text-ink">{school.coachName}</p>
                <p className="text-xs text-stone-light">{programType} Tennis</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-stone">
              {profile.coachBio}
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm text-stone">
              <Mail className="h-4 w-4 text-stone-light" />
              {school.coachEmail}
            </p>
            <div className="mt-auto pt-5">
              <CoachEmailCTA slug={school.slug} />
            </div>
          </Card>
        </div>

        {/* results + standings */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">Recent results</h2>
            </div>
            <div className="mt-4 space-y-2">
              {profile.recentMatches.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border-[0.5px] border-line bg-card px-3.5 py-2.5"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      m.result === "W"
                        ? "bg-grass text-cream"
                        : "bg-[#F0E7E2] text-[#9C3B22]"
                    }`}
                  >
                    {m.result}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      vs {m.opponent}
                    </p>
                    <p className="text-xs text-stone-light">
                      {m.date}
                      {m.conference ? " · Conference" : ""}
                    </p>
                  </div>
                  <span className="font-mono text-sm text-stone">{m.score}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">
                {school.conference} standings
              </h2>
            </div>
            <div className="mt-4 overflow-hidden rounded-card border-[0.5px] border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-[0.5px] border-line bg-cream/50 text-left text-xs text-stone-light">
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-4 py-2.5 font-medium">Team</th>
                    <th className="px-4 py-2.5 font-medium">Conf.</th>
                    <th className="px-4 py-2.5 text-right font-medium">Avg UTR</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.standings.map((row, i) => (
                    <tr
                      key={row.team}
                      className={
                        row.isThis ? "bg-grass-50 font-medium" : i % 2 ? "bg-cream/30" : undefined
                      }
                    >
                      <td className="px-4 py-2.5 text-stone-light">{i + 1}</td>
                      <td className="px-4 py-2.5 text-ink">{row.team}</td>
                      <td className="px-4 py-2.5 text-stone">{row.confRecord}</td>
                      <td className="px-4 py-2.5 text-right text-grass">
                        {row.avgUTR.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            <div className="mt-4 space-y-4">
              {profile.recruitingClasses.map((cls) => (
                <div key={cls.classYear}>
                  <p className="mb-2 text-sm font-medium text-ink">
                    Class of {cls.classYear}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {cls.recruits.map((r, i) => (
                      <span
                        key={r.name + i}
                        className="flex items-center gap-2 rounded-pill border-[0.5px] border-line bg-card px-3 py-1.5 text-xs"
                      >
                        <span className="font-medium text-ink">{r.name}</span>
                        <span className="text-stone-light">{r.hometown}</span>
                        <span className="font-medium text-grass">
                          {r.utr.toFixed(1)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* campus & cost */}
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">Campus & cost</h2>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Type" value={profile.campus.isPublic ? "Public" : "Private"} />
              <Row label="Setting" value={profile.campus.setting} />
              <Row
                label="Enrollment"
                value={profile.campus.enrollment.toLocaleString()}
              />
              <Row
                label={profile.campus.isPublic ? "In-state cost" : "Tuition + fees"}
                value={`$${profile.campus.costInState}k/yr`}
                icon={DollarSign}
              />
              {profile.campus.isPublic && (
                <Row
                  label="Out-of-state cost"
                  value={`$${profile.campus.costOutState}k/yr`}
                  icon={DollarSign}
                />
              )}
              <Row
                label="For you"
                value={inState ? "In-state" : "Out-of-state"}
              />
            </dl>
            <div className="mt-4 rounded-card border-[0.5px] border-line bg-cream/50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <Award className="h-3.5 w-3.5 text-grass" />
                Scholarships
              </p>
              <p className="mt-1 text-xs leading-relaxed text-stone">
                {profile.scholarships.detail}
              </p>
            </div>
            <div className="mt-3 rounded-card border-[0.5px] border-line bg-cream/50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <CalendarDays className="h-3.5 w-3.5 text-grass" />
                Application deadlines
              </p>
              <p className="mt-1 text-xs text-stone">
                {profile.deadlines.earlyAction}
              </p>
              <p className="text-xs text-stone">
                {profile.deadlines.regularDecision}
              </p>
            </div>
          </Card>
        </div>
      </div>
      <Footer />
    </>
  );
}

function Row({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof DollarSign;
}) {
  return (
    <div className="flex items-center justify-between border-b-[0.5px] border-line pb-2.5 last:border-0">
      <dt className="flex items-center gap-1.5 text-stone-light">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
