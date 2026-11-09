"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Building2, GraduationCap, User } from "lucide-react";
import type { School } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { classifySchoolFit, schoolUtrRange, utrToPct } from "@/lib/school-fit";
import { loadCoachOutreach } from "@/lib/supabase/features";
import { FitBadge } from "@/components/seeded/ui/fit-badge";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { SeededButton, seededButtonVariants } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { Footer } from "@/components/layout/footer";
import { cn } from "@/lib/utils";

interface Props {
  school: School;
  nationalRank: number;
  stats: { label: string; value: string }[];
  programType: string;
  inState: boolean;
}

// Client Component (promoted from Server Component — needs usePlayer() for
// real personalization: fit band, UTR comparison, save-to-targets). Rebuilt
// pixel-exact to SchoolProfile.dc.html, which has NO brand-colored hero
// banner, avatar circle, rank badge, or stat-tiles grid — those were this
// file's own earlier invention, before the real mockup existed. Removed to
// match; the real ranking data they showed (US News, conference rank) now
// lives inside the "Academics" card below instead of a dedicated tile row.
export function SeededSchoolDetail({ school, nationalRank, programType }: Props) {
  const { player, updatePlayer } = usePlayer();
  const { data: outreach } = useSWR("coach-outreach", () => loadCoachOutreach());

  const fit = classifySchoolFit(player.currentUTR, school);
  const range = schoolUtrRange(school);
  const saved = player.targetSchoolSlugs.includes(school.slug);
  const alreadyContacted = Boolean(outreach?.[school.slug]);

  const whatWouldMoveIt = (() => {
    const bits: string[] = [];
    if (fit === "reach") {
      const gap = school.minCompetitiveUTR - player.currentUTR;
      if (gap > 0) bits.push(`+${gap.toFixed(2)} UTR would put you at their competitive floor.`);
    } else if (fit === "target") {
      const gap = school.avgRosterUTR - player.currentUTR;
      if (gap > 0) bits.push(`+${gap.toFixed(2)} UTR would put you above their roster average.`);
    }
    if (outreach && !alreadyContacted) {
      bits.push("Their coach hasn't heard from you yet.");
    }
    return bits.join(" ");
  })();

  const toggleSave = () => {
    const next = saved
      ? player.targetSchoolSlugs.filter((s) => s !== school.slug)
      : [...player.targetSchoolSlugs, school.slug];
    updatePlayer({ targetSchoolSlugs: next });
  };

  return (
    <>
      <div className="mx-auto max-w-content container-px py-10">
        <Link href="/schools" className="inline-flex items-center gap-1.5 text-sm text-ink hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Schools
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-seeded text-[34px] font-semibold tracking-tight text-ink">
              {school.name} · {programType} tennis
            </h1>
            <p className="mt-1.5 text-stone">
              {school.division} · {school.conference} · {school.city}, {school.state}
            </p>
            <div className="mt-2.5">
              <a
                href={`mailto:NiranRamprasad@gmail.com?subject=${encodeURIComponent(
                  `Wrong data on ${school.name}`
                )}`}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-stone hover:text-ink"
              >
                Report an error
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/schools?compare=${school.slug}&gender=${school.gender}`}
              className={seededButtonVariants({ variant: "secondary" })}
            >
              Compare
            </Link>
            <SeededButton variant={saved ? "secondary" : "primary"} onClick={toggleSave}>
              {saved ? "Saved to targets" : "Save to targets"}
            </SeededButton>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[10px] border border-line bg-card p-[22px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-ink">Your fit</h2>
              <FitBadge band={fit} className="text-sm" />
            </div>
            <p className="mt-2 text-sm text-stone">
              Fit band is based on real roster UTR data only — academics, openings, and timing aren&apos;t
              factored in yet.
            </p>

            <FitDriverRow
              label="UTR"
              description={`You ${player.currentUTR.toFixed(1)} vs their ${range.min.toFixed(1)}–${range.max.toFixed(1)} range`}
              chip={fit === "reach" ? "Below range" : fit === "target" ? "In range" : "Above range"}
            />
            <FitDriverRow
              label="Timing"
              description={
                school.division === "D1"
                  ? "D1 coaches often build boards early — junior year is a good time for a first email."
                  : "D3 coaches can respond any time — junior fall to junior spring is a typical first-contact window."
              }
              chip="General"
            />

            {whatWouldMoveIt && (
              <div className="mt-3 rounded-[8px] bg-cream p-3.5 text-sm text-ink">
                <strong>What would move it: </strong>
                {whatWouldMoveIt}
              </div>
            )}
          </div>

          <div className="rounded-[10px] border border-line bg-card p-[22px]">
            <h2 className="text-lg font-semibold text-ink">Where you sit on this roster</h2>
            <div className="mt-4">
              <RangeBar
                rangeStartPct={utrToPct(range.min)}
                rangeEndPct={utrToPct(range.max)}
                medianPct={utrToPct(school.avgRosterUTR)}
                youPct={utrToPct(player.currentUTR)}
                caption={`You ${player.currentUTR.toFixed(1)} · team ${range.min.toFixed(1)}–${range.max.toFixed(1)}`}
              />
            </div>
            <p className="mt-3 text-sm text-stone">
              Individual roster data isn&apos;t tracked yet — this shows the team&apos;s overall real UTR
              range, not per-player positions.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[10px] border border-line bg-card p-[22px]">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-grass" />
              <h2 className="text-base font-semibold text-ink">Academics and cost</h2>
            </div>
            <p className="mt-2.5 text-sm text-stone">
              #{school.usNewsRanking} national academic ranking · #{school.conferenceRank} in{" "}
              {school.conference} for tennis · #{nationalRank} among {school.division} {programType.toLowerCase()}{" "}
              programs by fit.
            </p>
            <EmptyState className="mt-3" title="Cost, aid, and enrollment data coming soon." />
          </div>

          <div className="rounded-[10px] border border-line bg-card p-[22px]">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-grass" />
              <h2 className="text-base font-semibold text-ink">Coaching staff</h2>
            </div>
            <p className="mt-2.5 text-sm text-ink">
              {school.coachName}
              <span className="block text-xs text-stone-light">{school.coachEmail}</span>
            </p>
            <Link
              href={`/outreach?school=${school.slug}`}
              className={cn(seededButtonVariants({ variant: "primary" }), "mt-3.5 w-full")}
            >
              Draft an email to the head coach
            </Link>
          </div>

          <div className="rounded-[10px] border border-line bg-card p-[22px]">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-grass" />
              <h2 className="text-base font-semibold text-ink">Recruiting timeline</h2>
            </div>
            <p className="mt-2.5 text-sm text-stone">
              {school.division === "D1"
                ? "D1 programs often have informal boards years out — reaching out early, even as an underclassman, is normal."
                : "D3 coaches can respond any time. Typical first contact: junior fall to junior spring."}
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

function FitDriverRow({
  label,
  description,
  chip,
}: {
  label: string;
  description: string;
  chip: string;
}) {
  return (
    <div className="grid grid-cols-[100px_minmax(0,1fr)_auto] items-center gap-3 border-t border-[#EFEDE6] py-3 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <span className="text-stone">{description}</span>
      <span className="inline-flex items-center whitespace-nowrap rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-stone">
        {chip}
      </span>
    </div>
  );
}
