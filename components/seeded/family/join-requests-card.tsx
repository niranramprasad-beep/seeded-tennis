"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { usePlayer } from "@/lib/context/player-context";
import { UserPlus } from "lucide-react";
import {
  approveFamilyJoin,
  denyFamilyJoin,
  grantParentConsent,
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
//
// P0-8 added a second thing this card does. When the person asking to join is
// under 13, approving them is also the moment parental consent is recorded
// (approve_family_join does both in one statement, migration 030), so the
// card has to say so BEFORE the button rather than after: an adult tapping
// Approve is making a statement about who they are, and they are entitled to
// read it first. It also says plainly that Seeded cannot verify any of it,
// because it cannot, and a product that implied otherwise would be claiming
// a safeguard it does not have.
//
// A second, separate row handles the case approval alone cannot: a member
// who is already approved into the family but whose consent is still
// outstanding — because another PLAYER approved them, and the database will
// not let one minor consent on behalf of another.

function sinceLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function JoinRequestsCard({ compact = false }: { compact?: boolean }) {
  // Consent is a parent's statement. grant_parent_consent() refuses anyone
  // whose role is not 'parent', and approve_family_join() records consent
  // only when a parent approves. This card used to offer a PLAYER — persona
  // (a), 14, looking at their own /today — an "I'm their parent — give
  // consent" button for an under-13 sibling, and an "Approve and consent"
  // button that would approve without consenting.
  const { player } = usePlayer();
  const viewerIsParent = player.role === "parent";
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

  // Approved into the family, still under 13 with no consent on file. Only
  // reachable when a non-parent member did the approving.
  const awaitingConsent = roster.filter(
    (m) => m.status === "approved" && m.consentStatus === "pending"
  );

  if (pending.length === 0 && awaitingConsent.length === 0) return null;

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
        {/* NOT "Needs a parent decision" — /family already has a card with
            that exact heading (bad-fit tournaments), and the spec's
            instruction is that approvals use the same card and chip
            LANGUAGE, not the same title. Two identically-titled cards on one
            page is worse than either name. */}
        <h2 className="text-lg font-semibold text-ink">
          {pending.length === 0
            ? "Waiting on a parent"
            : pending.length === 1
              ? "Someone wants to join"
              : `${pending.length} people want to join`}
        </h2>
      </div>

      <div className="mt-4 space-y-3">
        {/* Spec: the most urgent item gets the clay tint, the rest sit on the
            muted panel, so a stack of requests still has one focal point. */}
        {pending.map((m, i) => (
          <div
            key={m.userId}
            className={
              i === 0
                ? "rounded-[14px] border border-[rgb(var(--c-clay-tint-border))] bg-[rgb(var(--c-clay-tint-bg))] p-4"
                : "rounded-[14px] border border-line bg-subtle p-4"
            }
          >
            <p className="font-semibold text-ink">
              {m.name} wants to join your family as {m.role === "parent" ? "Parent" : "Player"}
            </p>
            <p className="mt-1 text-sm text-stone">
              Asked {sinceLabel(m.joinedAt)}
              {m.remindedAt ? ` · nudged ${sinceLabel(m.remindedAt)}` : ""}
              {m.email && !compact ? ` · ${m.email}` : ""}
            </p>
            {m.consentStatus === "pending" ? (
              <div className="mt-2.5 rounded-lg border border-line bg-card p-3">
                <p className="text-sm font-semibold text-ink">
                  {m.name.split(" ")[0]} is under 13
                </p>
                {viewerIsParent ? (
                  <p className="mt-1 text-sm text-stone">
                    Approving also records that you consent, as their parent or guardian, to
                    Seeded storing their information. Their account does nothing at all until
                    you do.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-stone">
                    You can approve them into the family, but their account does nothing until
                    a parent in the family also gives consent.
                  </p>
                )}
                <p className="mt-1.5 text-xs text-stone">
                  Seeded can&rsquo;t verify that anyone is an adult or this player&rsquo;s
                  parent.{viewerIsParent ? " Approving is you stating it." : ""}{" "}
                  <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
                    What we store
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-stone">
                They can&rsquo;t see anything in your family until you approve.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <SeededButton
                className="min-h-[38px]"
                disabled={busyId === m.userId}
                onClick={() => act(m.userId, approveFamilyJoin)}
              >
                {busyId === m.userId
                  ? "Saving…"
                  : m.consentStatus === "pending" && viewerIsParent
                    ? "Approve and consent"
                    : "Approve"}
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

      {awaitingConsent.length > 0 && (
        <div className="mt-3 space-y-3">
          {awaitingConsent.map((m) => (
            <div
              key={`consent-${m.userId}`}
              className="rounded-[14px] border border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] p-4"
            >
              <p className="font-semibold text-ink">
                {m.name} is in your family but still can&rsquo;t use Seeded
              </p>
              <p className="mt-1 text-sm text-stone">
                They&rsquo;re under 13, so a parent or guardian has to consent to Seeded
                storing their information. Until then their account reads nothing.
              </p>
              {viewerIsParent ? (
                <>
                  <p className="mt-1.5 text-xs text-stone">
                    Seeded can&rsquo;t verify that you are an adult or that you are this
                    player&rsquo;s parent. Giving consent is you stating it. Only a parent account
                    can do this.{" "}
                    <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
                      What we store
                    </Link>
                    .
                  </p>
                  <div className="mt-3">
                    <SeededButton
                      className="min-h-[38px]"
                      disabled={busyId === m.userId}
                      onClick={() => act(m.userId, grantParentConsent)}
                    >
                      {busyId === m.userId ? "Saving…" : "I'm their parent — give consent"}
                    </SeededButton>
                  </div>
                </>
              ) : (
                <p className="mt-1.5 text-sm text-stone">
                  Only a parent account can give it. Ask a parent in your family to open
                  Seeded &mdash; they&rsquo;ll see this on their Overview.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-3 rounded-lg bg-error-bg px-3 py-2 text-sm text-error">{error}</p>}
    </div>
  );
}
