"use client";

import { formatUtrOrNotTracked } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LogOut, Palette, Users, User2 } from "lucide-react";
import type { SchoolLite } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { useDesign } from "@/lib/context/design-context";
import { getCurrentGrade } from "@/lib/time";
import { AuthGate } from "@/components/shared/auth-gate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SeededSettingsView } from "@/components/seeded/settings/seeded-settings-view";
import { ParentSettingsView } from "@/components/seeded/settings/parent-settings-view";
import { SettingsFamilySection } from "@/components/seeded/settings/settings-family-section";
import { FromOnboardingNote } from "@/components/seeded/settings/from-onboarding-note";
import { sectionForRole, type SettingsSectionId } from "@/lib/settings-sections";
import { ThemeSwitcher } from "./theme-switcher";
import { DesignSwitcher } from "./design-switcher";

const TIER_LABEL = { free: "Free", player: "Player", family: "Family" } as const;

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
  const { design } = useDesign();
  const { player } = usePlayer();
  // A parent's Settings is about the parent, in either design. Both player
  // views below render the PLAYER's facts (UTR, grade, class year, gender)
  // and the Seeded one an editable player-profile form — on an account whose
  // sidebar says read-only. See parent-settings-view.tsx. A parent has no
  // "account" section; theirs lands on Profile.
  const parentSection = sectionForRole(section, "parent") as Exclude<SettingsViewSection, "account">;
  if (player.role === "parent") return <ParentSettingsView section={parentSection} fromOnboarding={fromOnboarding} />;
  if (design === "seeded") {
    return <SeededSettingsView schools={schools} section={section} fromOnboarding={fromOnboarding} />;
  }
  // Legacy never had tabs. Its one page stays as it was for every section
  // except Family, which is where leaving and approving now live.
  if (section === "family") {
    return (
      <div className="mx-auto max-w-3xl container-px space-y-4 py-10">
        <SettingsFamilySection />
      </div>
    );
  }
  return (
    <>
      {fromOnboarding && (
        <div className="mx-auto max-w-3xl container-px pt-10">
          <FromOnboardingNote />
        </div>
      )}
      <LegacySettingsView />
    </>
  );
}

// The pre-redesign /settings content — unchanged, and still what Legacy
// users see. The pixel-exact-to-mockup tabbed layout above
// (SeededSettingsView) is Seeded-only; Legacy never had tabs, so there's
// nothing in this branch to share with it.
function LegacySettingsView() {
  const { player, signOut } = usePlayer();
  const { tier } = useTier();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (!player.familyCode) return;
    navigator.clipboard?.writeText(player.familyCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-3xl container-px py-10">
      <span className="eyebrow text-gold">Settings</span>
      <h1 className="mt-3 display-serif text-4xl text-ink sm:text-5xl">Make Seeded yours.</h1>

      {/* Appearance */}
      <Card className="mt-8 p-6">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-grass" />
          <h2 className="text-lg font-medium text-ink">Appearance</h2>
        </div>
        <p className="mt-1 text-sm text-stone">
          Legacy or Seeded design, saved across sessions.
        </p>
        <div className="mt-5">
          <DesignSwitcher />
        </div>
        <div className="mt-6 border-t-[0.5px] border-line pt-5">
          <p className="mb-3 text-sm text-stone">Pick a court mood for Legacy.</p>
          <ThemeSwitcher />
        </div>
      </Card>

      {/* Family */}
      <Card className="mt-4 p-6">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-grass" />
          <h2 className="text-lg font-medium text-ink">Family</h2>
        </div>
        <p className="mt-1 text-sm text-stone">
          Share this code so parents and siblings can follow the same player.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 rounded-card border-[0.5px] border-line bg-cream/50 px-4 py-3">
            <span className="font-mono text-xl tracking-wider text-grass">
              {player.familyCode ?? "—"}
            </span>
            {player.familyCode && (
              <button
                onClick={copyCode}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-grass-50 text-grass transition-colors hover:bg-grass-100"
                aria-label="Copy family code"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            )}
          </div>
          <Badge variant="default" size="md" className="capitalize">
            You're the {player.role}
          </Badge>
        </div>
      </Card>

      {/* Account */}
      <Card className="mt-4 p-6">
        <div className="flex items-center gap-2">
          <User2 className="h-4 w-4 text-grass" />
          <h2 className="text-lg font-medium text-ink">Account</h2>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label={player.role === "parent" ? "Account" : "Player"} value={player.name} />
          <Field label="Current UTR" value={formatUtrOrNotTracked(player.currentUTR)} />
          <Field label="Grade" value={`${getCurrentGrade(player.graduationYear)}th grade`} />
          <Field label="Class of" value={String(player.graduationYear)} />
          <Field label="Gender" value={player.gender === "female" ? "Female" : "Male"} />
          <Field label="Country" value={player.country} />
        </dl>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t-[0.5px] border-line pt-5">
          <div>
            <p className="text-sm text-stone">Current plan</p>
            <Badge variant={tier === "free" ? "outline" : "leaf"} size="md" className="mt-1">
              {TIER_LABEL[tier]}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {tier !== "free" && (
              <Button variant="outline" size="md" onClick={() => router.push("/settings/billing")}>
                Manage billing
              </Button>
            )}
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                signOut();
                router.push("/");
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border-[0.5px] border-line bg-cream/50 p-4">
      <dt className="text-xs text-stone-light">{label}</dt>
      <dd className="mt-1 font-medium text-ink">{value}</dd>
    </div>
  );
}
