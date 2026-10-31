"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { ThemeProvider } from "@/lib/context/theme-context";
import { PlayerProvider } from "@/lib/context/player-context";
import { TierProvider } from "@/lib/context/tier-context";
import { GenderProvider } from "@/lib/context/gender-context";
import { SidebarProvider } from "@/lib/context/sidebar-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        // Switching back to a tab you were just on should show the cached
        // data instantly, not refetch and flash a loading state — SWR's
        // cache (keyed per data type below) already covers "did this
        // change elsewhere," so refetching on every window refocus just
        // adds network traffic without a real freshness benefit here.
        revalidateOnFocus: false,
        // Re-requesting the same key within this window reuses the
        // in-flight/cached result instead of firing a second request —
        // covers rapid back-and-forth tab clicks.
        dedupingInterval: 5000,
      }}
    >
      <ThemeProvider>
        <PlayerProvider>
          <TierProvider>
            <GenderProvider>
              <SidebarProvider>{children}</SidebarProvider>
            </GenderProvider>
          </TierProvider>
        </PlayerProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}
