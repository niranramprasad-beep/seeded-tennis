"use client";

import type { SchoolLite } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { AuthGate } from "@/components/shared/auth-gate";
import { SeededSettingsView } from "@/components/seeded/settings/seeded-settings-view";
import { ParentSettingsView } from "@/components/seeded/settings/parent-settings-view";
import { sectionForRole, type SettingsSectionId } from "@/lib/settings-sections";

/** Every section but Billing, which is its own view (SeededBillingView). */
export type SettingsViewSection = Exclude<SettingsSectionId, "billing">;

export function SettingsView({
  schools = [],
  section = "profile",
  fromOnboarding = false,
}: {
  schools?: SchoolLite[];
  section?: SettingsViewSection;
  /** /onboarding sent an already-onboarded account here (D2). */
  fromOnboarding?: boolean;
}) {
  return (
    <AuthGate>
      <SettingsInner schools={schools} section={section} fromOnboarding={fromOnboarding} />
    </AuthGate>
  );
}

function SettingsInner({
  schools,
  section,
  fromOnboarding,
}: {
  schools: SchoolLite[];
  section: SettingsViewSection;
  fromOnboarding: boolean;
}) {
  const { player } = usePlayer();
  // A parent's Settings is about the parent. The player view renders the
  // PLAYER's facts (UTR, grade, class year, gender) and an editable
  // player-profile form — on an account whose sidebar says read-only. See
  // parent-settings-view.tsx. A parent has no "account" section; theirs
  // lands on Profile.
  const parentSection = sectionForRole(section, "parent") as Exclude<SettingsViewSection, "account">;
  if (player.role === "parent") return <ParentSettingsView section={parentSection} fromOnboarding={fromOnboarding} />;
  return <SeededSettingsView schools={schools} section={section} fromOnboarding={fromOnboarding} />;
}
