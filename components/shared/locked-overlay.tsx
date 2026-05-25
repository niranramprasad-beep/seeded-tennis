"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { SubscriptionTier } from "@/lib/types";
import { useTier } from "@/lib/context/tier-context";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface LockedOverlayProps {
  required: SubscriptionTier;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

const TIER_LABEL: Record<SubscriptionTier, string> = {
  free: "Free",
  player: "Player",
  family: "Family",
};

// Wraps a feature preview. If the active tier is high enough the children
// render normally; otherwise they're blurred behind an upgrade prompt.
export function LockedOverlay({
  required,
  title = "Unlock with Player",
  description = "Upgrade to see this feature.",
  children,
  className,
}: LockedOverlayProps) {
  const { canAccess, hydrated } = useTier();

  // Before hydration we optimistically show content to avoid a locked flash
  // for paying users; the gate re-applies once the stored tier loads.
  if (!hydrated || canAccess(required)) {
    return <>{children}</>;
  }

  return (
    <div className={cn("relative overflow-hidden rounded-card", className)}>
      <div className="pointer-events-none select-none blur-[6px] saturate-[0.85]">
        {children}
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-cream/55 px-6 text-center backdrop-blur-[2px]"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-grass text-cream shadow-soft">
          <Lock className="h-5 w-5" />
        </div>
        <Badge variant="leaf" size="md">
          {TIER_LABEL[required]} tier
        </Badge>
        <p className="max-w-xs text-balance text-base font-medium text-ink">
          {title}
        </p>
        <p className="max-w-xs text-pretty text-sm text-stone">{description}</p>
        <Link
          href="/pricing"
          className={cn(buttonVariants({ variant: "primary", size: "sm" }), "mt-1")}
        >
          See plans
        </Link>
      </motion.div>
    </div>
  );
}
