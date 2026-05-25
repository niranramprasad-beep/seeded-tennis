"use client";

import Link from "next/link";
import { Lock, Mail } from "lucide-react";
import { useTier } from "@/lib/context/tier-context";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Coach email generation is a Family-tier feature (see /pricing). Unlocked it
// links into the generator; locked it nudges to upgrade.
export function CoachEmailCTA({ slug }: { slug: string }) {
  const { canAccess, hydrated } = useTier();
  const unlocked = hydrated && canAccess("family");

  if (unlocked) {
    return (
      <Link
        href={`/coaches?school=${slug}`}
        className={cn(buttonVariants({ variant: "primary", size: "md" }), "w-full")}
      >
        <Mail className="h-4 w-4" />
        Generate email to coach
      </Link>
    );
  }

  return (
    <Link
      href="/pricing"
      className="group flex w-full items-center justify-center gap-2 rounded-pill border-[1.5px] border-dashed border-grass/30 bg-grass-50/50 px-6 py-3 text-sm font-medium text-grass transition-colors hover:border-grass hover:bg-grass-50"
    >
      <Lock className="h-4 w-4" />
      Generate email to coach
      <Badge variant="leaf" size="sm" className="ml-1">
        Family
      </Badge>
    </Link>
  );
}
