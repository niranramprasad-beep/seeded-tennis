"use client";

import { useState } from "react";
import useSWR from "swr";
import { UserPlus } from "lucide-react";
import {
  approveFamilyJoin,
  denyFamilyJoin,
  loadFamilyRoster,
  type FamilyRosterMember,
} from "@/lib/db/family-join";
import { SeededButton } from "@/components/seeded/ui/button";

// "[Name] wants to join your family as Parent" → Approve / Deny.
//
// Shown to APPROVED members only, on /today and /family. The roster RPC
// returns nothing to a pending member, so this renders empty for them by
// construction rather than by a client-side check (migrations 023 + 026).
//
// Renders nothing at all when there are no requests — this sits near the top
// of /today and must not take space on the overwhelming majority of days.

function sinceLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function JoinRequestsCard({ compact = false }: { compact?: boolean }) {
  const { data: roster = [], mutate } = useSWR<FamilyRosterMember[]>(
    "family-roster",
    () => loadFamilyRoster()
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Most-recently-nudged first, then oldest request — "Remind them" bumps
  // remindedAt, which is the only thing it does (it sends nothing).
  const pending = roster
    .filter((m) => m.status === "pending")
    .sort((a, b) => {
      const ar = a.remindedAt ? new Date(a.remindedAt).getTime() : 0;
      const br = b.remindedAt ? new Date(b.remindedAt).getTime() : 0;
      if (ar !== br) return br - ar;
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });

  if (pending.length === 0) return null;

  const act = async (
    userId: string,
    fn: (id: string) => Promise<string | null>
  ) => {
    setBusyId(userId);
    setError("");
    const message = await fn(userId);
    if (message) setError(message);
    await mutate();
    setBusyId(null);
  };

  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-grass" aria-hidden />
        <h2 className="text-lg font-semibold text-ink">
          {pending.length === 1 ? "Someone wants to join" : `${pending.length} people want to join`}
        </h2>
      </div>

      <div className="mt-4 space-y-3">
        {pending.map((m) => (
          <div
            key={m.userId}
            className="rounded-[14px] border border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] p-4"
          >
            <p className="font-semibold text-ink">
              {m.name} wants to join your family as {m.role === "parent" ? "Parent" : "Player"}
            </p>
            <p className="mt-1 text-sm text-stone">
              Asked {sinceLabel(m.joinedAt)}
              {m.remindedAt ? ` · nudged ${sinceLabel(m.remindedAt)}` : ""}
              {m.email && !compact ? ` · ${m.email}` : ""}
            </p>
            <p className="mt-1.5 text-xs text-stone">
              They can&rsquo;t see anything in your family until you approve.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SeededButton
                className="min-h-[38px]"
                disabled={busyId === m.userId}
                onClick={() => act(m.userId, approveFamilyJoin)}
              >
                {busyId === m.userId ? "Saving…" : "Approve"}
              </SeededButton>
              <SeededButton
                variant="secondary"
                className="min-h-[38px]"
                disabled={busyId === m.userId}
                onClick={() => act(m.userId, denyFamilyJoin)}
              >
                Deny
              </SeededButton>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="mt-3 rounded-lg bg-error-bg px-3 py-2 text-sm text-error">{error}</p>}
    </div>
  );
}
