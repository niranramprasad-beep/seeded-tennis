"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/lib/context/player-context";
import {
  PARENT_SETTINGS_SECTIONS,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "@/lib/settings-sections";

// Pixel-exact to "17 Settings + account.png": a left tab nav (Profile /
// Account / Family / Billing / Privacy + data) next to a content column.
//
// Every tab is a real route now (/settings/profile, /settings/account,
// /settings/family, /settings/billing, /settings/privacy — the one list is
// lib/settings-sections.ts). They used to be client-side tab state, with
// Billing the only URL; a section could not be linked to, bookmarked or
// reached with Back. The look is unchanged: same items, same classes, same
// frame. The "you are here" tab carries aria-current="page".
//
// P0-7: the mockup also has a "Notifications" tab. It's deliberately absent
// until Seeded can actually notify anyone — its toggles wrote to
// `user_settings` and nothing read them. POST-V1. Old links to it land on
// Profile (sectionFromLegacyLink).
export type SettingsTabId = SettingsSectionId;

export function SeededSettingsShell({
  active,
  children,
}: {
  active: SettingsSectionId;
  children: ReactNode;
}) {
  const { player } = usePlayer();
  const tabs = player.role === "parent" ? PARENT_SETTINGS_SECTIONS : SETTINGS_SECTIONS;
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <h1 className="font-seeded text-[30px] font-bold tracking-[-0.02em] text-ink">Settings</h1>
      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav aria-label="Settings sections" className="w-full shrink-0 lg:w-[208px]">
          <ul className="flex flex-col gap-1">
            {tabs.map((tab) => {
              const isActive = tab.id === active;
              return (
                <li key={tab.id}>
                  <Link
                    href={tab.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "block w-full rounded-xl px-4 py-2.5 text-left text-[15px] text-ink transition-colors",
                      isActive
                        ? "border border-line bg-card shadow-sm"
                        : "border border-transparent hover:bg-card/60"
                    )}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0 flex-1 space-y-4">{children}</div>
      </div>
    </div>
  );
}
