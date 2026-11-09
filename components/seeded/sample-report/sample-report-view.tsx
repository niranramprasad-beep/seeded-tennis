import Link from "next/link";
import type { ReactNode } from "react";
import { UtrVsPlanChart } from "@/components/seeded/dashboard/utr-vs-plan-chart";
import { SeededButton } from "@/components/seeded/ui/button";
import { DataChip } from "@/components/seeded/ui/data-chip";
import type { UtrDataPoint } from "@/lib/utr-projection";
import { cn } from "@/lib/utils";

// Pixel-exact to "12 Sample parent report.png" — the one page in this
// redesign where fabricated content is correct, not a violation (see the
// honesty discipline every other Seeded page follows: real data + honest
// empty states). This page's whole job is to show a prospective parent what
// the real weekly report looks like before any of their own data exists, so
// "Maya Chen" and every number below is deliberately invented, plausible
// example content — never wire this component to a real data source.
//
// The real, signed-in version of a weekly report is
// components/seeded/family/seeded-weekly-report-view.tsx (/family/weekly-
// reports) — intentionally a simpler real-data-only summary, not this
// richer mockup. Every reusable primitive this page can borrow from the
// real product, it does: UtrVsPlanChart (same component /today and /plan
// chart their real UTR history with), SeededButton, DataChip, and the exact
// one-off hex values already measured off this same mockup family for
// season-budget-card.tsx (#1F6B4A / #9CC8B0 / #C2643A) and
// needs-decision-card.tsx (#FBEDE6 / #F0CDBC bad-fit panel).
//
// Must stay reachable ONLY from the public marketing homepage's "See a
// sample parent report" link and the nav's "For parents" link — never
// from inside the authenticated app shell (see app-shell.tsx's
// hideSeededNav, which this route is added to, same as /onboarding and
// /methodology) — so a signed-in parent can never mistake this for their
// own data.

const EXAMPLE_ACTUAL_POINTS: UtrDataPoint[] = [
  { date: new Date(2026, 4, 4), utr: 9.06 },
  { date: new Date(2026, 5, 29), utr: 9.18 },
  { date: new Date(2026, 7, 10), utr: 9.24 },
  { date: new Date(2026, 9, 3), utr: 9.3 },
  { date: new Date(2026, 10, 3), utr: 9.42 },
];

const EXAMPLE_NEXT_CHECKPOINT = { date: new Date(2027, 5, 1), utr: 9.7 };

const SEGMENT_COLOR = {
  entries: "#1F6B4A",
  travel: "#9CC8B0",
  camps: "#C2643A",
};

const OUTREACH_ROWS: {
  school: string;
  status: string;
  chipLabel: string;
  chipClass: string;
}[] = [
  {
    school: "Richmond",
    status: "replied · asked for a video",
    chipLabel: "Maya replies by Nov 12",
    chipClass: "border-line bg-card text-stone",
  },
  {
    school: "Johns Hopkins",
    status: "invited to ID camp",
    chipLabel: "Camp $350 · Dec 14",
    chipClass: "border-line bg-card text-stone",
  },
  {
    school: "Middlebury",
    status: "no reply in 14 days",
    chipLabel: "Follow-up drafted",
    chipClass: "border-[#F0DCAD] bg-[#FFF4DC] text-[#7A5212]",
  },
  {
    school: "Emory",
    status: "now in range",
    chipLabel: "First email this week",
    chipClass: "border-grass-100 bg-grass-50 text-grass",
  },
];

const COMING_UP_ROWS: { day: string; label: string }[] = [
  { day: "Tue Nov 10", label: "Entry closes: L3 Richmond Winter" },
  { day: "Wed Nov 18", label: "Call with Mary Washington coach, 7pm" },
  { day: "Sat Nov 21", label: "L3 Richmond Winter (good fit)" },
];

function chip(className: string, children: ReactNode) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
        className
      )}
    >
      {children}
    </span>
  );
}

function StatTile({ value, label }: { value: string; label: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <p className="font-mono text-2xl font-bold text-ink">{value}</p>
      <p className="mt-1.5 text-sm text-stone">{label}</p>
    </div>
  );
}

export function SampleReportView() {
  return (
    <div className="text-ink">
      <header className="border-b border-line bg-cream">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="font-seeded text-xl font-bold text-ink">
              Seeded
            </Link>
            <DataChip status="estimated">Sample report · example family</DataChip>
          </div>
          <Link
            href="/onboarding"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-grass px-[18px] font-sans text-[15px] font-semibold text-on-primary hover:bg-grass-600"
          >
            Get my free fit report
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[760px] px-6 py-10">
        <p className="text-sm text-stone">Weekly parent report · Sunday, Nov 8</p>
        <h1 className="mt-1.5 font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">
          Maya had a good week. Her UTR is up, and Richmond replied.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-stone">
          She&rsquo;s on track for 6 of her 12 target schools. One thing needs a decision from you this week: the
          Bethesda L5 entry.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            value="9.42"
            label={
              <>
                UTR · <span className="font-semibold text-grass">+0.12</span> this month
              </>
            }
          />
          <StatTile value="3-1" label="Matches this week" />
          <StatTile value="2" label="Coach replies" />
          <StatTile value="$1,840" label="of $3,000 season budget" />
        </div>

        <div className="mt-5 rounded-xl border border-line bg-card p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-ink">UTR vs plan</h2>
            <span className="text-sm text-stone">Verified Nov 3</span>
          </div>
          <div className="mt-2.5">
            <UtrVsPlanChart
              actualPoints={EXAMPLE_ACTUAL_POINTS}
              nextCheckpoint={EXAMPLE_NEXT_CHECKPOINT}
              gender="female"
            />
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">Decision for you this week</h2>
          <div className="mt-3 rounded-[14px] border border-[#F0CDBC] bg-[#FBEDE6] p-4">
            <p className="font-semibold text-ink">Skip the L5 Bethesda Open (Nov 22)?</p>
            <p className="mt-1.5 text-sm text-stone">
              Expected field is 6.8, well below Maya. Wins there barely move her rating. Entry + travel ≈ $180. Two
              L3 events within 3 hours are a better fit.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2.5">
              {/* Illustrative only — this card describes a fictional decision for a
                  fictional family, so neither button has a real destination to send a
                  visitor to; they're styled exactly like the live product's buttons on
                  purpose, just inert here. */}
              <SeededButton type="button" variant="primary">
                See the comparison
              </SeededButton>
              <SeededButton type="button" variant="secondary">
                Talk it over with Maya
              </SeededButton>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">Coach outreach</h2>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {OUTREACH_ROWS.map((row) => (
              <li
                key={row.school}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <p className="text-sm text-ink">
                  <span className="font-semibold">{row.school}</span> · {row.status}
                </p>
                {chip(row.chipClass, row.chipLabel)}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">Season spending</h2>
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-pill bg-line">
            <div style={{ width: "17.3%", background: SEGMENT_COLOR.entries }} />
            <div style={{ width: "31.3%", background: SEGMENT_COLOR.travel }} />
            <div style={{ width: "12.7%", background: SEGMENT_COLOR.camps }} />
          </div>
          <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone">
            <span>
              <span
                aria-hidden
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: SEGMENT_COLOR.entries }}
              />
              Entries <span className="font-mono font-semibold text-ink">$520</span>
            </span>
            <span>
              <span
                aria-hidden
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: SEGMENT_COLOR.travel }}
              />
              Travel <span className="font-mono font-semibold text-ink">$940</span>
            </span>
            <span>
              <span
                aria-hidden
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: SEGMENT_COLOR.camps }}
              />
              Camps <span className="font-mono font-semibold text-ink">$380</span>
            </span>
            <span>Remaining <span className="font-mono font-semibold text-ink">$1,160</span></span>
          </p>
          <p className="mt-3 text-sm text-stone">Skipped 2 bad-fit events this fall · saved about $620.</p>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">Coming up</h2>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {COMING_UP_ROWS.map((row) => (
              <li key={row.day + row.label} className="flex gap-3 py-3 text-sm first:pt-0 last:pb-0">
                <span className="w-24 shrink-0 font-mono text-xs uppercase text-stone">{row.day}</span>
                <span className="text-ink">{row.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 text-center text-sm text-stone">
          <p>Sent every Sunday to parents on the Family plan. Maya sees the same report.</p>
          <p className="mt-1.5">
            <Link href="/pricing" className="font-semibold text-grass underline underline-offset-2">
              Change to monthly plan
            </Link>{" "}
            ·{" "}
            <Link href="/settings" className="font-semibold text-grass underline underline-offset-2">
              Email settings
            </Link>{" "}
            · Example data, not a real family.
          </p>
        </div>
      </div>
    </div>
  );
}
