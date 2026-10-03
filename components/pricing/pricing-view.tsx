"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Sparkles } from "lucide-react";
import type { SubscriptionTier } from "@/lib/types";
import { useTier } from "@/lib/context/tier-context";
import { usePlayer } from "@/lib/context/player-context";
import { getSupabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    tagline: "Explore every program and find your honest fit.",
    highlights: [
      "Browse all D1 tennis programs",
      "Roster UTRs & academic rankings",
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
      { label: "Browse all D1 schools", free: true, player: true, family: true },
      { label: "Roster UTRs & rankings", free: true, player: true, family: true },
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
  const { tier } = useTier();
  const { isAuthed, hydrated } = usePlayer();
  const router = useRouter();
  const [loadingTier, setLoadingTier] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState("");

  const choose = async (t: SubscriptionTier) => {
    // Signed-out visitors need an account first — nothing to bill yet.
    if (!hydrated || !isAuthed) {
      router.push("/signup");
      return;
    }

    if (t === "free") {
      // Downgrading an existing paid plan happens on Whop's own membership
      // page, not an instant local switch.
      manageBilling();
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
        <p className="font-serif text-lg italic text-leaf-accent">Pricing</p>
        <h1 className="mt-2 text-balance text-4xl font-light tracking-tight text-ink sm:text-5xl">
          Start free. Upgrade when you're{" "}
          <span className="serif-accent text-grass">ready to commit</span>.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-pretty text-stone">
          Browsing schools is always free. Choose a plan to unlock your roadmap,
          training, and coach outreach.
        </p>
        {error && (
          <p className="mx-auto mt-4 max-w-md rounded-xl bg-[#FBEAE5] px-4 py-3 text-sm text-[#9C3B22]">
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
        {PLANS.map((plan) => {
          const current = tier === plan.tier;
          return (
            <Card
              key={plan.tier}
              className={cn(
                "relative flex h-full flex-col overflow-hidden p-7",
                plan.popular
                  ? "border-2 border-grass pt-10 shadow-lift"
                  : "border-[0.5px]"
              )}
            >
              {plan.popular && (
                <Badge
                  variant="leaf"
                  size="md"
                  className="absolute right-5 top-5 shadow-soft"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Most popular
                </Badge>
              )}

              <div className="flex items-center justify-between">
                <h2 className="text-xl font-medium text-ink">{plan.name}</h2>
                {current && (
                  <Badge variant="default" size="sm">
                    Current
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-stone">{plan.tagline}</p>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-4xl font-light tracking-tight text-ink">
                  {plan.price}
                </span>
                <span className="text-sm text-stone-light">{plan.cadence}</span>
              </div>

              <Button
                variant={plan.popular ? "primary" : "outline"}
                size="lg"
                className="mt-6 w-full"
                onClick={() => choose(plan.tier)}
                disabled={current || loadingTier === plan.tier}
              >
                {loadingTier === plan.tier
                  ? "Redirecting..."
                  : current
                    ? "Current plan"
                    : plan.tier === "free"
                      ? "Switch to Free"
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
          );
        })}
      </div>

      {/* comparison table */}
      <div className="mt-16">
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
      </div>
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
