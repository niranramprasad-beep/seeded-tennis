import Link from "next/link";
import { utrChange } from "@/lib/utr-percent";
import { ChangeFigure } from "@/components/seeded/ui/change-figure";
import { ArrowLeft } from "lucide-react";
import { SeededMark } from "@/components/seeded/icons";
import type { ReactNode } from "react";
import { DataChip } from "@/components/seeded/ui/data-chip";
import { SampleReportCta } from "./sample-report-cta";
import { cn } from "@/lib/utils";

// 2026-11-15 overnight: REWRITTEN TO MATCH THE REAL REPORT. This page sold
// a richer report than exists — a coach "invited to ID camp" (no such data
// model), a dated coach call, an "entry closes" deadline, a reply-by date,
// "two L3 events within 3 hours are a better fit" (no alternatives feature),
// "the player sees the same one" (players cannot open /family) and "doesn't
// email it — not yet". Every section below now mirrors a section of
// /family/weekly-reports or /family, in the words those pages use; only the
// example family and its numbers are invented, and the page says so.
//
// Originally pixel-exact to "12 Sample parent report.png" — the one page in this
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
// chart their real UTR history with), SeededButton, DataChip, and the same
// --c-primary/--c-primary-300/--c-leaf segment colors season-budget-card.tsx
// uses for its chart (see that file's comment — these track light/dark mode
// instead of hardcoding the light-mode hex).
//
// Must stay reachable ONLY from the public marketing homepage's "See a
// sample parent report" link and the nav's "For parents" link — never
// from inside the authenticated app shell (see app-shell.tsx's
// hideSeededNav, which this route is added to, same as /onboarding and
// /methodology) — so a signed-in parent can never mistake this for their
// own data.

const SEGMENT_COLOR = {
  entries: "rgb(var(--c-primary))",
  travel: "rgb(var(--c-primary-300))",
  camps: "rgb(var(--c-leaf))",
};

// /family/weekly-reports "Coach activity this week": schools whose outreach
// status changed in the last 7 days, with the status the player set.
const ACTIVITY_ROWS: { school: string; status: string }[] = [
  { school: "Richmond", status: "Replied" },
  { school: "Emory", status: "Emailed" },
];

// /family/weekly-reports "Upcoming events": tournaments the player saved or
// entered, name and date. That is all the real list shows.
const UPCOMING_ROWS: { day: string; label: string }[] = [
  { day: "Sat Nov 21", label: "L3 Richmond Winter Open" },
  { day: "Sat Dec 12", label: "L4 Fairfax Holiday Classic" },
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

// Example values only (the page says so). The same week the landing page's
// parent card shows.
const SAMPLE_WEEK_CHANGE = utrChange(9.3, 9.42)!;

function StatTile({ value, label }: { value: string; label: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-card p-5">
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
            {/* min-h-11 (44px): a phone tap target. The CTA beside it is
                already 44px, so the header height does not change. */}
            <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-seeded text-xl font-bold text-ink">
              <SeededMark size={22} />
              Seeded
            </Link>
            <DataChip status="estimated">Sample report · example family</DataChip>
          </div>
          {/* 22 Nov consult: visitors landed here with "no header" and no way
              back. The page keeps its own standalone header on purpose
              (app-shell.tsx), so the way back lives here. */}
          <Link
            href="/"
            className="order-last inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold text-grass underline-offset-4 hover:underline sm:order-none sm:ml-auto sm:mr-3"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to Seeded
          </Link>
          <SampleReportCta />
        </div>
      </header>

      <div className="mx-auto max-w-[760px] px-6 py-10">
        <p className="text-sm text-stone">Weekly parent report · example</p>
        <h1 className="mt-1.5 font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">
          Maya&rsquo;s week
        </h1>
        <p className="mt-3 text-base leading-relaxed text-stone">
          Example activity for Nov 2 – Nov 8. On her Overview: on track for 6 of 12 targets.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            value="9.42"
            label={
              <>
                {/* The example's week: 9.30 → 9.42. Percent leads, the raw
                    change beside it, through the one helper real reports use. */}
                UTR · <ChangeFigure className="text-grass" {...SAMPLE_WEEK_CHANGE} /> this week
              </>
            }
          />
          <StatTile value="1" label="coaches emailed this week" />
          <StatTile value="1" label="coaches replied this week" />
          <StatTile value="$1,840" label="spent so far · 2026–27 season" />
        </div>

        <div className="mt-5 rounded-card border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">Needs a parent decision</h2>
          <div className="mt-3 rounded-[14px] border border-[rgb(var(--c-clay-tint-border))] bg-[rgb(var(--c-clay-tint-bg))] p-4">
            <p className="font-semibold text-ink">Skip L5 Bethesda Open (Nov 22)?</p>
            <p className="mt-1.5 text-sm text-stone">Field too weak. Saves about $180.</p>
            <p className="mt-1.5 text-sm text-stone">
              Shown for a tournament Maya saved but hasn&rsquo;t entered, when the tournament checker scores it
              a bad fit for her rating.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-card border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">Coach activity this week</h2>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {ACTIVITY_ROWS.map((row) => (
              <li
                key={row.school}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <p className="text-sm font-semibold text-ink">{row.school}</p>
                {chip("border-line bg-card text-stone", row.status)}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 rounded-card border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">Season budget · 2026–27 season</h2>
          <p className="mt-1.5 text-sm text-stone">
            <span className="font-mono font-semibold text-ink">$1,840</span> spent of $3,000
          </p>
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
          </p>
          <p className="mt-3 text-sm text-stone">
            Expenses are what you add yourself; tournament costs come from the events Maya entered.
          </p>
        </div>

        <div className="mt-5 rounded-card border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">Upcoming events</h2>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {UPCOMING_ROWS.map((row) => (
              <li key={row.day + row.label} className="flex gap-3 py-3 text-sm first:pt-0 last:pb-0">
                <span className="w-24 shrink-0 font-mono text-xs uppercase text-stone">{row.day}</span>
                <span className="text-ink">{row.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 text-center text-sm text-stone">
          {/* P0-7: was "Sent every Sunday to parents on the Family plan" with
              an "Email settings" link. Seeded sends no email — this report is
              a page parents open at /family/weekly-reports. The emailed
              version is POST-V1, and the notifications settings tab it linked
              to is hidden until then. */}
          <p>
            Parents on the Family plan can open this report any time from their Overview. Seeded
            doesn&rsquo;t email it.
          </p>
          <p className="mt-1.5">
            <Link href="/pricing" className="font-semibold text-grass underline underline-offset-2">
              See plans
            </Link>{" "}
            · Example data, not a real family.
          </p>
        </div>
      </div>
    </div>
  );
}
