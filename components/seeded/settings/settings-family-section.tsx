"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { Check, Copy } from "lucide-react";
import { familyFullMessage } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import {
  approveFamilyJoin,
  cancelMyFamilyRequest,
  denyFamilyJoin,
  leaveFamily,
  loadFamilyRoster,
  loadMyFamilyCode,
  loadMyPendingFamilyRequest,
  ACCOUNT_HOLDER_CANNOT_LEAVE_MESSAGE,
  type FamilyRosterMember,
  type PendingFamilyRequest,
} from "@/lib/db/family-join";
import { loadMyBirthYear, loadMyUserId } from "@/lib/db/account";
import { parentConsentRequired } from "@/lib/config/consent";
import { approvalNeedsVerification } from "@/lib/email-verify-flow";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/email-verify-required";
import {
  familyCapCounts,
  familyCapLine,
  familyRoleIsFull,
  joinedLabel,
  leaveFamilyConsequences,
} from "@/lib/family-settings";
import { plural } from "@/lib/utils";
import { SeededButton } from "@/components/seeded/ui/button";
import { ConfirmDialog } from "@/components/seeded/ui/dialog";
import { VerifyEmailToApprove } from "@/components/auth/verify-email-prompt";

// Settings → Family (/settings/family), for both roles.
//
// Everything about OTHER people comes from family_members() (migrations 026,
// 037, 038, 044) through loadFamilyRoster() — never a `profiles` read, which
// RLS refuses across users anyway (037) and lib/db/family-scope.test.ts
// fails the build on. Every change goes through a SECURITY DEFINER RPC:
//
//   Approve  approve_family_join()  043: a PARENT must have proven their
//                                    email (42501 verify_email_required);
//                                    045: family_full_<role> past the cap.
//   Decline  deny_family_join()     never gated.
//   Leave    leave_family()         046: the caller only, never anyone
//                                    else; the account holder is refused.
//
// The cap line counts APPROVED members, like 045's family_member_count(),
// with the numbers from FAMILY_PLAN_MAX_* (lib/family-settings.ts).
//
// There is deliberately no "Remove" here. Removing another member is a
// /family decision with its own card; Settings is about YOUR membership.

// Every screen that shows the family reads one of these; all of them change
// when someone is approved, declined or leaves.
const FAMILY_KEYS = [
  "family-roster",
  "my-family-code",
  "family-members",
  "billing-family-members",
  "family-plan-status",
  "settings-family-pending",
  // 046 can reset an under-13 leaver's consent; AuthGate reads this key.
  "my-consent-state",
];

export function SettingsFamilySection() {
  const { player, setPlayerLocal } = usePlayer();
  const { data: myBirthYear } = useSWR("my-birth-year", loadMyBirthYear);
  const { tier } = useTier();
  const { mutate: mutateKey } = useSWRConfig();
  const viewerIsParent = player.role === "parent";

  const { data: familyCode } = useSWR<string | null>("my-family-code", () => loadMyFamilyCode());
  const { data: roster, error: rosterError } = useSWR<FamilyRosterMember[]>("family-roster", () => loadFamilyRoster());
  const { data: myId } = useSWR<string | null>("my-user-id", () => loadMyUserId());
  const { data: pendingRequest } = useSWR<PendingFamilyRequest | null>(
    familyCode === null ? "settings-family-pending" : null,
    () => loadMyPendingFamilyRequest()
  );

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // 043: asked BEFORE the click from Player.emailVerified, and again if the
  // database refuses anyway (the address changed in another tab). The
  // refusal's sentence stays on screen above the prompt — not swallowed.
  const [refusedForEmail, setRefusedForEmail] = useState(false);
  const verifyFirst = viewerIsParent && (refusedForEmail || approvalNeedsVerification(player));

  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [left, setLeft] = useState(false);

  const refreshAll = async () => {
    await Promise.all(FAMILY_KEYS.map((k) => mutateKey(k)));
  };

  const members = (roster ?? []).filter((m) => m.status === "approved");
  const pending = (roster ?? [])
    .filter((m) => m.status === "pending")
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
  const counts = familyCapCounts(roster ?? []);
  const me = members.find((m) => m.userId === myId);
  const iAmAccountHolder = Boolean(me?.isCreator);

  const act = async (userId: string, fn: (id: string) => Promise<string | null>) => {
    setBusyId(userId);
    setError("");
    const message = await fn(userId);
    if (message === VERIFY_EMAIL_REQUIRED_MESSAGE) setRefusedForEmail(true);
    if (message) setError(message);
    await refreshAll();
    setBusyId(null);
  };

  const doLeave = async () => {
    setLeaving(true);
    setLeaveError("");
    const result = await leaveFamily();
    setLeaving(false);
    if (!result.ok) {
      setLeaveError(result.message);
      return;
    }
    setConfirmLeave(false);
    setLeft(true);
    // 046 may have cleared this account's own profiles.family_code (the
    // pre-023 double-linked shape). Player.familyCode is the raw column and is
    // round-tripped on every profile save; leaving the old code in memory
    // would make the next save a refused privileged change (42501) until a
    // reload. The database is now authoritative: drop the local copy.
    setPlayerLocal({ familyCode: undefined });
    await refreshAll();
  };

  const loading = familyCode === undefined || (familyCode !== null && roster === undefined && !rosterError);

  if (loading) {
    return <div className="h-[220px] animate-pulse rounded-xl bg-line/50 motion-reduce:animate-none" aria-hidden />;
  }

  if (familyCode === null) {
    return (
      <section aria-labelledby="settings-family-heading" className="rounded-xl border border-line bg-card p-6">
        <h2 id="settings-family-heading" className="text-lg font-semibold text-ink">
          Family
        </h2>
        {left && (
          <p role="status" className="mt-2 text-sm text-grass">
            You left the family.
          </p>
        )}
        {pendingRequest ? (
          <PendingRequestNotice request={pendingRequest} onCancelled={refreshAll} />
        ) : (
          <p className="mt-2 text-sm text-stone">
            You&rsquo;re not in a family.{" "}
            {viewerIsParent ? (
              <>
                <Link href="/family" className="font-semibold text-grass underline underline-offset-2">
                  Join one with a family code
                </Link>
                .
              </>
            ) : (
              "A parent can share their family code with you."
            )}
          </p>
        )}
      </section>
    );
  }

  return (
    <>
      <section aria-labelledby="settings-family-heading" className="rounded-xl border border-line bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="settings-family-heading" className="text-lg font-semibold text-ink">
            Family
          </h2>
          <p className="text-sm text-stone" data-testid="family-cap-line">
            {familyCapLine(counts)}
          </p>
        </div>
        <FamilyCode code={familyCode} />

        {rosterError ? (
          <p role="alert" className="mt-4 text-sm text-error">
            Could not load your family. Refresh the page to try again.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-line border-t border-line" aria-label="Family members">
            {members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {m.name}
                    {m.userId === myId ? <span className="font-normal text-stone"> (you)</span> : null}
                  </p>
                  <p className="text-sm text-stone">
                    {[joinedLabel(m.joinedAt), m.isCreator ? "Account holder" : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="whitespace-nowrap rounded-pill border border-line px-2.5 py-1 text-xs font-semibold text-stone">
                  {m.role === "parent" ? "Parent" : "Player"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pending.length > 0 && (
        <section aria-labelledby="settings-family-requests" className="rounded-xl border border-line bg-card p-6">
          <h2 id="settings-family-requests" className="text-lg font-semibold text-ink">
            {plural(pending.length, "request", "requests")} to join
          </h2>
          <p className="mt-1 text-sm text-stone">
            They can&rsquo;t see anything in your family until someone approves them.
          </p>
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-error-bg px-3 py-2 text-sm text-error">
              {error}
            </p>
          )}
          {verifyFirst && <VerifyEmailToApprove />}
          <ul className="mt-4 space-y-3">
            {pending.map((m) => {
              const full = familyRoleIsFull(counts, m.role);
              return (
                <li key={m.userId} className="rounded-[14px] border border-line bg-subtle p-4">
                  <p className="font-semibold text-ink">
                    {m.name} wants to join as {m.role === "parent" ? "a parent" : "a player"}
                  </p>
                  <p className="mt-1 text-sm text-stone">{joinedLabel(m.joinedAt, "Asked")}</p>
                  {m.consentStatus === "pending" && (
                    <p className="mt-1.5 text-sm text-stone">
                      {m.name.split(" ")[0]} is under 13.{" "}
                      {viewerIsParent
                        ? "Approving also records that you consent, as their parent or guardian, to Seeded storing their information. Seeded can't verify that anyone is an adult — approving is you stating it."
                        : "You can approve them, but their account does nothing until a parent in the family also gives consent."}
                    </p>
                  )}
                  {full && <p className="mt-1.5 text-sm text-error">{familyFullMessage(m.role)}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!verifyFirst && !full && (
                      <SeededButton
                        className="min-h-11 sm:min-h-[38px]"
                        loading={busyId === m.userId}
                        disabled={busyId !== null}
                        onClick={() => act(m.userId, approveFamilyJoin)}
                      >
                        {m.consentStatus === "pending" && viewerIsParent ? "Approve and consent" : "Approve"}
                      </SeededButton>
                    )}
                    <SeededButton
                      variant="secondary"
                      className="min-h-11 sm:min-h-[38px]"
                      disabled={busyId !== null}
                      onClick={() => act(m.userId, denyFamilyJoin)}
                    >
                      Decline
                    </SeededButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="settings-family-leave" className="rounded-xl border border-line bg-card p-6">
        <h2 id="settings-family-leave" className="text-lg font-semibold text-ink">
          Leave family
        </h2>
        {iAmAccountHolder ? (
          <p className="mt-1 text-sm text-stone">{ACCOUNT_HOLDER_CANNOT_LEAVE_MESSAGE}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-stone">
              Leaving removes only you. Everyone else stays in the family.
            </p>
            <SeededButton
              variant="secondary"
              className="mt-4 border-error text-error hover:bg-error-bg"
              onClick={() => {
                setLeaveError("");
                setConfirmLeave(true);
              }}
            >
              Leave family
            </SeededButton>
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave this family?"
        description={
          <>
            <ul className="list-disc space-y-1 pl-5">
              {leaveFamilyConsequences({
                viewerPaysForFamily: tier === "family",
                viewerNeedsParentConsent: !viewerIsParent && parentConsentRequired(myBirthYear ?? null),
              }).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {leaveError && (
              <p role="alert" className="mt-3 rounded-lg bg-error-bg px-3 py-2 text-sm text-error">
                {leaveError}
              </p>
            )}
          </>
        }
        confirmLabel="Leave family"
        busy={leaving}
        onConfirm={() => void doLeave()}
        onCancel={() => setConfirmLeave(false)}
      />
    </>
  );
}

function FamilyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="mt-3">
      <p className="text-sm text-stone">
        Family code. Anyone who signs up with it waits until someone in the family approves them.
      </p>
      <div className="mt-2 flex w-fit items-center gap-3 rounded-lg border border-line bg-cream/50 px-4 py-2">
        <span className="font-mono text-lg tracking-wider text-grass">{code}</span>
        <button
          type="button"
          onClick={copy}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-grass-50 text-grass transition-colors hover:bg-grass-100"
          aria-label={copied ? "Family code copied" : "Copy family code"}
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

function PendingRequestNotice({
  request,
  onCancelled,
}: {
  request: PendingFamilyRequest;
  onCancelled: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancel = async () => {
    setBusy(true);
    setError("");
    const message = await cancelMyFamilyRequest();
    setBusy(false);
    if (message) setError(message);
    else await onCancelled();
  };
  return (
    <div className="mt-2">
      <p className="text-sm text-stone">
        Your request to join <span className="font-mono text-ink">{request.familyCode}</span> is waiting for{" "}
        {request.approverFirstName} to approve it.
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-error-bg px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}
      <SeededButton variant="secondary" className="mt-3" loading={busy} onClick={() => void cancel()}>
        Cancel request
      </SeededButton>
    </div>
  );
}
