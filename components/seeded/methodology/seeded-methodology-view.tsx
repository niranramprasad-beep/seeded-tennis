import { FIT_BAND_RULE, FIT_RANGE_RULE, FitBadge, type FitBand } from "@/components/seeded/ui/fit-badge";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { seededButtonVariants } from "@/components/seeded/ui/button";
import { utrToPct } from "@/lib/school-fit";
import { SUPPORT_EMAIL } from "@/lib/config/contact";
import { cn } from "@/lib/utils";
import { TOURNAMENT_CHECKER_TOC, TournamentCheckerMethod } from "./tournament-checker-section";

// Illustrative example for the Team ranges section — not a live school, just
// the same low/median/high numbers the mockup shows, run through the real
// utrToPct() scale so the bar's fill/tick/dot positions are mathematically
// consistent with every other RangeBar in the app (not hand-picked percents).
const RANGE_EXAMPLE = { low: 8.8, median: 9.7, high: 10.6, you: 9.5 };

// Layout from Methodology.dc.html. The COPY is not the mockup's any more.
//
// The mockup documented a target-state system — per-player roster
// reliability, dated rosters, a players-leaving count, academics and
// preferences moving a band, a confidence level — and this page presented
// it in the present tense. Its opening sentence read "we compare your UTR to
// real, dated rosters, count who's graduating, add academics, and give you a
// band with a confidence level": four claims, none true of the code. Found
// in the 2026-11-15 overnight pass by reading the page against
// lib/school-fit.ts. Every sentence below now describes classifySchoolFit(),
// schoolUtrRange() and lib/fit.ts as they are. lib/copy-honesty.test.ts
// holds the phrasings that were removed.
const REPORT_ERROR_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  "Error on Seeded's methodology page"
)}`;

const TOC: { id: string; label: string }[] = [
  { id: "data-source", label: "Where the data comes from" },
  { id: "ratings-count", label: "Your rating" },
  { id: "team-ranges", label: "Team ranges" },
  { id: "players-leaving", label: "Players leaving" },
  { id: "fit-bands", label: "How fit is judged" },
  { id: "confidence", label: "Confidence" },
  { id: "what-we-cant-know", label: "What we can't know" },
  TOURNAMENT_CHECKER_TOC,
  { id: "fixing-mistakes", label: "Fixing mistakes" },
];

const DATA_SOURCE_ROWS: { label: string; body: string }[] = [
  // This table described a pipeline Seeded does not have. `School`
  // (lib/types.ts) stores a team's avgRosterUTR, minCompetitiveUTR and
  // usNewsRanking and nothing else — no roster rows, no per-player
  // ratings, no coach record, no source, no check date. The school pages
  // have said so all along ("Individual roster data isn't tracked yet",
  // "Coaching staff: Not tracked"); only this page claimed otherwise.
  {
    label: "Rosters",
    body:
      "Individual players aren't stored. For a hand-checked team, Seeded keeps the range worked out from its official roster (floor, middle, top), how many players are in each graduating class, the roster link and the date it was read. Every other team has a single estimated range and no check date.",
  },
  {
    label: "Coaches",
    // Each team page used to link a google.com/search URL. It now shows the
    // phrase to search for and links nowhere; saying so is still the
    // difference between "we looked it up" and "we hand you a search".
    body:
      "Not stored. Each team page gives you the exact phrase to search for to find that school's staff directory, rather than listing any coach or email, because we have none on file.",
  },
  // Was "...with the date we checked it." There is no check date: no
  // source field and no date field exists on `School`, every team range
  // renders as "Unverified estimate", and the Confidence section of THIS
  // PAGE says there is no published source or check date behind any of
  // them. The page was contradicting itself, and a visitor reads this row
  // as a statement of fact rather than of intent. Caught by widening
  // lib/copy-honesty.test.ts to scan for check-date claims.
  { label: "Ratings", body: "No individual player's rating is held — only each team's range: worked out from a hand-checked roster's reliable singles UTRs, or estimated." },
  { label: "Academics", body: "A U.S. News academic rank for the schools first entered in our catalogue (no edition year recorded; school pages leave it out where there is none), and, for hand-checked programs, cost of attendance, acceptance rate and undergraduate enrollment, each with its College Scorecard or school source and read date. None of it is part of your fit." },
];

// The legend's words are the pill's tooltip words (FIT_BAND_RULE in
// components/seeded/ui/fit-badge.tsx), worded to classifySchoolFit — one
// place, so the legend and the pills cannot drift apart.
const FIT_BAND_ROWS: FitBand[] = ["likely", "target", "reach", "out-of-range"];

export function SeededMethodologyView() {
  return (
    <div className="text-ink">
      {/* No bespoke header here any more: this page renders under the shared
          SeededNav like every other public page (see
          components/layout/app-shell.tsx). The old one had a logo and a CTA
          and no navigation, which left a visitor arriving from search with
          no way to reach Schools or Pricing. */}
      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-grass">
          Methodology
        </p>
        <h1 className="mt-3 max-w-[720px] font-seeded text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-ink">
          How Seeded decides which teams are realistic for you.
        </h1>
        <p className="mt-4 max-w-[720px] text-lg leading-[1.55] text-stone">
          Short version: we compare your UTR to each team&apos;s range and say plainly whether you have a
          realistic shot: Safe bet, Good match, Stretch or Long shot. Once you set a plan UTR, we judge you at that
          number for the summer before senior year; until you do, at our estimate for that summer, labelled as an
          estimate &mdash; and top D1 programs often decide earlier, during junior year.
          Some team ranges come from a hand check of the official roster, with the date; the rest are our
          estimates, and every range says which it is. We never show a percent chance, because nobody can know that.
        </p>

        <div className="mt-10 flex flex-wrap items-start gap-10 lg:flex-nowrap">
          <nav aria-label="On this page" className="w-full flex-none lg:sticky lg:top-6 lg:w-[220px]">
            <ol className="flex flex-col gap-3.5 text-[15px] text-ink">
              {TOC.map((item, i) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="inline-flex min-h-11 items-center hover:text-grass sm:min-h-6">
                    {i + 1}. {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0 max-w-[760px] flex-1">
            <Section id="data-source" number={1} title="Where the data comes from">
              <p className="text-stone">
                Each team has two numbers that decide how you fit: a floor and a middle. They come from one of two places.
                For a hand-checked team, a person read the program&apos;s official roster page and each listed
                player&apos;s public UTR profile, kept only reliable singles ratings, and recorded the date; the floor is
                the lower quartile of those ratings, the middle their median and the top the highest. Those schools
                say &ldquo;Roster checked&rdquo; with the date. Every other team has an estimated floor and average,
                entered by hand with no published source or check date, and labelled an estimate wherever it appears.
                We do not store individual players or coach records.
              </p>
              <div className="mt-4 rounded-card border border-line bg-card">
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

            <Section id="ratings-count" number={2} title="Your rating">
              <p className="text-stone">
                Your fit uses the UTR you enter yourself, the ratings you log over time, and the plan UTR you set. Seeded never fetches,
                checks or scrapes a rating from anywhere, so everything about you here is self-reported &mdash; and
                the coach emails Seeded drafts say so.
              </p>
              <p className="text-stone">
                <strong className="text-ink">Your plan UTR.</strong> You set one number: the UTR you&apos;re aiming
                for by the summer before senior year. Schools, Plan, Today and the tournament checker all use it, and
                changing it on one of them changes it on all of them. Seeded never sets it for you. Your plan shows the
                UTR you&apos;d need on the 1st of each quarter to get there on time, on a straight line from today, and
                one note comparing the pace that needs with your own pace so far. Once today&apos;s rating reaches
                your plan UTR, fit goes back to the estimate below until you set a higher one.
              </p>
              <p className="text-stone">
                With no plan UTR set, and until the summer before senior year, the rating that decides your fit is a
                projection to June 1 of that summer. If you&apos;ve logged a rating from about 5 to 13 months ago, it carries your own pace
                forward from that rating (the one closest to a year ago, otherwise the one closest to 6 months ago),
                but never faster than 1.5 UTR a year, capped near the top of college tennis and never below
                today&apos;s rating &mdash; a rating that went down is held where it is. Without one, it grows
                today&apos;s rating at our default assumption of 1.0 UTR a year, the same for everyone. The same rule
                runs before you sign up and after. It is
                labelled &ldquo;Estimate&rdquo; with its assumption wherever it&apos;s used, and on your fit report you
                can switch to today&apos;s rating instead. Once that summer has begun, it is simply today&apos;s rating.
                Top D1 programs often decide earlier, during junior year, so treat the projection as a ceiling on
                what the summer can show, not a promise.
              </p>
              <p className="text-stone">
                <strong className="text-ink">Why at most 1.5 a year.</strong> We plan with at most 1.5 UTR a year.
                That&apos;s our planning rule, not a measured average &mdash; Seeded has no data on how fast junior
                players improve. A few months of fast gains can be followed by a long flat stretch, so when your own
                pace is faster than 1.5 a year, the estimate uses the slower number. The same cap decides
                whether a team you&apos;re below is a Stretch or a Long shot. Your pace is shown one way everywhere:
                UTR gained a year since the rating that set it, to two decimals, like &ldquo;+1.45 a year&rdquo;.
              </p>
            </Section>

            <Section id="team-ranges" number={3} title="Team ranges">
              <p className="text-stone">
                The bar starts at the team&apos;s floor, and the tick is its middle. For a hand-checked team the top of
                the bar is its highest reliable rating. For an estimated team the top is not a number we have: it is
                drawn as far above the average as the floor is below it, so there is somewhere to show you landing.
                Your yellow dot is your rating.
              </p>
              <div className="mt-4 rounded-card border border-line bg-card p-[22px]">
                <RangeBar
                  rangeStartPct={utrToPct(RANGE_EXAMPLE.low)}
                  rangeEndPct={utrToPct(RANGE_EXAMPLE.high)}
                  medianPct={utrToPct(RANGE_EXAMPLE.median)}
                  youPct={utrToPct(RANGE_EXAMPLE.you)}
                  low={RANGE_EXAMPLE.low}
                  median={RANGE_EXAMPLE.median}
                  high={RANGE_EXAMPLE.high}
                  you={RANGE_EXAMPLE.you}
                />
                <div className="mt-2 flex items-center justify-between font-mono text-[13px] tabular-nums text-stone">
                  <span>low {RANGE_EXAMPLE.low.toFixed(1)}</span>
                  <span>average {RANGE_EXAMPLE.median.toFixed(1)}</span>
                  <span>high {RANGE_EXAMPLE.high.toFixed(1)}</span>
                </div>
              </div>
            </Section>

            <Section id="players-leaving" number={4} title="Players leaving">
              <p className="text-stone">
                Not tracked yet. Counting who graduates before you&apos;d arrive needs a player-by-player roster
                with class years, and Seeded doesn&apos;t have one for any program &mdash; so no Seeded screen
                shows a players-leaving number, and none of it feeds your fit. Even with rosters, seniors
                leaving would not equal places available: coaches also fill them with transfers and international
                players, and some are already promised to committed recruits.
              </p>
            </Section>

            <Section id="fit-bands" number={5} title="How fit is judged">
              <div className="rounded-card border border-line bg-card">
                {FIT_BAND_ROWS.map((band, i) => (
                  <div
                    key={band}
                    className={cn(
                      "grid grid-cols-[120px_minmax(0,1fr)] items-center gap-6 px-5 py-4",
                      i > 0 && "border-t border-line"
                    )}
                  >
                    <FitBadge band={band} className="justify-self-start" />
                    <span className="text-[15px] leading-[1.5] text-ink">{FIT_BAND_RULE[band]}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-stone">{FIT_RANGE_RULE}</p>
              <p className="mt-3 text-stone">
                Nothing else changes your fit. Players leaving, academics and your preferences are not tracked, so they
                don&apos;t factor in &mdash; each school page says so under &ldquo;Your chances here&rdquo;.
              </p>
            </Section>

            <Section id="confidence" number={6} title="Confidence">
              {/* P0-7: this described a three-level confidence model keyed on
                  roster verification dates. No roster has been verified and no
                  date is stored, so every school would be "Low" — describing
                  the model as if it were running overstated the data. State
                  where we actually are. */}
              <p className="text-stone">
                A hand-checked range carries its source and the date the roster was read; a range more
                than a year old stops deciding fit and says so. Every other team UTR range is an{" "}
                <strong className="text-ink">unverified estimate</strong>, with no published source or check
                date, labelled that way wherever it appears. Treat any range as a starting point for a
                conversation with a coach, not as a roster you can plan around.
              </p>
              <p className="mt-3 text-stone">
                Rosters change through the year. A checked range is a snapshot of the roster on its date, and
                schools are added as they are checked.
              </p>
            </Section>

            <Section id="what-we-cant-know" number={7} title="What we can't know">
              <p className="text-stone">
                A coach&apos;s private recruiting board, walk-on spots, injuries, scholarship money left, how much a
                coach values your style of play or your character. Seeded helps you aim. It can&apos;t promise a
                spot. Talk to coaches directly.
              </p>
            </Section>

            <Section id={TOURNAMENT_CHECKER_TOC.id} number={8} title={TOURNAMENT_CHECKER_TOC.label}>
              <TournamentCheckerMethod />
            </Section>

            <Section id="fixing-mistakes" number={9} title="Fixing mistakes" last>
              {/* P0-7: "within 48 hours" and "note the fix date on the page"
                  were both promises with nothing behind them — no ticketing,
                  no on-call, and no fix-date field on a school. */}
              <p className="text-stone">
                Every school page has a &quot;Report an error&quot; link. Reports go to a real
                person who reads them — there&apos;s no guaranteed turnaround, and I&apos;d
                rather say that than promise one I can&apos;t keep.
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
