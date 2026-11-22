"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { onboardingQueryFor, type CalculatorField } from "@/lib/home-calculator";
import { ChevronDown, Mail, Route, Trophy } from "lucide-react";
import { FREE_TIER_TARGET_SCHOOL_LIMIT, type Gender, type SchoolLite } from "@/lib/types";
import { getCurrentSchoolYear } from "@/lib/time";
import { buildFitReport, isUsableUtr } from "@/lib/fit";
import { heroFitCta } from "@/lib/fit-copy";
import { realisticPaceProjectionFor } from "@/lib/what-if-utr";
import { EstimateChip } from "@/components/seeded/ui/data-note";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/shared/reveal";
import { seededCardHeading, seededSectionHeading } from "@/components/seeded/ui/heading";

// Pixel-exact to Main.dc.html (desktop) / MobileHome.dc.html (<lg). No
// JS viewport detection exists anywhere in this codebase — every other
// responsive split here is pure CSS breakpoints within one tree (as the
// Seeded nav does), so the mobile/desktop hero split below
// follows that same convention rather than introducing a new pattern.
// Nothing on this page animates in: Reveal is a plain <div> since
// PR-POLISH (2026-11-20), so every section is legible at first paint.
export function SeededHomeView({ schools }: { schools: SchoolLite[] }) {
  return (
    <div className="text-ink">
      <Hero schools={schools} />
      <TrustStrip />
      <WhatItDoes />
      <ProductShot />
      <ParentsSection />
      <MethodAndFounder />
      <Faq />
      <FinalCta />
    </div>
  );
}

/* --------------------------------------------------------------- HERO */

function Hero({ schools }: { schools: SchoolLite[] }) {
  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-8 pt-10 md:pb-12 lg:flex lg:flex-wrap lg:items-center lg:gap-12 lg:pt-18">
      {/* Desktop: two-column, left copy / right live calculator */}
      <div className="hidden min-w-0 flex-[1.05_1_480px] lg:block">
        <HeroCopy teamCount={schools.length} />
      </div>
      <div className="hidden min-w-0 flex-[0.95_1_440px] lg:block">
        <FitCalculatorCard schools={schools} />
      </div>

      {/* Mobile: compact hero + calculator card, matching MobileHome.dc.html */}
      <div className="flex flex-col gap-4 lg:hidden">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-grass">
          College tennis recruiting, planned
        </p>
        <h1 className="font-seeded text-[34px] font-bold leading-[1.08] tracking-[-0.025em] text-ink">
          Know which teams you can make, and what to do this month.
        </h1>
        {/* A-035: says what the comparison is against — our estimated
            range — and how many teams, counted from the catalogue. */}
        <p className="text-base leading-[1.5] text-stone">
          Your UTR against our estimated range for {schools.length} college teams, sorted into Reach,
          Target and Likely.
        </p>
        <FitCalculatorCard schools={schools} mobile />
      </div>
    </section>
  );
}

function HeroCopy({ teamCount }: { teamCount: number }) {
  return (
    <div>
      <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-grass">
        College tennis recruiting, planned
      </p>
      <h1 className="mt-4 font-seeded text-[56px] font-bold leading-[1.05] tracking-[-0.03em] text-ink">
        Know which college teams you can make, and what to do this month to
        get there.
      </h1>
      {/* P0-7: "compares you to real rosters" — the comparison is against
          team UTR estimates, not real rosters. Say "real programs": the
          schools are real, the roster numbers aren't sourced yet. */}
      {/* A-035 (2026-11-21): "compares you to real programs" did not say the
          comparison is against our ESTIMATED team ranges. The count is the
          catalogue's own length, never a typed number. */}
      <p className="mt-5 max-w-[540px] text-lg leading-[1.55] text-stone">
        Enter your UTR and grad year. Seeded compares your UTR with our estimated
        range for {teamCount} college teams, sorts them into Reach, Target and Likely,
        and turns the gap into season targets you plan against, with a family view
        your parents can follow.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/onboarding"
          className="inline-flex min-h-[52px] items-center justify-center rounded-lg bg-grass px-6 font-sans text-base font-semibold text-on-primary hover:bg-grass-600"
        >
          Get my free fit report
        </Link>
        <Link
          href="/tournament-fit"
          className="inline-flex min-h-[52px] items-center justify-center rounded-lg border border-input bg-card px-6 font-sans text-base font-semibold text-ink hover:bg-subtle-hover"
        >
          Check a tournament
        </Link>
      </div>
      <p className="mt-4 text-sm text-stone">
        Free. No card. Takes about 90 seconds. Results before you make an account.
      </p>
    </div>
  );
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "women", label: "Women's" },
  { value: "men", label: "Men's" },
];

function gradYearOptions(): number[] {
  const start = getCurrentSchoolYear();
  return Array.from({ length: 6 }, (_, i) => start + i);
}

// The live preview — genuinely computes Reach/Target/Likely from the real
// catalog via lib/school-fit.ts as the visitor types. GPA is collected (and
// passed along to /onboarding) but doesn't change the counts: the school
// data model has no academic-range field yet, so pretending GPA moved the
// numbers would be exactly the kind of fabricated precision the redesign
// is explicitly removing elsewhere. Flagged in the phase report, not hidden.
function FitCalculatorCard({ schools, mobile = false }: { schools: SchoolLite[]; mobile?: boolean }) {
  const [utr, setUtr] = useState("9.4");
  const [gradYear, setGradYear] = useState(() => gradYearOptions()[1] ?? getCurrentSchoolYear());
  const [gender, setGender] = useState<Gender>("women");
  const [gpa, setGpa] = useState("3.7");
  // The starting values above are an EXAMPLE (the card says so) — they are
  // not the visitor's. /onboarding treats every query value as an answer
  // and skips that question, then saves it to the new account. So only a
  // field the visitor actually changed travels: clicking straight through
  // used to pre-answer onboarding with UTR 9.4, GPA 3.7, women's and a
  // grad year Seeded picked — and the phone card, which has no GPA field,
  // sent a GPA the visitor never saw.
  const [touched, setTouched] = useState<ReadonlySet<CalculatorField>>(() => new Set());
  const touch = (field: CalculatorField) =>
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  const utrNum = parseFloat(utr) || 0;
  const filtered = useMemo(
    () => schools.filter((s) => s.gender === gender),
    [schools, gender]
  );
  // P1-FIT-4: same realistic-pace projection the pre-auth fit report uses,
  // so the homepage counts and the /onboarding counts the visitor sees next
  // are produced by one path and cannot disagree. Without it, every school
  // below the team floor counted as Reach and "Out of range" was always 0.
  const projection = useMemo(
    () =>
      realisticPaceProjectionFor({
        currentUTR: utrNum,
        graduationYear: gradYear,
        gender: gender === "women" ? "female" : "male",
      }),
    [utrNum, gradYear, gender]
  );
  // Same report the fit report itself uses, so the number this widget
  // promises on the homepage is the number /onboarding then shows. They
  // used to be computed two different ways from the same inputs.
  const report = useMemo(
    () =>
      buildFitReport({
        // Only a rating Postgres would accept (1–16.5): "25" is not a UTR,
        // and the card says so (heroFitCta) instead of counting it.
        currentUtr: isUsableUtr(utrNum) ? utrNum : null,
        graduationYear: gradYear,
        gender: gender === "women" ? "female" : "male",
        schools: filtered,
        projectionInput: projection,
      }),
    [utrNum, gradYear, gender, filtered, projection]
  );
  // The tiles and the button come from one pure function (lib/fit-copy.ts):
  // never "0 / 0 / 0", never "See my — schools", and the button's number is
  // Target + Likely, the count it names (A-001, A-002). TODAY's counts, like
  // the fit report the button opens (A-006); the summer estimate is a
  // separate, labelled line, shown only when it is higher.
  const cta = heroFitCta({
    counts: report?.todayCounts,
    projected: report?.utr.isProjected
      ? { inRange: report.recruitingInRange, year: report.utr.year }
      : null,
    utr: utrNum,
    schools: filtered,
    programLabel: gender === "women" ? "women's" : "men's",
  });
  const counts = report?.todayCounts;

  const query = onboardingQueryFor({ utr, gradYear: String(gradYear), gender, gpa }, touched);

  if (mobile) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
        {/* The same disclosure as the desktop card: these starting values
            are an example, not the visitor's (and only fields they change
            are sent on — lib/home-calculator.ts). */}
        <p className="text-xs text-stone">Example values. Change them to yours.</p>
        <div className="grid grid-cols-2 gap-2.5">
          <MiniField label="UTR">
            <input
              value={utr}
              onChange={(e) => {
                setUtr(e.target.value);
                touch("utr");
              }}
              className="h-12 rounded-lg border border-input px-3 font-mono text-base tabular-nums text-ink"
              inputMode="decimal"
            />
          </MiniField>
          <MiniField label="Grad year">
            <select
              value={gradYear}
              onChange={(e) => {
                setGradYear(Number(e.target.value));
                touch("gradYear");
              }}
              className="h-12 rounded-lg border border-input bg-card px-3 text-base text-ink"
            >
              {gradYearOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </MiniField>
        </div>
        <MiniField label="Team">
          <select
            value={gender}
            onChange={(e) => {
              setGender(e.target.value as Gender);
              touch("gender");
            }}
            className="h-12 rounded-lg border border-input bg-card px-3 text-base text-ink"
          >
            {GENDER_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </MiniField>
        <Link
          href={query ? `/onboarding?${query}` : "/onboarding"}
          className="flex min-h-[52px] items-center justify-center rounded-[10px] bg-grass font-sans text-base font-semibold text-on-primary hover:bg-grass-600"
        >
          See my schools
        </Link>
        <p className="text-center text-xs text-stone">Free · no account until you save</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-none rounded-xl border border-line bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-[15px]">Your fit, in about 90 seconds</strong>
        {/* P0-7: this said "Rosters verified Oct 2026". No roster has ever been
            verified and no verification date is stored anywhere. */}
        <EstimateChip />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniField label="Current UTR">
          <input
            value={utr}
            onChange={(e) => {
              setUtr(e.target.value);
              touch("utr");
            }}
            className="h-11 rounded-md border border-input px-3 font-mono text-base tabular-nums text-ink"
            inputMode="decimal"
          />
        </MiniField>
        <MiniField label="Grad year">
          <select
            value={gradYear}
            onChange={(e) => {
              setGradYear(Number(e.target.value));
              touch("gradYear");
            }}
            className="h-11 rounded-md border border-input bg-card px-2.5 text-base text-ink"
          >
            {gradYearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </MiniField>
        <MiniField label="Team">
          <select
            value={gender}
            onChange={(e) => {
              setGender(e.target.value as Gender);
              touch("gender");
            }}
            className="h-11 rounded-md border border-input bg-card px-2.5 text-base text-ink"
          >
            {GENDER_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </MiniField>
        <MiniField label="Unweighted GPA">
          <input
            value={gpa}
            onChange={(e) => {
              setGpa(e.target.value);
              touch("gpa");
            }}
            className="h-11 rounded-md border border-input px-3 font-mono text-base tabular-nums text-ink"
            inputMode="decimal"
          />
        </MiniField>
      </div>
      {cta.showCounts && counts ? (
        <div className="mt-5 grid grid-cols-3 gap-2">
          <CountTile value={counts.reach} label="Reach" bg="rgb(var(--c-clay-tint-bg))" fg="rgb(var(--c-clay-tint-text))" />
          <CountTile value={counts.target} label="Target" bg="rgb(var(--c-primary-50))" fg="rgb(var(--c-primary))" />
          <CountTile value={counts.likely} label="Likely" bg="rgb(var(--c-sage-tint-bg))" fg="rgb(var(--c-sage-tint-text))" />
        </div>
      ) : cta.kind === "no-utr" ? (
        <p className="mt-5 text-sm text-stone">{cta.note}</p>
      ) : null}
      {cta.projectedNote && <p className="mt-2 text-xs text-stone">{cta.projectedNote}</p>}
      {cta.kind === "zero" ? (
        <div className="mt-4 text-sm text-ink">
          <p className="m-0">{cta.sentence}</p>
          <Link
            href={cta.link.href}
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-grass hover:text-grass-700 sm:min-h-6"
          >
            {cta.link.label}
          </Link>
        </div>
      ) : (
        // Secondary on purpose (design system v2 rule 1): beside it, the hero
        // copy's "Get my free fit report" is the screen's one green button.
        <Link
          href={query ? `/onboarding?${query}` : "/onboarding"}
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg border border-input bg-card font-sans text-[15px] font-semibold text-ink hover:bg-subtle-hover"
        >
          {cta.label}
        </Link>
      )}
      <p className="mt-2.5 text-xs text-stone">Example output. Counts depend on your inputs.</p>
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
      {label}
      {children}
    </label>
  );
}

function CountTile({ value, label, bg, fg }: { value: number; label: string; bg: string; fg: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: bg }}>
      <div className="font-mono text-2xl font-semibold tabular-nums" style={{ color: fg }}>
        {value}
      </div>
      <div className="text-[13px] text-stone">{label}</div>
    </div>
  );
}

/* --------------------------------------------------------- TRUST STRIP */

function TrustStrip() {
  return (
    <section className="border-y border-line bg-card">
      {/* 15px, not 14. This is the first honesty claim a visitor reads and
          it was the faintest text on the page. The colour is UNCHANGED
          (still text-stone) — an earlier version of this comment claimed
          text-ink-2 and was simply wrong about its own diff. Measured:
          6.24:1 light, 7.14:1 dark, both past AA. */}
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-3 px-6 py-5 text-[15px] leading-[1.5] text-stone sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto] lg:items-center lg:gap-8">
        {/* P0-7: was "Real rosters. Every team rating shows its source and
            date." There is no source or date field; the team ranges are
            unverified estimates and now say so wherever they render. */}
        <span>
          <strong className="text-ink">Honest about the data.</strong> Every
          team rating is an estimate, and labelled as one.
        </span>
        <span>
          <strong className="text-ink">Bands, not promises.</strong> Likely,
          Target, Reach or Out of range &mdash; never a percent chance.
        </span>
        <span>
          <strong className="text-ink">Built by a junior player</strong>{" "}
          going through recruiting now.
        </span>
        <Link href="/methodology" className="inline-flex min-h-11 items-center text-grass hover:text-grass-700 sm:min-h-6">
          How we calculate fit
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- WHAT IT DOES */

const CAPABILITY_CARDS = [
  {
    title: "Plan",
    body: "Your UTR now vs what target teams need by the summer before senior year.",
    // An example, and said so. This named a real program ("Emory range
    // 9.1–10.6") with a range no source backs — roster UTRs are unsourced
    // estimates (UTR_RANGE_SOURCE_LABEL) — as a fact (2026-11-20).
    caption: "Example · you 9.4 · target team 9.1–10.6",
  },
  {
    title: "Compete smarter",
    body: "Check a tournament before you pay: draw, cost per match, travel.",
  },
  {
    title: "Reach out on time",
    body: "A coach pipeline, with follow-ups flagged on Today.",
  },
] as const;

// Design polish round 1 (Figma 04a): each card gets a tinted icon tile and a
// light tint background — palette tints only, no new colours.
const CARD_TINT = [
  { icon: Route, card: "border-grass-100 bg-grass-50", tile: "border-grass-100 bg-card text-grass" },
  {
    icon: Trophy,
    card: "border-[rgb(var(--c-sage-tint-border))] bg-[rgb(var(--c-sage-tint-bg))]",
    tile: "border-[rgb(var(--c-sage-tint-border))] bg-card text-[rgb(var(--c-sage-tint-text))]",
  },
  {
    icon: Mail,
    card: "border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))]",
    tile: "border-[rgb(var(--c-gold-tint-border))] bg-card text-[rgb(var(--c-gold-tint-text))]",
  },
] as const;

function WhatItDoes() {
  return (
    <section className="seeded-section-y mx-auto max-w-[1200px] px-6">
      <h2 className={cn(seededSectionHeading, "seeded-section-head max-w-[760px] text-balance")}>
        One plan for the three things that decide recruiting.
      </h2>
      <div className="seeded-card-row grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITY_CARDS.map((c, i) => (
          <Reveal key={c.title} index={i} step={0.06}>
            <div
              className={cn(
                "h-full rounded-[14px] border p-6 motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:-translate-y-0.5",
                CARD_TINT[i].card
              )}
            >
              {(() => {
                const Icon = CARD_TINT[i].icon;
                return (
                  <span className={cn("mb-4 flex h-11 w-11 items-center justify-center rounded-[10px] border", CARD_TINT[i].tile)}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                );
              })()}
              <h3 className="m-0 text-lg font-semibold text-ink">{c.title}</h3>
              <p className="mt-2 leading-[1.55] text-stone">{c.body}</p>
              {c.title === "Plan" && (
                <>
                  <div className="relative mt-5 h-2 rounded-pill bg-line">
                    <div className="absolute inset-y-0 rounded-pill bg-grass-300" style={{ left: "28%", right: "22%" }} />
                    <div className="absolute -top-1 h-4 w-4 rounded-full border-2 border-on-lime bg-lime-accent" style={{ left: "44%" }} />
                  </div>
                  <p className="mt-2.5 font-mono text-[13px] tabular-nums text-stone">{c.caption}</p>
                </>
              )}
              {c.title === "Compete smarter" && (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-stone">Example</span>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-grass-100 bg-grass-50 px-2.5 py-1 text-xs font-semibold text-grass">
                    Good fit · L3 Richmond
                  </span>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-[rgb(var(--c-clay-tint-border))] bg-[rgb(var(--c-clay-tint-bg))] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--c-clay-tint-text))]">
                    Skip · L5 Bethesda
                  </span>
                </div>
              )}
              {c.title === "Reach out on time" && (
                <div className="mt-5 flex flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="text-xs text-stone">Example</span>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-stone">
                    Emailed 8
                  </span>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-stone">
                    Replied 3
                  </span>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--c-gold-tint-text))]">
                    2 follow-ups due
                  </span>
                </div>
              )}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ PRODUCT SHOT */

function ProductShot() {
  return (
    <section className="seeded-section-y mx-auto max-w-[1200px] px-6">
      <Reveal>
        <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card-lg">
          <div className="flex items-center gap-2 border-b border-line bg-panel px-4 py-3">
            <span className="text-[13px] text-stone">seededtennis.com/today</span>
          </div>
          <div className="flex flex-wrap">
            <div className="flex flex-0 flex-col gap-1.5 border-r border-line p-5 text-sm" style={{ flexBasis: 200 }}>
              <span className="rounded-md bg-grass-50 px-2.5 py-2 font-semibold text-grass">Today</span>
              <span className="px-2.5 py-2 text-ink">Plan</span>
              <span className="px-2.5 py-2 text-ink">Schools</span>
              <span className="px-2.5 py-2 text-ink">Outreach</span>
              <span className="px-2.5 py-2 text-ink">Events</span>
            </div>
            <div className="min-w-0 flex-[999_1_560px] p-7">
              {/* Mirrors what /today renders: its heading and the three real
                  action kinds in lib/today-actions.ts (email, follow-up,
                  check-in), worded as the code words them. It used to show
                  "Skip the L5 on Nov 22 — 2 better events within 3 hours",
                  an action /today has never produced, under a caption
                  calling this "the real Today screen". */}
              <h3 className="mb-5 mt-1.5 text-2xl text-ink">Good evening, Maya. 3 things move your recruiting this week.</h3>
              <div className="flex flex-col gap-2.5">
                <ProductShotAction
                  title="Email the Emory coach"
                  body="Your UTR (9.40) is inside Emory's competitive range."
                  time="10 min"
                  cta="Open draft"
                  primary
                />
                <ProductShotAction
                  title="Follow up with Middlebury"
                  body="Sent 14 days ago, no reply yet."
                  time="5 min"
                  cta="Follow up"
                />
                <ProductShotAction
                  title="Check in on Wake Forest"
                  body="You set a reminder to follow up with Wake Forest."
                  time="5 min"
                  cta="Open"
                />
              </div>
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-[13px] text-stone">What Today shows, for an example player.</p>
      </Reveal>
    </section>
  );
}

function ProductShotAction({
  title,
  body,
  time,
  cta,
  primary = false,
}: {
  title: string;
  body: string;
  time: string;
  cta: string;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-line px-4 py-3.5">
      <div className="min-w-[200px] flex-1">
        <strong className="text-ink">{title}</strong>
        <div className="text-sm text-stone">{body}</div>
      </div>
      <span className="text-[13px] text-stone">{time}</span>
      <span
        className={
          primary
            ? "inline-flex min-h-9 items-center justify-center rounded-lg bg-grass px-4 text-sm font-semibold text-on-primary"
            : "inline-flex min-h-9 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-semibold text-ink"
        }
      >
        {cta}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------- PARENTS */

function ParentsSection() {
  return (
    // Deliberately always-dark panel, independent of site-wide light/dark
    // mode — bg-[rgb(var(--c-night))] is a
    // fixed value (matching light mode's own --c-ink) rather than bg-ink,
    // which would otherwise flip bright once the site is in dark mode and
    // break every hardcoded light-on-dark color below it.
    <section className="bg-[rgb(var(--c-night))] text-[rgb(var(--c-night-text))]">
      <div className="seeded-section-y mx-auto flex max-w-[1200px] flex-wrap items-center gap-12 px-6">
        <Reveal className="min-w-0 flex-[1_1_420px]">
          <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-lime-accent">
            For parents
          </p>
          <h2 className={cn(seededSectionHeading, "mt-3 text-balance text-[rgb(var(--c-night-text))]")}>
            See if the plan is working, without nagging.
          </h2>
          {/* P0-7: this promised "A Sunday email with...". Seeded sends no
              email at all — the only mail that leaves the system is Supabase
              Auth's own confirmation/reset. The report itself is real and
              lives at /family/weekly-reports; you open it, we don't send it.
              The weekly parent email is POST-V1. */}
          <p className="mt-4 text-[17px] leading-[1.55] text-[rgb(var(--c-night-soft))]">
            A weekly report you can open any time: UTR movement, coach replies,
            upcoming events and what the season has cost so far.
          </p>
          {/* Rule 1: lime is never a button fill. An outline button in the
              panel's own text colour: the border is the panel's text colour
              on the panel, so its contrast is the text's (fixed, both modes). */}
          <Link
            href="/sample-report"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-[rgb(var(--c-night-text))] px-[18px] text-[15px] font-semibold text-[rgb(var(--c-night-text))] hover:bg-[rgb(var(--c-night-text)/0.08)]"
          >
            See a sample parent report
          </Link>
        </Reveal>
        <Reveal index={1} step={0.1} className="min-w-0 flex-[1_1_420px] rounded-xl border border-[rgb(var(--c-night-line))] bg-[rgb(var(--c-night-card))] p-6">
          {/* P0-7: these numbers are illustrative, not a real player's. The
              Today mock elsewhere on this page already says "Example player";
              this card didn't, so it read as a real week. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-[rgb(var(--c-night-muted))]">Week of Nov 2</div>
            <span className="rounded-pill border border-[rgb(var(--c-night-line))] px-2 py-0.5 text-xs font-semibold text-[rgb(var(--c-night-muted))]">
              Example
            </span>
          </div>
          <div className="mt-3.5 grid grid-cols-3 gap-3">
            <div>
              <div className="font-mono text-[26px] tabular-nums text-[rgb(var(--c-night-text))]">+0.12</div>
              <div className="text-[13px] text-[rgb(var(--c-night-muted))]">UTR this week</div>
            </div>
            <div>
              <div className="font-mono text-[26px] tabular-nums text-[rgb(var(--c-night-text))]">2</div>
              <div className="text-[13px] text-[rgb(var(--c-night-muted))]">coach replies</div>
            </div>
            <div>
              <div className="font-mono text-[26px] tabular-nums text-[rgb(var(--c-night-text))]">$1,840</div>
              <div className="text-[13px] text-[rgb(var(--c-night-muted))]">season spend</div>
            </div>
          </div>
          <div className="mt-4.5 border-t border-[rgb(var(--c-night-line))] pt-4 text-sm text-[rgb(var(--c-night-soft))]">
            Skipped 2 bad-fit events this fall · saved about $620
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------- METHOD + FOUNDER */

function MethodAndFounder() {
  // Design system v2 rule 5: the two cards share a height. The dead space an
  // earlier stretch left under the shorter card is gone because each card is
  // a flex column and its last line (the link / the sign-off) sits at the
  // bottom with mt-auto.
  return (
    <section id="how-fit-works" className="seeded-section-y seeded-card-row mx-auto max-w-[1200px] grid-cols-1 px-6 lg:grid-cols-2">
      <Reveal className="flex h-full flex-col rounded-xl border border-line bg-card p-7">
        <h2 className={cn(seededCardHeading, "m-0")}>How fit works</h2>
        <ol className="mt-4 list-decimal space-y-1 pl-5 leading-[1.7] text-stone">
          {/* Was: "from public profiles", "count seniors who graduate
              before you arrive", "we add academics and your preferences",
              "a confidence level". None of the four is what the code does
              — see the note at the top of seeded-methodology-view.tsx. */}
          <li>Each team has an estimated UTR range, labelled as an estimate wherever it appears.</li>
          <li>
            We place you on that range &mdash; at your projected rating for the
            summer before senior year, labelled as an estimate (top D1 programs
            often decide earlier, during junior year).
          </li>
          <li>Academics, division and region are filters you choose; they don&apos;t change your band.</li>
          <li>You get one of four bands. We never show a percent chance.</li>
        </ol>
        <Link href="/methodology" className="mt-auto inline-flex min-h-11 items-center pt-4 font-semibold text-grass hover:text-grass-700 sm:min-h-6">
          Read the full methodology
        </Link>
      </Reveal>
      <Reveal index={1} step={0.08} className="flex h-full flex-col rounded-xl border border-line bg-card p-7">
        <h2 className={cn(seededCardHeading, "m-0")}>Who built this</h2>
        <p className="mt-4 leading-[1.6] text-stone">
          I&apos;m a junior tennis player going through recruiting right now.
          I built Seeded because my family was tracking schools, tournaments
          and coach emails in five different places.
        </p>
        <p className="mt-3 font-semibold text-ink">
          Niran — Seeded&apos;s founder
        </p>
        <p className="mt-1 text-[15px] leading-[1.55] text-stone">
          Junior player at a DMV high school, building the tool my family needed.
        </p>
        {/* P0-7: was "and we fix it within 48 hours" — a one-person project
            with no on-call rotation and no ticketing. Don't promise a
            turnaround we have no way to hold ourselves to.
            The link is underlined, not just green: axe flagged
            `link-in-text-block` here (serious) because colour was the only
            thing distinguishing it from the sentence around it. */}
        <p className="mt-auto pt-3 text-sm text-stone">
          Found a wrong number?{" "}
          <Link
            href="/contact"
            className="font-medium text-grass underline underline-offset-4 hover:text-grass-700"
          >
            Report it
          </Link>{" "}
          and I&apos;ll look into it.
        </p>
      </Reveal>
    </section>
  );
}

/* ----------------------------------------------------------------- FAQ */

// Three of these four used to have no answer at all — `{ q: "..." }` with
// no `a`, which as a native <details> meant a disclosure that opened onto
// nothing.
//
// TWO OF THE THREE ANSWERS WRITTEN HERE WERE FALSE, and an independent
// verifier caught both. Recorded rather than quietly corrected, because the
// way they went wrong is the way copy always goes wrong on this project:
//
//  1. "Official team rosters and public UTR profiles, WITH THE DATE WE
//     CHECKED." There is no source field and no date field on `School`
//     (lib/types.ts) — `UTR_RANGE_SOURCE_LABEL` is the literal string
//     "Unverified estimate", every school page says so on screen, and
//     /methodology — the page this very answer links to — says "there is no
//     published source or check date behind any of them". Worse, it was a
//     REWORD AROUND A LIVE GUARD: copy-honesty.test.ts bans
//     /shows its source and date/, and "with the date we checked" makes the
//     same claim in words the regex misses. CLAUDE.md forbids exactly that.
//
//  2. "...enforced in the database, not just on the signup form." True on
//     STAGING. Production is still on 23 migrations with no
//     `consent_status` column at all, and `main` auto-deploys — so merging
//     that sentence would have published a child-safety claim with nothing
//     behind it, and left it false for as long as the code was ahead of the
//     migrations.
//
// Both now say only what is true of the code as it stands, independent of
// rollout order. When the consent migrations land on production, strengthen
// the second answer deliberately — in the commit that makes it true.
const FAQ_ITEMS: { q: string; a: string; href?: string; hrefLabel?: string }[] = [
  {
    q: "How is this different from UTR's college tools?",
    a: "UTR shows where your rating sits. Seeded uses that to plan your season, judge tournaments and run coach outreach, and gives parents a shared view.",
  },
  {
    q: "Where does the roster data come from?",
    a: "Each team's range is two estimates entered by hand into our catalogue — a competitive floor and an average UTR. There is no published source or check date behind either, so they are labelled unverified estimates everywhere they appear. We store no rosters and no individual player's rating.",
    href: "/methodology",
    hrefLabel: "How we calculate fit",
  },
  {
    q: "My child is 14. Who owns the account?",
    a: "They can hold their own account. For younger players a parent sets it up: onboarding asks for a birth year, and an under-13 account needs an adult in the family to approve it before it can be used.",
    href: "/privacy",
    hrefLabel: "What we store, and for how long",
  },
  {
    q: "What does the free plan include?",
    a: `Browsing the whole school catalogue, team UTR estimates and academic rankings, full school detail pages, the tournament fit checker, and up to ${FREE_TIER_TARGET_SCHOOL_LIMIT} saved target schools.`,
    href: "/pricing",
    hrefLabel: "Compare the plans",
  },
];

// Was a stack of native <details>/<summary>. Two problems with that here:
// the disclosure triangle is the browser's own marker and ignores the
// design system entirely, and the section sat at max-w-[880px] while every
// other section on the page is max-w-[1200px], so it read as a different
// page that had been pasted in.
//
// This is a real accordion: each header is a <button> (so Enter, Space and
// focus come from the platform, not from a keydown handler), carries
// aria-expanded and aria-controls, and the panel it names is the thing that
// shows and hides. Several can be open at once — these are independent
// questions, not a single-choice list.
function Faq() {
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (q: string) =>
    setOpen((prev) => (prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]));

  return (
    <section className="seeded-section-y mx-auto max-w-[1200px] px-6">
      <h2 className={cn(seededSectionHeading, "seeded-section-head m-0")}>
        Questions parents ask
      </h2>
      <div className="border-t border-line">
        {FAQ_ITEMS.map((item) => {
          const isOpen = open.includes(item.q);
          const panelId = `faq-panel-${item.q.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
          return (
            <div key={item.q} className="border-b border-line">
              <h3 className="m-0">
                <button
                  type="button"
                  onClick={() => toggle(item.q)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex min-h-11 w-full items-center justify-between gap-4 py-4.5 text-left text-[17px] font-semibold text-ink transition-colors hover:text-grass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "h-5 w-5 shrink-0 text-stone transition-transform duration-200 motion-reduce:transition-none",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
              </h3>
              {isOpen && (
                <div id={panelId} className="max-w-[820px] pb-4.5">
                  <p className="m-0 leading-[1.6] text-stone">{item.a}</p>
                  {item.href && (
                    <Link
                      href={item.href}
                      className="mt-2 inline-block font-semibold text-grass underline underline-offset-4 hover:text-grass-700"
                    >
                      {item.hrefLabel}
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ FINAL CTA */

function FinalCta() {
  // Design system v2 rule 1: one green button, and lime is never a fill.
  // This band used to be a fixed-dark panel with a lime button, sitting
  // directly under another fixed-dark panel with another lime button — two
  // accents fighting the page's green CTAs. Court green on that dark band
  // measured ~2.7:1 in light mode (under the 3:1 a control boundary needs),
  // so the band is now an ordinary surface and the button the ordinary
  // primary: the same pairing, and the same contrast, as every other green
  // button on the site, in both modes.
  return (
    <section className="border-t border-line bg-card">
      <div className="seeded-section-y mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-6">
        <h2 className={cn(seededSectionHeading, "m-0 max-w-[640px] text-balance")}>
          Find out where you fit before your next tournament.
        </h2>
        <Link
          href="/onboarding"
          className="inline-flex min-h-[52px] items-center justify-center rounded-lg bg-grass px-6 font-sans text-[15px] font-semibold text-on-primary hover:bg-grass-600"
        >
          Get my free fit report
        </Link>
      </div>
    </section>
  );
}

