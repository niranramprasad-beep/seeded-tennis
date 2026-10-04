"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { usePlayer } from "@/lib/context/player-context";
import { Button } from "@/components/ui/button";

// Pages a parent account can use. Everything else redirects to /family so
// parents never land in player-only tools like the roadmap or match mode.
// /family IS the parent dashboard — there is no separate /parent-dashboard route.
function isParentAllowedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/family") ||
    pathname === "/settings" ||
    pathname === "/cost-calculator" ||
    pathname === "/tournament-fit"
  );
}

// /family is parent-only content (it's framed as "Follow [player]'s climb" —
// wrong framing for the player themselves). Everything else a player can
// reach is either player-only or shared (schools, settings, etc.), so this
// is the one path that needs an explicit block in the other direction.
function isPlayerBlockedPath(pathname: string): boolean {
  return pathname.startsWith("/family");
}

// Client-side guard for app pages. Redirects to login when there's no session,
// and to onboarding when the session exists but the tennis profile is unfinished.
// When Supabase itself is unreachable, this never redirects to /login — an
// unreachable backend must never look like "you're signed out".
export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthed, hydrated, player, connectionError, retryConnection } = usePlayer();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!hydrated || connectionError) return;
    if (!isAuthed) {
      router.replace("/login");
    } else if (player.role === "parent" && !isParentAllowedPath(pathname)) {
      router.replace("/family");
    } else if (player.role !== "parent" && isPlayerBlockedPath(pathname)) {
      router.replace("/dashboard");
    } else if (player.role !== "parent" && !player.onboarded && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [hydrated, connectionError, isAuthed, player.onboarded, player.role, pathname, router]);

  if (hydrated && connectionError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-error-bg text-error">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-medium text-ink">
          We're having trouble connecting
        </h1>
        <p className="mt-2 max-w-sm text-sm text-stone">{connectionError}</p>
        <Button variant="outline" size="md" className="mt-5" onClick={retryConnection}>
          <RotateCw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  const blockedForOnboarding =
    player.role !== "parent" && !player.onboarded && pathname !== "/onboarding";
  const blockedForParent =
    player.role === "parent" && !isParentAllowedPath(pathname);
  const blockedForPlayer =
    player.role !== "parent" && isPlayerBlockedPath(pathname);

  if (!hydrated || !isAuthed || blockedForOnboarding || blockedForParent || blockedForPlayer) {
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

  return <>{children}</>;
}
