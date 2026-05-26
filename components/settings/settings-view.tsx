"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LogOut, Palette, Users, User2 } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { AuthGate } from "@/components/shared/auth-gate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "./theme-switcher";

const TIER_LABEL = { free: "Free", player: "Player", family: "Family" } as const;

export function SettingsView() {
  return (
    <AuthGate>
      <SettingsInner />
    </AuthGate>
  );
}

function SettingsInner() {
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
      <h1 className="display-serif mt-3 text-4xl text-ink sm:text-5xl">
        Make Seeded yours.
      </h1>

      {/* Appearance */}
      <Card className="mt-8 p-6">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-grass" />
          <h2 className="text-lg font-medium text-ink">Appearance</h2>
        </div>
        <p className="mt-1 text-sm text-stone">
          Pick a court mood. Your theme is saved across sessions.
        </p>
        <div className="mt-5">
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
                className="flex h-8 w-8 items-center justify-center rounded-full bg-grass-50 text-grass transition-colors hover:bg-grass-100"
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
          <Field label="Current UTR" value={player.currentUTR.toFixed(1)} />
          <Field label="Grade" value={`${player.grade}th grade`} />
          <Field label="Class of" value={String(player.graduationYear)} />
          <Field label="Gender" value={player.gender === "female" ? "Female" : "Male"} />
          <Field label="Country" value={player.country} />
        </dl>
        <div className="mt-5 flex items-center justify-between border-t-[0.5px] border-line pt-5">
          <div>
            <p className="text-sm text-stone">Current plan</p>
            <Badge variant={tier === "free" ? "outline" : "leaf"} size="md" className="mt-1">
              {TIER_LABEL[tier]}
            </Badge>
          </div>
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
