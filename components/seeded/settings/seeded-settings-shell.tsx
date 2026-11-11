"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Pixel-exact to "17 Settings + account.png": a left tab nav (Profile /
// Account / Family / Billing / Privacy + data) next to a content column.
// Billing is the one real route among the tabs — everything else is
// client-side tab state owned by the caller, so this shell stays a dumb,
// reusable shape: /settings renders it with its client tabs, and
// /settings/billing renders the SAME shell with active="billing" so the two
// pages share one visual frame instead of each re-implementing this nav.
//
// P0-7: the mockup also has a "Notifications" tab. It's deliberately absent
// until Seeded can actually notify anyone — its toggles wrote to
// `user_settings` and nothing read them. The id stays in the union so
// existing persisted/linked state doesn't crash the shell; it simply renders
// no tab and no panel. POST-V1.
export type SettingsTabId = "profile" | "account" | "family" | "notifications" | "billing" | "privacy";

export const SETTINGS_TABS: { id: SettingsTabId; label: string; href?: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "account", label: "Account" },
  { id: "family", label: "Family" },
  { id: "billing", label: "Billing", href: "/settings/billing" },
  { id: "privacy", label: "Privacy + data" },
];

export function SeededSettingsShell({
  active,
  onTabChange,
  children,
}: {
  active: SettingsTabId;
  onTabChange: (id: SettingsTabId) => void;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <h1 className="font-seeded text-[30px] font-bold tracking-[-0.02em] text-ink">Settings</h1>
      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav aria-label="Settings sections" className="w-full shrink-0 lg:w-[208px]">
          <ul className="flex flex-col gap-1">
            {SETTINGS_TABS.map((tab) => {
              const isActive = tab.id === active;
              const itemClass = cn(
                "block w-full rounded-xl px-4 py-2.5 text-left text-[15px] text-ink transition-colors",
                isActive
                  ? "border border-line bg-card shadow-sm"
                  : "border border-transparent hover:bg-card/60"
              );
              return (
                <li key={tab.id}>
                  {tab.href ? (
                    <Link href={tab.href} className={itemClass}>
                      {tab.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onTabChange(tab.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={itemClass}
                    >
                      {tab.label}
                    </button>
                  )}
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
