"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/context/theme-context";
import { PlayerProvider } from "@/lib/context/player-context";
import { TierProvider } from "@/lib/context/tier-context";
import { GenderProvider } from "@/lib/context/gender-context";
import { SidebarProvider } from "@/lib/context/sidebar-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <PlayerProvider>
        <TierProvider>
          <GenderProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </GenderProvider>
        </TierProvider>
      </PlayerProvider>
    </ThemeProvider>
  );
}
