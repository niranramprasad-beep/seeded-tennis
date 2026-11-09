import Link from "next/link";
import { FitBadge, type FitBand } from "@/components/seeded/ui/fit-badge";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { seededButtonVariants } from "@/components/seeded/ui/button";
import { utrToPct } from "@/lib/school-fit";
import { cn } from "@/lib/utils";

// Illustrative example for the Team ranges section — not a live school, just
// the same low/median/high numbers the mockup shows, run through the real
// utrToPct() scale so the bar's fill/tick/dot positions are mathematically
// consistent with every other RangeBar in the app (not hand-picked percents).
const RANGE_EXAMPLE = { low: 8.8, median: 9.7, high: 10.6, you: 9.5 };

// Pixel-exact to Methodology.dc.html. Real policy copy, transcribed from the
// mockup — see the honesty-constraint comment at the top of
// lib/school-fit.ts for exactly which parts of this page describe behavior
// that's fully live today (the fit-band math) vs. the target-state system
// this page documents in full (per-player roster reliability, a real
// Confidence level, a real roster-verified date, a real players-leaving
// count) that the rest of the product doesn't fabricate yet — those show
// "Not tracked" on live school pages instead of a guess.
const REPORT_ERROR_HREF = `mailto:NiranRamprasad@gmail.com?subject=${encodeURIComponent(
  "Error on Seeded's methodology page"
)}`;

const TOC: { id: string; label: string }[] = [
  { id: "data-source", label: "Where the data comes from" },
  { id: "ratings-count", label: "Which ratings count" },
  { id: "team-ranges", label: "Team ranges" },
  { id: "players-leaving", label: "Players leaving" },
  { id: "fit-bands", label: "Fit bands" },
  { id: "confidence", label: "Confidence" },
  { id: "what-we-cant-know", label: "What we can't know" },
  { id: "fixing-mistakes", label: "Fixing mistakes" },
];

const DATA_SOURCE_ROWS: { label: string; body: string }[] = [
  {
    label: "Rosters",
    body: `Official athletics site, current season. If only last season's roster is listed, the team page shows the date we last checked it and links to the official roster, marked "Roster may be out of date."`,
  },
  { label: "Coaches", body: "Official staff page. We link to it instead of listing emails directly." },
  { label: "Ratings", body: "Singles and doubles UTR from each player's public profile, with the date we checked it." },
  { label: "Academics", body: `Public admissions ranges. Marked "Estimated" when exact numbers aren't published.` },
];

const RATING_CHIPS: { label: string; className: string }[] = [
  { label: "Counted: reliable rating", className: "bg-grass-50 text-grass border-grass-100" },
  { label: "Shown, not counted: stale or low reliability", className: "bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))] border-[rgb(var(--c-gold-tint-border))]" },
  { label: "Left out: on UTR but not on the official roster", className: "bg-card text-stone border-line border-dashed" },
];

const FIT_BAND_ROWS: { band: FitBand; body: string }[] = [
  { band: "likely", body: "Your UTR is at or above the team median." },
  { band: "target", body: "Your UTR is inside the team range, below the median." },
  { band: "reach", body: "Your UTR is below the range, but within reach by the summer before senior year at your current pace." },
  { band: "out-of-range", body: "The gap is bigger than your plan can close in time." },
];

export function SeededMethodologyView() {
  return (
    <div className="text-ink">
      <header className="border-b border-line bg-cream">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-[18px]">
          <Link href="/" className="font-seeded text-xl font-bold text-ink">
            Seeded
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-grass px-[18px] font-sans text-[15px] font-semibold text-on-primary hover:bg-grass-600"
          >
            Get my free fit report
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-grass">
          Methodology · Updated Nov 8, 2026
        </p>
        <h1 className="mt-3 max-w-[720px] font-seeded text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-ink">
          How Seeded decides which teams are realistic for you.
        </h1>
        <p className="mt-4 max-w-[720px] text-lg leading-[1.55] text-stone">
          Short version: we compare your UTR to real, dated rosters, count who&apos;s graduating, add academics, and
          give you a band with a confidence level. We never show a percent chance, because nobody can know that.
        </p>

        <div className="mt-10 flex flex-wrap items-start gap-10 lg:flex-nowrap">
          <nav aria-label="On this page" className="w-full flex-none lg:sticky lg:top-6 lg:w-[220px]">
            <ol className="flex flex-col gap-3.5 text-[15px] text-ink">
              {TOC.map((item, i) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="hover:text-grass">
                    {i + 1}. {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0 max-w-[760px] flex-1">
            <Section id="data-source" number={1} title="Where the data comes from">
              <p className="text-stone">
                Rosters and head coaches come from each school&apos;s official athletics website. Ratings come from
                public UTR profiles. Every team page shows the date we last checked it and links to the official
                roster.
              </p>
              <div className="mt-4 rounded-xl border border-line bg-card">
                {DATA_SOURCE_ROWS.map((row, i) => (
                  <div
                    key={row.label}
                    className={cn(
                      "grid grid-cols-[120px_minmax(0,1fr)] gap-6 px-5 py-4",
                      i > 0 && "border-t border-line"
                    )}
                  >
                    <strong className="text-[15px] text-ink">{row.label}</strong>
                    <span className="text-[15px] leading-[1.5] text-stone">{row.body}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[13px] text-stone-light">Seeded is independent and not affiliated with UTR Sports.</p>
            </Section>

            <Section id="ratings-count" number={2} title="Which ratings count">
              <p className="text-stone">
                Some ratings are shaky: too few recent matches, or not updated in months. We still show them, but
                leave them out of team averages.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {RATING_CHIPS.map((chip) => (
                  <span
                    key={chip.label}
                    className={cn(
                      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
                      chip.className
                    )}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            </Section>

            <Section id="team-ranges" number={3} title="Team ranges">
              <p className="text-stone">
                A team&apos;s range runs from its lowest to highest reliable rating. The tick in the middle is the
                median. Your yellow dot shows where you&apos;d land.
              </p>
              <div className="mt-4 rounded-xl border border-line bg-card p-[22px]">
                <RangeBar
                  rangeStartPct={utrToPct(RANGE_EXAMPLE.low)}
                  rangeEndPct={utrToPct(RANGE_EXAMPLE.high)}
                  medianPct={utrToPct(RANGE_EXAMPLE.median)}
                  youPct={utrToPct(RANGE_EXAMPLE.you)}
                />
                <div className="mt-2 flex items-center justify-between font-mono text-[13px] tabular-nums text-stone">
                  <span>low {RANGE_EXAMPLE.low.toFixed(1)}</span>
                  <span>median {RANGE_EXAMPLE.median.toFixed(1)}</span>
                  <span>high {RANGE_EXAMPLE.high.toFixed(1)}</span>
                </div>
              </div>
            </Section>

            <Section id="players-leaving" number={4} title="Players leaving">
              <p className="text-stone">
                We turn every class label into a graduation year, then count players who finish before you&apos;d
                arrive. We say &quot;2 seniors leave before you&apos;d arrive,&quot; not &quot;2 open spots.&quot;
                Coaches also fill spots with transfers and international players, and some spots are already
                promised to committed recruits.
              </p>
            </Section>

            <Section id="fit-bands" number={5} title="Fit bands">
              <div className="rounded-xl border border-line bg-card">
                {FIT_BAND_ROWS.map((row, i) => (
                  <div
                    key={row.band}
                    className={cn(
                      "grid grid-cols-[120px_minmax(0,1fr)] items-center gap-6 px-5 py-4",
                      i > 0 && "border-t border-line"
                    )}
                  >
                    <FitBadge band={row.band} />
                    <span className="text-[15px] leading-[1.5] text-ink">{row.body}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-stone">
                Players leaving, academics and your preferences can move a school up or down one band. Every school
                page lists exactly which factors did it.
              </p>
            </Section>

            <Section id="confidence" number={6} title="Confidence">
              <p className="text-stone">
                <strong className="text-ink">High:</strong> roster verified in the last 60 days and most players
                have reliable ratings. <strong className="text-ink">Medium:</strong> one of those is missing.{" "}
                <strong className="text-ink">Low:</strong> roster is old or most ratings are shaky. Low-confidence
                schools are labeled, never hidden.
              </p>
            </Section>

            <Section id="what-we-cant-know" number={7} title="What we can't know">
              <p className="text-stone">
                A coach&apos;s private recruiting board, walk-on spots, injuries, scholarship money left, how much a
                coach values your style of play or your character. Seeded helps you aim. It can&apos;t promise a
                spot. Talk to coaches directly.
              </p>
            </Section>

            <Section id="fixing-mistakes" number={8} title="Fixing mistakes" last>
              <p className="text-stone">
                Every school page has a &quot;Report an error&quot; link. We check reports within 48 hours and note
                the fix date on the page.
              </p>
              <a href={REPORT_ERROR_HREF} className={cn(seededButtonVariants({ variant: "secondary" }), "mt-4")}>
                Report an error
              </a>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  number,
  title,
  last = false,
  children,
}: {
  id: string;
  number: number;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-6", !last && "mb-12")}>
      <h2 className="font-seeded text-2xl font-bold text-ink">
        {number}. {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-[1.55]">{children}</div>
    </section>
  );
}
