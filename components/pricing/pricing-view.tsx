"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Minus, Sparkles } from "lucide-react";
import {
  FREE_TIER_TARGET_SCHOOL_LIMIT,
  TIER_RANK,
  formatTierPrice,
  yearlyAsMonthlyLabel,
  yearlyMonthsFree,
  type BillingInterval,
  type SubscriptionTier,
} from "@/lib/types";
import type { CatalogCounts } from "@/lib/db/schools";
import { seededCardHeading, seededCardLabel } from "@/components/seeded/ui/heading";
import { useTier } from "@/lib/context/tier-context";
import { usePlayer } from "@/lib/context/player-context";
import { getSupabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/shared/fade-in";
import { useDesign } from "@/lib/context/design-context";
import { cn } from "@/lib/utils";

interface Plan {
  tier: SubscriptionTier;
  name: string;
  tagline: string;
  highlights: string[];
  popular?: boolean;
}

// Price and cadence are DERIVED from lib/types' TIER_PRICE_USD, never typed
// in here. They used to be literal strings on each card, which is how
// "$19" ended up meaning Player on this page and Family in the webhook's
// GA4 reporting at the same time. One table, one source.
function priceLabel(tier: SubscriptionTier, interval: BillingInterval): string {
  if (tier === "free") return "$0";
  return formatTierPrice(tier, interval);
}

function cadenceLabel(tier: SubscriptionTier, interval: BillingInterval): string {
  if (tier === "free") return "forever";
  return interval === "yearly" ? "per year" : "per month";
}

// Counted from the catalogue and passed in from the server component, never
// typed into the copy — see getCatalogCounts() in lib/db/schools.ts for why.
function browseLine(c: CatalogCounts): string {
  return `Browse ${c.total} ${c.divisionLabel} programs — ${c.men} men's, ${c.women} women's`;
}

function plansFor(c: CatalogCounts): Plan[] {
  return [
  {
    tier: "free",
    name: "Free",
    tagline: "See where you fit.",
    // P0-7: this said "Browse all D1 tennis programs" / "Explore every
    // program". The catalog is a fraction of ~1,100 real D1 programs alone.
    // Quote the real number — and change the DATA (P1-DATA-1), not this
    // sentence, when that changes.
    highlights: [
      browseLine(c),
      "Team UTR estimates & academic rankings",
      `Track ${FREE_TIER_TARGET_SCHOOL_LIMIT} target schools`,
      "Full school detail pages",
    ],
  },
  {
    // P1-PRICE-1 (2026-11-11): coach outreach moved down from Family. It is
    // the core recruiting loop — gating it at the top tier put the product's
    // whole point behind the most expensive plan. Family is now genuinely
    // about the family (parent visibility + budget) rather than about
    // withholding the main feature.
    tier: "player",
    name: "Player",
    tagline: "Know what to do every week.",
    highlights: [
      "Everything in Free",
      "Unlimited target schools",
      "Coach outreach: drafts + pipeline tracking",
      "Personal year-by-year roadmap",
    ],
    popular: true,
  },
  {
    tier: "family",
    name: "Family",
    tagline: "For the parent who pays and wants to see progress.",
    highlights: [
      "Everything in Player",
      "Parent dashboard — read-only view of the plan",
      "Season budget parents control",
      "Weekly family report",
    ],
  },
  ];
}

interface Row {
  label: string;
  free: boolean;
  player: boolean;
  family: boolean;
}

function matrixFor(c: CatalogCounts): { group: string; rows: Row[] }[] {
  return [
  {
    group: "Discover",
    rows: [
      { label: browseLine(c), free: true, player: true, family: true },
      { label: "Team UTR estimates & rankings", free: true, player: true, family: true },
      { label: "School detail pages", free: true, player: true, family: true },
      { label: "Tournament fit checker", free: true, player: true, family: true },
      {
        // Free isn't "no targets" — it's a real, usable 3. Say the number.
        label: `Track target schools (${FREE_TIER_TARGET_SCHOOL_LIMIT} on Free, then unlimited)`,
        free: true,
        player: true,
        family: true,
      },
    ],
  },
  {
    group: "Plan",
    rows: [
      { label: "Personal roadmap", free: false, player: true, family: true },
      { label: "Year-by-year UTR targets", free: false, player: true, family: true },
      // Was "Weekly training plan". Seeded does not generate training plans
      // and is not going to — "No auto-generated training plans, manual
      // calendar only" is a non-negotiable in CLAUDE.md. What exists is a
      // calendar you fill in yourself, so that is what it is called.
      // lib/copy-honesty.test.ts fails the build if the old phrase returns.
      { label: "Training calendar", free: false, player: true, family: true },
      { label: "What-if school planner", free: false, player: true, family: true },
    ],
  },
  {
    // P1-PRICE-1: this whole group was family-only. Outreach is the core
    // recruiting loop and now sits in Player; only the parent-facing rows
    // stay in Family.
    group: "Recruit",
    rows: [
      { label: "Coach email drafts from your results", free: false, player: true, family: true },
      { label: "Outreach pipeline (researching → committed)", free: false, player: true, family: true },
      { label: "Follow-up reminders", free: false, player: true, family: true },
    ],
  },
  {
    group: "For parents",
    rows: [
      { label: "Parent dashboard (read-only)", free: false, player: false, family: true },
      { label: "Season budget", free: false, player: false, family: true },
      { label: "Weekly family report", free: false, player: false, family: true },
    ],
  },
  ];
}

async function getAccessToken(): Promise<string | undefined> {
  const supabase = getSupabase();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token;
}

export function PricingView({ counts }: { counts: CatalogCounts }) {
  const { design } = useDesign();
  const isSeeded = design === "seeded";
  const { tier } = useTier();
  const { isAuthed, hydrated } = usePlayer();
  const PLANS = useMemo(() => plansFor(counts), [counts]);
  const MATRIX = useMemo(() => matrixFor(counts), [counts]);
  const router = useRouter();
  const [loadingTier, setLoadingTier] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState("");
  // Yearly first, per docs/DESIGN_MOCKUP_SPEC.md. The saving is computed
  // from the prices (lib/types yearlyMonthsFree) rather than typed in: the
  // mockup's "2 months free" is wrong in the customer's favour at today's
  // prices, and a promise that understates is still a promise nobody
  // checked.
  const [interval, setInterval] = useState<BillingInterval>("yearly");

  // Only ever called for a genuine upgrade — the Free card's button is
  // always disabled (current or includedAlready), so there is no "switch to
  // Free" checkout path here; that happens on Whop's own membership page
  // via manageBilling() below.
  const choose = async (t: SubscriptionTier) => {
    // Signed-out visitors need an account first — nothing to bill yet.
    if (!hydrated || !isAuthed) {
      // Except on Free, where there is nothing to bill at all: the free
      // thing is the fit report, so take them to it instead of to a signup
      // form for a plan they already have by default.
      router.push(t === "free" ? "/onboarding" : "/signup");
      return;
    }

    setError("");
    setLoadingTier(t);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/whop/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tier: t, interval }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.url) throw new Error(payload.error || "Could not start checkout.");
      window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setLoadingTier(null);
    }
  };

  const manageBilling = () => {
    window.location.href = "https://whop.com/@me/settings/memberships/";
  };

  return (
    <div className="mx-auto max-w-content container-px py-14">
      <div className="mx-auto max-w-2xl text-center">
        <p className={cn("text-lg", isSeeded ? "font-seeded text-sm font-semibold uppercase tracking-[0.2em] text-stone" : "font-serif italic text-leaf-accent")}>
          Pricing
        </p>
        <h1
          className={cn(
            "mt-2 text-balance text-4xl sm:text-5xl",
            isSeeded ? "font-seeded font-semibold tracking-tight text-ink" : "font-light tracking-tight text-ink"
          )}
        >
          Your first fit report is free.{" "}
          <span className={isSeeded ? "seeded-gradient-text" : "serif-accent text-grass"}>
            Pay when you want a plan
          </span>
          .
        </h1>
        <p className="mx-auto mt-4 max-w-[640px] text-pretty text-[17px] text-stone">
          One skipped bad-fit tournament (entry plus travel) usually covers a year of Player.
        </p>
        {error && (
          <p className="mx-auto mt-4 max-w-md rounded-xl bg-error-bg px-4 py-3 text-sm text-error">
            {error}
          </p>
        )}
        {tier !== "free" && (
          <button
            onClick={manageBilling}
            disabled={loadingTier !== null}
            className="mt-4 text-sm text-stone underline decoration-stone-light underline-offset-4 transition-colors hover:text-ink"
          >
            Manage billing / cancel plan
          </button>
        )}
      </div>

      {/* Monthly / Yearly. A real control, not decoration: the interval is
          sent to /api/whop/checkout and decides which of the two Whop plans
          the person is charged on. */}
      <div className="mt-10 flex justify-center">
        <div
          role="radiogroup"
          aria-label="Billing interval"
          className="inline-flex rounded-pill border-[0.5px] border-line bg-card p-1"
        >
          {(["yearly", "monthly"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={interval === option}
              onClick={() => setInterval(option)}
              className={cn(
                "min-h-10 rounded-pill px-5 text-sm font-semibold transition-colors",
                interval === option
                  ? "bg-grass text-on-primary"
                  : "text-stone hover:text-ink"
              )}
            >
              {option === "monthly" ? "Monthly" : "Yearly"}
              {option === "yearly" && (
                <span className="ml-1.5 text-xs font-medium opacity-80">
                  · {yearlyMonthsFree()} months free
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* plan cards */}
      <div className="mt-8 grid items-start gap-5 lg:grid-cols-3">
        {PLANS.map((plan, i) => {
          // `tier` from useTier() is "free" for a signed-out visitor as well
          // as for a signed-in free user — it has no third state. So the
          // Free card badged itself "Current plan" and disabled its own
          // button for every stranger who had never heard of Seeded, which
          // is both wrong and the worst possible CTA on the page.
          //
          // "Current" is now gated on actually being signed in. While the
          // session is still hydrating nobody is "current" either, so the
          // card never flickers from a claim to a CTA.
          const signedIn = hydrated && isAuthed;
          const current = signedIn && tier === plan.tier;
          // Any plan ranked at or below what the user already has must
          // never be a live checkout target — clicking Player while already
          // on Family would start a brand-new Whop checkout for a tier
          // already exceeded. Only the exact current tier (badged above)
          // and genuine upgrades stay clickable; downgrading happens on
          // Whop's own membership page via the "Manage billing" link.
          const includedAlready = !current && TIER_RANK[plan.tier] < TIER_RANK[tier];
          // "Most popular" is a prompt to pick this plan — once it's the
          // user's actual plan, that prompt is both redundant and the thing
          // fighting the "Current" badge for the same top-right corner.
          const highlighted = plan.popular || current;
          return (
            <FadeIn key={plan.tier} delay={i * 0.08}>
            <Card
              className={cn(
                "relative flex h-full flex-col overflow-hidden p-7",
                // Spec: the Family card carries a 2px court border.
                plan.tier === "family" && "border-2 border-grass",
                highlighted
                  ? isSeeded
                    ? "border-0 pt-10 seeded-glass shadow-seeded-3"
                    : "border-2 border-grass pt-10 shadow-soft"
                  : isSeeded
                    ? "border-0 seeded-glass shadow-seeded-1"
                    : "border-[0.5px]"
              )}
              style={plan.popular && isSeeded ? { boxShadow: "var(--s-elevation-3), 0 0 60px rgb(var(--c-primary) / 0.25)" } : undefined}
            >
              {highlighted && (
                <Badge
                  size="md"
                  className={cn("absolute right-5 top-5", !isSeeded && "shadow-soft")}
                  style={isSeeded ? { background: "var(--s-accent-gradient)", color: "white" } : undefined}
                  variant={isSeeded ? undefined : "leaf"}
                >
                  {current ? (
                    "Current plan"
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Most popular
                    </>
                  )}
                </Badge>
              )}

              <h2 className={seededCardLabel}>{plan.name}</h2>
              <p className="mt-1 text-sm text-stone">{plan.tagline}</p>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="font-mono text-[40px] font-semibold leading-none tracking-tight text-ink tabular-nums">
                  {priceLabel(plan.tier, interval)}
                </span>
                <span className="text-sm text-stone-light">
                  {cadenceLabel(plan.tier, interval)}
                </span>
              </div>
              {plan.tier !== "free" && (
                <p className="mt-1 text-sm text-stone">
                  {interval === "yearly"
                    ? `About ${yearlyAsMonthlyLabel(plan.tier)} a month.`
                    : `Or ${formatTierPrice(plan.tier, "yearly")} a year.`}
                </p>
              )}

              <Button
                variant={plan.popular ? "primary" : "outline"}
                size="lg"
                className="mt-6 w-full"
                onClick={() => choose(plan.tier)}
                disabled={current || includedAlready || loadingTier === plan.tier}
              >
                {loadingTier === plan.tier
                  ? "Redirecting..."
                  : current
                    ? "Current plan"
                    : includedAlready
                      ? "Included in your plan"
                      : // A stranger on the Free card is not "choosing a
                        // plan", they are starting — and the fit report is
                        // the free thing, so send them to it rather than to
                        // a signup form with nothing behind it yet.
                        !signedIn && plan.tier === "free"
                        ? "Start free"
                        : `Choose ${plan.name}`}
              </Button>

              <ul className="mt-6 space-y-3 border-t-[0.5px] border-line pt-6">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-grass" />
                    <span className="text-ink">{h}</span>
                  </li>
                ))}
              </ul>
            </Card>
            </FadeIn>
          );
        })}
      </div>

      {/* Spec's footer line, with one sentence changed.
          The mockup reads "Cancel in two clicks. Accounts for players under
          18 are billed to a parent." The second half is not true — nothing
          in the product or in Whop checks who owns the card, and a
          16-year-old can pay with their own. Shipping it would be the exact
          pattern P0-7 spent a pass removing, so it says what IS true: an
          under-13 account needs a parent's consent before it works at all
          (migration 030), and that is enforced in the database.
          `lib/copy-honesty.test.ts` fails the build if the billing claim
          returns. */}
      <p className="mt-6 text-center text-sm text-stone">
        Cancel any time from your Whop account. Players under 13 need a parent or
        guardian to approve the account before it works.
      </p>

      <FadeIn className="mt-14">
        <div className="rounded-xl border border-line bg-subtle p-6 text-center">
          <h2 className={seededCardHeading}>
            What stays free, always
          </h2>
          <p className="mx-auto mt-2 max-w-[560px] text-pretty text-sm text-stone">
            Every school page, your first fit report, and{" "}
            <Link href="/methodology" className="text-grass underline underline-offset-2">
              our methodology
            </Link>
            . No card to see any of it.
          </p>
        </div>
      </FadeIn>

      {/* comparison table */}
      <FadeIn className="mt-16">
        <h2 className={cn(seededCardHeading, "text-center")}>
          Compare every feature
        </h2>
        {/* A 640px table in a 350px viewport scrolls horizontally, and a
            scrollable region that nothing can focus is unreachable by
            keyboard (axe: scrollable-region-focusable, /pricing at 375px).
            tabIndex + a group role and name make it a real stop that
            announces itself; `focus-visible` keeps it invisible to mouse
            users. docs/TODO.md flagged the 390px overflow separately — this
            is the keyboard half of it. */}
        <div
          className="mt-6 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grass/50"
          tabIndex={0}
          role="group"
          aria-label="Plan comparison table, scrolls horizontally"
        >
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className="w-2/5 py-4 text-left" scope="col">
                  <span className="sr-only">Feature</span>
                </th>
                {PLANS.map((p) => (
                  <th key={p.tier} className="px-4 py-4 text-center">
                    <span className="block font-medium text-ink">{p.name}</span>
                    <span className="text-xs text-stone-light">
                      {p.tier === "free"
                        ? "Free"
                        : `${priceLabel(p.tier, interval)}${interval === "yearly" ? "/yr" : "/mo"}`}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((section) => (
                <FeatureSection key={section.group} {...section} />
              ))}
            </tbody>
          </table>
        </div>
      </FadeIn>
    </div>
  );
}

function FeatureSection({ group, rows }: { group: string; rows: Row[] }) {
  return (
    <>
      <tr>
        <td
          colSpan={4}
          className="border-b-[0.5px] border-line pb-2 pt-6 text-xs font-medium uppercase tracking-[0.12em] text-stone-light"
        >
          {group}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.label} className="border-b-[0.5px] border-line">
          <td className="py-3 pr-4 text-sm text-ink">{row.label}</td>
          <Cell on={row.free} />
          <Cell on={row.player} />
          <Cell on={row.family} />
        </tr>
      ))}
    </>
  );
}

function Cell({ on }: { on: boolean }) {
  return (
    <td className="px-4 py-3 text-center">
      {on ? (
        <Check className="mx-auto h-4 w-4 text-grass" />
      ) : (
        <Minus className="mx-auto h-4 w-4 text-stone-light/50" />
      )}
    </td>
  );
}
