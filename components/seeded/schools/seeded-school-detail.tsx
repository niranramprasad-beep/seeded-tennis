import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Award,
  ArrowLeft,
  Building2,
  GraduationCap,
  MapPin,
  Trophy,
  User,
  Users,
} from "lucide-react";
import type { School } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { SchoolBadge } from "@/components/shared/school-badge";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { Footer } from "@/components/layout/footer";

const RosterDistributionChart = dynamic(
  () => import("@/components/charts/roster-distribution-chart").then((mod) => mod.RosterDistributionChart),
  { loading: () => <Skeleton className="h-56 w-full" /> }
);

interface Props {
  school: School;
  nationalRank: number;
  stats: { label: string; value: string }[];
  programType: string;
  inState: boolean;
}

// Server Component (no "use client") — same shape as Legacy's detail page,
// just the surrounding cards/typography get the Seeded treatment. The hero
// banner deliberately keeps the SCHOOL's own brand colors unchanged in both
// designs — that's the program's identity, not Seeded's.
//
// Roster, results, standings, recruiting classes, coach contact, and
// campus/cost all used to be fabricated per-school (see lib/data/school-
// detail.ts, removed) — every one of those sections now shows EmptyState
// until Phase 4 (SchoolProfile.dc.html) wires up a real source.
export function SeededSchoolDetail({ school, nationalRank, stats, programType }: Props) {
  return (
    <>
      <section
        className="relative overflow-hidden"
        style={{ backgroundColor: school.primaryColor, color: school.textColor }}
      >
        <div className="relative mx-auto max-w-content container-px py-12">
          <Link
            href="/schools"
            className="inline-flex items-center gap-1.5 font-seeded text-sm opacity-80 transition-opacity hover:opacity-100"
          >
            <ArrowLeft className="h-4 w-4" />
            All schools
          </Link>

          <div className="mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full font-seeded text-2xl font-semibold"
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
              <h1 className="font-seeded text-3xl font-semibold tracking-tight sm:text-4xl">{school.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm opacity-90">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {school.city}, {school.state}
                </span>
                <span>{school.conference}</span>
                <span>{programType} · {school.division}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <span
                className="rounded-pill px-3 py-1.5 font-seeded text-sm font-medium"
                style={{ backgroundColor: `${school.textColor}22` }}
              >
                #{nationalRank} in {programType} {school.division}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-content container-px py-10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-[10px] border border-line bg-card p-4">
              <p className="text-xs text-stone-light">{s.label}</p>
              <p className="mt-1 font-mono text-2xl text-ink">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 rounded-[10px] border border-line bg-card p-6 lg:col-span-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-grass" />
              <h2 className="font-seeded text-lg font-medium text-ink">Roster</h2>
            </div>
            <div className="mt-3">
              <RosterDistributionChart avgUTR={school.avgRosterUTR} minUTR={school.minCompetitiveUTR} height={160} />
            </div>
            <EmptyState className="mt-4" title="Verified roster data coming soon." />
          </div>

          <div className="flex flex-col rounded-[10px] border border-line bg-card p-6">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-grass" />
              <h2 className="font-seeded text-lg font-medium text-ink">Head coach</h2>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-[10px] border border-line p-3">
              <SchoolBadge school={school} size={42} />
              <p className="text-xs text-stone-light">{programType} Tennis</p>
            </div>
            <EmptyState className="mt-4 flex-1" title="Verified coach contact coming soon." />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[10px] border border-line bg-card p-6">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-grass" />
              <h2 className="font-seeded text-lg font-medium text-ink">Recent results</h2>
            </div>
            <EmptyState className="mt-4" title="Verified match results coming soon." />
          </div>

          <div className="min-w-0 rounded-[10px] border border-line bg-card p-6">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-grass" />
              <h2 className="font-seeded text-lg font-medium text-ink">{school.conference} standings</h2>
            </div>
            <EmptyState className="mt-4" title="Verified conference standings coming soon." />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[10px] border border-line bg-card p-6 lg:col-span-2">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-grass" />
              <h2 className="font-seeded text-lg font-medium text-ink">Recruiting class history</h2>
            </div>
            <EmptyState className="mt-4" title="Verified recruiting class data coming soon." />
          </div>

          <div className="rounded-[10px] border border-line bg-card p-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-grass" />
              <h2 className="font-seeded text-lg font-medium text-ink">Campus & cost</h2>
            </div>
            <EmptyState className="mt-4" title="Verified campus and cost data coming soon." />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
