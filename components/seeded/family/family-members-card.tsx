"use client";

import { useState } from "react";
import useSWR from "swr";
import { loadFamilyRoster, removeFamilyMember, type FamilyRosterMember } from "@/lib/db/family-join";
import { cn } from "@/lib/utils";

// The family roster, with role and status.
//
// Reads family_members() (migration 026) rather than selecting `profiles`
// by family_code. That used to work because everyone in a family carried
// the code on their own profile — which is exactly the self-assignment P0-2
// closed. Joiners are now linked through parent_accounts and have a NULL
// family_code, so a profiles-only query silently omitted every parent.
//
// "Account holder" is the member who belongs via their own profile, i.e.
// whoever created the family. That is a real fact now (is_creator from the
// RPC), not the earlier inference from whichever profiles row was oldest.

export function FamilyMembersCard({ familyCode }: { familyCode: string | undefined }) {
  const { data: members = [], mutate } = useSWR<FamilyRosterMember[]>(
    "family-roster",
    () => loadFamilyRoster()
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const remove = async (userId: string) => {
    setBusyId(userId);
    setError("");
    const message = await removeFamilyMember(userId);
    if (message) setError(message);
    await mutate();
    setBusyId(null);
  };

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold text-ink">Family members</h2>

      <div className="mt-4 space-y-3">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block truncate text-ink">{m.name}</span>
              {m.status === "pending" ? (
                <span className="text-xs text-stone">Waiting to be approved</span>
              ) : m.consentStatus === "pending" ? (
                /* P0-8: approved into the family, but under 13 with no
                   parental consent recorded, so their account still reads
                   nothing. Two different kinds of "waiting", and showing one
                   label for both would leave a parent wondering why an
                   approved child still sees an empty app. The consent button
                   itself lives on JoinRequestsCard. */
                <span className="text-xs text-stone">Under 13 — waiting for a parent&rsquo;s consent</span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
                  m.status === "pending"
                    ? "border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]"
                    : "border-line bg-card text-stone"
                )}
              >
                {m.role === "player" ? "Player" : "Parent"}
                {m.isCreator ? " · account holder" : ""}
                {m.status === "pending"
                  ? " · pending"
                  : m.consentStatus === "pending"
                    ? " · needs consent"
                    : ""}
              </span>
              {/* The account holder belongs via their own profile, and 022
                  forbids changing that from the client — so there is
                  deliberately no way to evict them here. */}
              {!m.isCreator && (
                <button
                  type="button"
                  onClick={() => remove(m.userId)}
                  disabled={busyId === m.userId}
                  className="whitespace-nowrap text-xs font-semibold text-stone underline underline-offset-2 hover:text-error disabled:opacity-50"
                >
                  {busyId === m.userId ? "…" : "Remove"}
                </button>
              )}
            </div>
          </div>
        ))}
        {members.length === 0 && <p className="text-sm text-stone">No family members yet.</p>}
      </div>

      {error && <p className="mt-3 rounded-lg bg-error-bg px-3 py-2 text-sm text-error">{error}</p>}

      {familyCode && (
        /* Spec: dashed #D6D3C8 border, #FBFAF7 (muted panel) background,
           the code in mono bold. */
        <div className="mt-4 rounded-[12px] border border-dashed border-input bg-subtle p-3.5 text-sm">
          <span className="text-stone">Invite another parent with code</span>
          <p className="mt-1 select-all font-mono text-base font-bold tracking-wider text-ink">
            {familyCode}
          </p>
          <p className="mt-1.5 text-xs text-stone">
            They&rsquo;ll appear here as pending until someone approves them.
          </p>
        </div>
      )}
    </div>
  );
}
