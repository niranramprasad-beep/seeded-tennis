"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Gender, SchoolLite } from "@/lib/types";
import { getCurrentSchoolYear } from "@/lib/time";
import { countSchoolFits } from "@/lib/school-fit";
import { Reveal } from "@/components/shared/reveal";
import { SeededButton } from "@/components/seeded/ui/button";

// Pixel-exact to Main.dc.html (desktop) / MobileHome.dc.html (<lg). No
// JS viewport detection exists anywhere in this codebase — every other
// responsive split here is pure CSS breakpoints within one tree (see
// components/layout/nav.tsx), so the mobile/desktop hero split below
// follows that same convention rather than introducing a new pattern.
// Hero renders with no scroll-reveal (server-paintable, no fade-in above
// the fold); everything below it keeps the existing Reveal fade-up —
// the phase spec only calls out the hero specifically.
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
      <HomeFooter />
    </div>
  );
}

/* --------------------------------------------------------------- HERO */

function Hero({ schools }: { schools: SchoolLite[] }) {
  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-14 pt-10 lg:flex lg:flex-wrap lg:items-center lg:gap-12 lg:pb-14 lg:pt-18">
      {/* Desktop: two-column, left copy / right live calculator */}
      <div className="hidden min-w-0 flex-[1.05_1_480px] lg:block">
        <HeroCopy />
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
        <p className="text-base leading-[1.5] text-stone">
          Your UTR against real rosters, sorted into Reach, Target and Likely.
        </p>
        <FitCalculatorCard schools={schools} mobile />
        <ul className="flex flex-col gap-2 text-sm text-stone">
          <li>✓ Rosters show source and date</li>
          <li>✓ Bands and confidence, never a % chance</li>
          <li>✓ Built by a junior player</li>
        </ul>
      </div>
    </section>
  );
}

function HeroCopy() {
  return (
    <div>
      <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-grass">
        College tennis recruiting, planned
      </p>
      <h1 className="mt-4 font-seeded text-[56px] font-bold leading-[1.05] tracking-[-0.03em] text-ink">
        Know which college teams you can make, and what to do this month to
        get there.
      </h1>
      <p className="mt-5 max-w-[540px] text-lg leading-[1.55] text-stone">
        Enter your UTR and grad year. Seeded compares you to real rosters,
        sorts schools into Reach, Target and Likely, and turns the gap into a
        week-by-week plan your parents can see.
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
        Free. No card. Takes 60 seconds. Results before you make an account.
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

  const utrNum = parseFloat(utr) || 0;
  const filtered = useMemo(
    () => schools.filter((s) => s.gender === gender),
    [schools, gender]
  );
  const counts = useMemo(() => countSchoolFits(utrNum, filtered), [utrNum, filtered]);
  const total = counts.reach + counts.target + counts.likely;

  const query = new URLSearchParams({
    utr,
    gradYear: String(gradYear),
    gender,
    gpa,
  }).toString();

  if (mobile) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
        <div className="grid grid-cols-2 gap-2.5">
          <MiniField label="UTR">
            <input
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              className="h-12 rounded-lg border border-input px-3 font-mono text-base tabular-nums text-ink"
              inputMode="decimal"
            />
          </MiniField>
          <MiniField label="Grad year">
            <select
              value={gradYear}
              onChange={(e) => setGradYear(Number(e.target.value))}
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
            onChange={(e) => setGender(e.target.value as Gender)}
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
          href={`/onboarding?${query}`}
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
      <div className="flex items-center justify-between">
        <strong className="text-[15px]">Your fit, in 60 seconds</strong>
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-medium text-stone">
          Rosters verified Oct 2026
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniField label="Current UTR">
          <input
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            className="h-11 rounded-md border border-input px-3 font-mono text-base tabular-nums text-ink"
            inputMode="decimal"
          />
        </MiniField>
        <MiniField label="Grad year">
          <select
            value={gradYear}
            onChange={(e) => setGradYear(Number(e.target.value))}
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
            onChange={(e) => setGender(e.target.value as Gender)}
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
            onChange={(e) => setGpa(e.target.value)}
            className="h-11 rounded-md border border-input px-3 font-mono text-base tabular-nums text-ink"
            inputMode="decimal"
          />
        </MiniField>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <CountTile value={counts.reach} label="Reach" bg="rgb(var(--c-clay-tint-bg))" fg="rgb(var(--c-clay-tint-text))" />
        <CountTile value={counts.target} label="Target" bg="rgb(var(--c-primary-50))" fg="rgb(var(--c-primary))" />
        <CountTile value={counts.likely} label="Likely" bg="rgb(var(--c-sage-tint-bg))" fg="rgb(var(--c-sage-tint-text))" />
      </div>
      <Link
        href={`/onboarding?${query}`}
        className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg bg-grass font-sans text-[15px] font-semibold text-on-primary hover:bg-grass-600"
      >
        See my {total || "—"} schools
      </Link>
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
      <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-8 px-6 py-5 text-sm text-stone">
        <span>
          <strong className="text-ink">Real rosters.</strong> Every team
          rating shows its source and date.
        </span>
        <span>
          <strong className="text-ink">Bands, not promises.</strong> Reach,
          Target, Likely, with a confidence level.
        </span>
        <span>
          <strong className="text-ink">Built by a junior player</strong>{" "}
          going through recruiting now.
        </span>
        <Link href="/methodology" className="text-grass hover:text-grass-700">
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
    body: "Your UTR now vs where your target teams need you by the summer before senior year, with checkpoints each season.",
    caption: "You 9.4 · Emory range 9.1–10.6",
  },
  {
    title: "Compete smarter",
    body: "Check any tournament before you pay. Seeded scores the draw against your level, cost per match, and travel.",
  },
  {
    title: "Reach out on time",
    body: "A pipeline for every coach: draft, sent, replied, call, visit. Seeded reminds you when a follow-up is due.",
  },
] as const;

function WhatItDoes() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-6 pt-22">
      <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-grass">
        UTR tells you where you stand. Seeded tells you what to do next.
      </p>
      <h2 className="mt-3 max-w-[760px] font-seeded text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-ink">
        One plan for the three things that decide recruiting.
      </h2>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITY_CARDS.map((c, i) => (
          <Reveal key={c.title} index={i} step={0.06}>
            <div className="h-full rounded-xl border border-line bg-card p-6">
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
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-grass-100 bg-grass-50 px-2.5 py-1 text-xs font-semibold text-grass">
                    Good fit · L3 Richmond
                  </span>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-[rgb(var(--c-clay-tint-border))] bg-[rgb(var(--c-clay-tint-bg))] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--c-clay-tint-text))]">
                    Skip · L5 Bethesda
                  </span>
                </div>
              )}
              {c.title === "Reach out on time" && (
                <div className="mt-5 flex gap-1.5 text-[13px]">
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
    <section className="mx-auto max-w-[1200px] px-6 py-18">
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
              <p className="m-0 text-sm text-stone">Junior fall · UTR 9.4 · on track for 6 of 12 targets</p>
              <h3 className="mb-5 mt-1.5 text-2xl text-ink">3 things to do this week</h3>
              <div className="flex flex-col gap-2.5">
                <ProductShotAction
                  title="Email the Emory coach"
                  body="You're inside their range now. Send with your last 3 results."
                  time="10 min"
                  cta="Open draft"
                  primary
                />
                <ProductShotAction
                  title="Follow up with Middlebury"
                  body="No reply in 14 days."
                  time="5 min"
                  cta="Follow up"
                />
                <ProductShotAction
                  title="Skip the L5 on Nov 22"
                  body="Field average 6.8 won't move your rating. 2 better events within 3 hours."
                  time="2 min"
                  cta="See events"
                />
              </div>
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-[13px] text-stone">The real Today screen. Example player.</p>
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
    // Deliberately always-dark panel (like a fixed Legacy concept-theme
    // block), independent of site-wide light/dark mode — bg-[#14181A] is a
    // fixed value (matching light mode's own --c-ink) rather than bg-ink,
    // which would otherwise flip bright once the site is in dark mode and
    // break every hardcoded light-on-dark color below it.
    <section className="bg-[#14181A] text-[#EEF1EC]">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-12 px-6 py-20">
        <Reveal className="min-w-0 flex-[1_1_420px]">
          <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-lime-accent">
            For parents
          </p>
          <h2 className="mt-3 font-seeded text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-[#EEF1EC]">
            See if the plan is working, without nagging.
          </h2>
          <p className="mt-4 text-[17px] leading-[1.55] text-[#B9C2BC]">
            A Sunday email with UTR movement, coach replies, upcoming events
            and what the season has cost so far.
          </p>
          <Link
            href="/sample-report"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-lime-accent px-[18px] text-[15px] font-semibold text-on-lime"
          >
            See a sample parent report
          </Link>
        </Reveal>
        <Reveal index={1} step={0.1} className="min-w-0 flex-[1_1_420px] rounded-xl border border-[#26302A] bg-[#1B241F] p-6">
          <div className="text-sm text-[#9AA59E]">Week of Nov 2</div>
          <div className="mt-3.5 grid grid-cols-3 gap-3">
            <div>
              <div className="font-mono text-[26px] tabular-nums text-[#EEF1EC]">+0.12</div>
              <div className="text-[13px] text-[#9AA59E]">UTR this month</div>
            </div>
            <div>
              <div className="font-mono text-[26px] tabular-nums text-[#EEF1EC]">2</div>
              <div className="text-[13px] text-[#9AA59E]">coach replies</div>
            </div>
            <div>
              <div className="font-mono text-[26px] tabular-nums text-[#EEF1EC]">$1,840</div>
              <div className="text-[13px] text-[#9AA59E]">season spend</div>
            </div>
          </div>
          <div className="mt-4.5 border-t border-[#26302A] pt-4 text-sm text-[#B9C2BC]">
            Skipped 2 bad-fit events this fall · saved about $620
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------- METHOD + FOUNDER */

function MethodAndFounder() {
  return (
    <section id="how-fit-works" className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 px-6 py-20 lg:grid-cols-2">
      <Reveal className="rounded-xl border border-line bg-card p-7">
        <h2 className="m-0 text-2xl text-ink">How fit works</h2>
        <ol className="mt-4 list-decimal space-y-1 pl-5 leading-[1.7] text-stone">
          <li>We pull each roster&apos;s public UTRs and mark the date.</li>
          <li>
            We place you on that range and count seniors who graduate before
            you arrive.
          </li>
          <li>We add academics and your preferences.</li>
          <li>
            You get a band and a confidence level. We never show a percent
            chance.
          </li>
        </ol>
        <Link href="/methodology" className="mt-4 inline-block font-semibold text-grass hover:text-grass-700">
          Read the full methodology
        </Link>
      </Reveal>
      <Reveal index={1} step={0.08} className="rounded-xl border border-line bg-card p-7">
        <h2 className="m-0 text-2xl text-ink">Who built this</h2>
        <p className="mt-4 leading-[1.6] text-stone">
          I&apos;m a junior tennis player going through recruiting right now.
          I built Seeded because my family was tracking schools, tournaments
          and coach emails in five different places.
        </p>
        <p className="mt-3 font-semibold text-ink">Seeded&apos;s founder</p>
        <p className="mt-1 text-sm text-stone">
          Found a wrong number?{" "}
          <Link href="/contact" className="text-grass hover:text-grass-700">
            Report it
          </Link>{" "}
          and we fix it within 48 hours.
        </p>
      </Reveal>
    </section>
  );
}

/* ----------------------------------------------------------------- FAQ */

const FAQ_ITEMS = [
  {
    q: "How is this different from UTR's college tools?",
    a: "UTR shows where your rating sits. Seeded uses that to plan your season, judge tournaments and run coach outreach, and gives parents a shared view.",
  },
  { q: "Where does the roster data come from?" },
  { q: "My child is 14. Who owns the account?" },
  { q: "What does the free plan include?" },
] as const;

function Faq() {
  return (
    <section className="mx-auto max-w-[880px] px-6 pb-20 pt-6">
      <h2 className="m-0 mb-5 font-seeded text-[32px] font-bold text-ink">
        Questions parents ask
      </h2>
      <div className="border-t border-line">
        {FAQ_ITEMS.map((item) => (
          <details key={item.q} className="border-b border-line py-4.5">
            <summary className="cursor-pointer text-[17px] font-semibold">{item.q}</summary>
            {"a" in item && <p className="mt-2 leading-[1.6] text-stone">{item.a}</p>}
          </details>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ FINAL CTA */

function FinalCta() {
  return (
    <section className="bg-grass text-on-primary">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-6 py-16">
        <h2 className="m-0 max-w-[640px] font-seeded text-[36px] font-bold leading-[1.15]">
          Find out where you fit before your next tournament.
        </h2>
        <Link
          href="/onboarding"
          className="inline-flex min-h-[52px] items-center justify-center rounded-lg bg-lime-accent px-6 font-sans text-[15px] font-semibold text-on-lime"
        >
          Get my free fit report
        </Link>
      </div>
    </section>
  );
}

/* ---------------------------------------------------- HOMEPAGE FOOTER */

// Pixel-exact to Main.dc.html's own (minimal) footer — intentionally not the
// shared components/layout/footer.tsx, which every other marketing page
// still uses and which is out of scope for this pass.
function HomeFooter() {
  return (
    <footer className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-8 px-6 py-10 text-sm text-stone">
      <span>© {new Date().getFullYear()} Seeded</span>
      <span className="flex flex-wrap gap-5">
        <Link href="/methodology" className="hover:text-grass">
          Methodology
        </Link>
        <Link href="/how-it-works" className="hover:text-grass">
          About
        </Link>
        <Link href="/terms#privacy" className="hover:text-grass">
          Privacy (incl. minors)
        </Link>
        <Link href="/terms" className="hover:text-grass">
          Terms
        </Link>
        <Link href="/contact" className="hover:text-grass">
          Contact
        </Link>
      </span>
    </footer>
  );
}
