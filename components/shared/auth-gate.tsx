"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { usePlayer } from "@/lib/context/player-context";

// Pages a parent account can use. Everything else redirects to /family so
// parents never land in player-only tools like the roadmap or match mode.
function isParentAllowedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/family") ||
    pathname.startsWith("/parent-dashboard") ||
    pathname === "/settings" ||
    pathname === "/cost-calculator" ||
    pathname === "/tournament-fit"
  );
}

// Client-side guard for app pages. Redirects to login when there's no session,
// and to onboarding when the session exists but the tennis profile is unfinished.
export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthed, hydrated, player } = usePlayer();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthed) {
      router.replace("/login");
    } else if (player.role === "parent" && !isParentAllowedPath(pathname)) {
      router.replace("/family");
    } else if (player.role !== "parent" && !player.onboarded && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [hydrated, isAuthed, player.onboarded, player.role, pathname, router]);

  const blockedForOnboarding =
    player.role !== "parent" && !player.onboarded && pathname !== "/onboarding";
  const blockedForParent =
    player.role === "parent" && !isParentAllowedPath(pathname);

  if (!hydrated || !isAuthed || blockedForOnboarding || blockedForParent) {
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
