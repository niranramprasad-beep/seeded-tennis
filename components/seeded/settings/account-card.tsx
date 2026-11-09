"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { Player } from "@/lib/types";
import { getCurrentGrade } from "@/lib/time";
import { formatUTR } from "@/lib/utils";

// The mockup doesn't detail Account tab content beyond its nav label — this
// is the real identity data already available via usePlayer()/useTier(),
// not invented content: role, UTR, grade, class year, gender, country, and
// a real sign-out action. (This is the same data the pre-redesign settings
// page already showed in its one "Account" card.)
export function AccountCard({
  player,
  tierLabel,
  onSignOut,
}: {
  player: Player;
  tierLabel: string;
  onSignOut: () => void;
}) {
  const router = useRouter();

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold text-ink">Account</h2>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label={player.role === "parent" ? "Account" : "Player"} value={player.name || "—"} />
        <Field label="Current UTR" value={formatUTR(player.currentUTR)} />
        <Field label="Grade" value={`${getCurrentGrade(player.graduationYear)}th grade`} />
        <Field label="Class of" value={String(player.graduationYear)} />
        <Field label="Gender" value={player.gender === "female" ? "Female" : "Male"} />
        <Field label="Country" value={player.country} />
      </dl>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <div>
          <p className="text-sm text-stone">Current plan</p>
          <p className="mt-1 font-medium text-ink">{tierLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/settings/billing")}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#D6D3C8] bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-[#F1EFE8]"
          >
            Manage billing
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#D6D3C8] bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-[#F1EFE8]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-cream/50 p-4">
      <dt className="text-xs text-stone-light">{label}</dt>
      <dd className="mt-1 font-medium text-ink">{value}</dd>
    </div>
  );
}
