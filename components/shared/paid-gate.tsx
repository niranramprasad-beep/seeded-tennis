"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { SubscriptionTier } from "@/lib/types";
import { useTier } from "@/lib/context/tier-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { FloatingDots } from "./floating-dots";
import { cn } from "@/lib/utils";

const TIER_LABEL: Record<SubscriptionTier, string> = {
  free: "Free",
  player: "Player",
  family: "Family",
};

const TIER_PRICE: Record<SubscriptionTier, string> = {
  free: "$0",
  player: "$19/mo",
  family: "$39/mo",
};

interface PaidGateProps {
  required: SubscriptionTier;
  feature: string;
  blurb: string;
  perks: string[];
  children: ReactNode;
}

export function PaidGate({
  required,
  feature,
  blurb,
  perks,
  children,
}: PaidGateProps) {
  const { canAccess, hydrated } = useTier();

  if (!hydrated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <motion.span
          className="h-8 w-8 rounded-full border-2 border-line border-t-grass"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  if (canAccess(required)) return <>{children}</>;

  return (
    <div className="relative overflow-hidden">
      <FloatingDots />
      <div className="relative mx-auto flex max-w-xl flex-col items-center px-5 py-20 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-grass text-cream shadow-soft">
          <Lock className="h-6 w-6" />
        </span>
        <Badge variant="leaf" size="md" className="mt-5">
          {TIER_LABEL[required]} tier · {TIER_PRICE[required]}
        </Badge>
        <h1 className="mt-4 text-balance text-3xl font-light tracking-tight text-ink sm:text-4xl">
          {feature} is a{" "}
          <span className="serif-accent text-grass">
            {TIER_LABEL[required]}
          </span>{" "}
          feature
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-stone">{blurb}</p>

        <Card className="mt-7 w-full p-6 text-left">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-stone-light">
            What you'll unlock
          </p>
          <ul className="mt-3 space-y-2.5">
            {perks.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-ink">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-leaf-accent" />
                {p}
              </li>
            ))}
          </ul>
        </Card>

        <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/pricing"
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            See plans
          </Link>
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Back to dashboard
          </Link>
        </div>

        <p className="mt-6 max-w-sm text-xs text-stone-light">
          Demo tip: use the{" "}
          <span className="font-medium text-stone">Demo tier</span> switcher in
          the top nav to preview this page unlocked.
        </p>
      </div>
    </div>
  );
}
