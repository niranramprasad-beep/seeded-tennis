"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Sparkles } from "lucide-react";
import { TIER_RANK, type SubscriptionTier } from "@/lib/types";
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
  price: string;
  cadence: string;
  tagline: string;
  highlights: string[];
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    tier: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "Explore the catalog and find your honest fit.",
    // P0-7: this said "Browse all D1 tennis programs" / "Explore every
    // program". The catalog is 68 programs (54 D1, 6 D2, 8 D3) against ~1,100
    // real D1 programs alone. Quote the real number — and change this copy
    // when the data changes (P1-DATA-1), not before.
    highlights: [
      "Browse 68 D1, D2 and D3 programs",
      "Team UTR estimates & academic rankings",
      "Minimum competitive UTRs",
      "Full school detail pages",
    ],
  },
  {
    tier: "player",
    name: "Player",
    price: "$19",
    cadence: "per month",
    tagline: "Your personal plan to close the gap.",
    highlights: [
      "Everything in Free",
      "Personal year-by-year roadmap",
      "Weekly training plan & calendar",
      "What-if school planner",
    ],
  },
  {
    tier: "family",
    name: "Family",
    price: "$39",
    cadence: "per month",
    tagline: "Everything the whole family needs to recruit.",
    highlights: [
      "Everything in Player",
      "Coach email generator",
      "Contacted-coach tracking",
      "Family dashboard for parents",
    ],
    popular: true,
  },
];

interface Row {
  label: string;
  free: boolean;
  player: boolean;
  family: boolean;
}

const MATRIX: { group: string; rows: Row[] }[] = [
  {
    group: "Discover",
    rows: [
      { label: "Browse 68 D1/D2/D3 programs", free: true, player: true, family: true },
      { label: "Team UTR estimates & rankings", free: true, player: true, family: true },
      { label: "School detail pages", free: true, player: true, family: true },
    ],
  },
  {
    group: "Plan",
    rows: [
      { label: "Personal roadmap", free: false, player: true, family: true },
      { label: "Year-by-year UTR targets", free: false, player: true, family: true },
      { label: "Weekly training plan", free: false, player: true, family: true },
      { label: "What-if school planner", free: false, player: true, family: true },
    ],
  },
  {
    group: "Recruit",
    rows: [
      { label: "Coach email generator", free: false, player: false, family: true },
      { label: "Contacted-coach tracking", free: false, player: false, family: true },
      { label: "Progress tracking", free: false, player: false, family: true },
      { label: "Family / parent dashboard", free: false, player: false, family: true },
    ],
  },
];

async function getAccessToken(): Promise<string | undefined> {
  const supabase = getSupabase();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token;
}

export function PricingView() {
  const { design } = useDesign();
  const isSeeded = design === "seeded";
  const { tier } = useTier();
  const { isAuthed, hydrated } = usePlayer();
  const router = useRouter();
  const [loadingTier, setLoadingTier] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState("");

  // Only ever called for a genuine upgrade — the Free card's button is
  // always disabled (current or includedAlready), so there is no "switch to
  // Free" checkout path here; that happens on Whop's own membership page
  // via manageBilling() below.
  const choose = async (t: SubscriptionTier) => {
    // Signed-out visitors need an account first — nothing to bill yet.
    if (!hydrated || !isAuthed) {
      router.push("/signup");
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
        body: JSON.stringify({ tier: t }),
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
          Start free. Upgrade when you're{" "}
          <span className={isSeeded ? "seeded-gradient-text" : "serif-accent text-grass"}>ready to commit</span>.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-pretty text-stone">
          Browsing schools is always free. Choose a plan to unlock your roadmap,
          training, and coach outreach.
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

      {/* plan cards */}
      <div className="mt-12 grid items-start gap-5 lg:grid-cols-3">
        {PLANS.map((plan, i) => {
          const current = tier === plan.tier;
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

              <h2 className={cn("text-xl font-medium text-ink", isSeeded && "font-seeded")}>{plan.name}</h2>
              <p className="mt-1 text-sm text-stone">{plan.tagline}</p>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className={cn("text-4xl tracking-tight text-ink", isSeeded ? "font-mono" : "font-light")}>
                  {plan.price}
                </span>
                <span className="text-sm text-stone-light">{plan.cadence}</span>
              </div>

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

      {/* comparison table */}
      <FadeIn className="mt-16">
        <h2 className="text-center text-2xl font-light tracking-tight text-ink">
          Compare every feature
        </h2>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className="w-2/5 py-4 text-left" />
                {PLANS.map((p) => (
                  <th key={p.tier} className="px-4 py-4 text-center">
                    <span className="block font-medium text-ink">{p.name}</span>
                    <span className="text-xs text-stone-light">
                      {p.price === "$0" ? "Free" : `${p.price}/mo`}
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
