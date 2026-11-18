"use client";

import { plural } from "@/lib/utils";
import { useState } from "react";
import { Clock } from "lucide-react";
import {
  cancelMyFamilyRequest,
  joinFamily,
  remindFamilyApproval,
  type PendingFamilyRequest,
} from "@/lib/db/family-join";
import { SeededButton } from "@/components/seeded/ui/button";

// What a joiner sees while they wait.
//
// A pending member can read nothing through RLS, so everything here comes
// from my_pending_family_request(), which discloses a FIRST NAME and nothing
// else — see the note at the top of migration 026.
//
// "Remind them" is deliberately not called "Send a reminder". Seeded has no
// email and no push; the RPC bumps a timestamp so the request sorts to the
// top of the approver's card next time they open the app. The copy says
// exactly that, because promising a notification we cannot send is the
// pattern P0-7 spent a whole pass removing.

function sinceLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${plural(mins, "minute", "minutes")} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${plural(hours, "hour", "hours")} ago`;
  return `${plural(Math.round(hours / 24), "day", "days")} ago`;
}

export function FamilyPendingScreen({
  request,
  onChanged,
}: {
  request: PendingFamilyRequest;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [reentering, setReentering] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");

  const remind = async () => {
    setBusy(true);
    setNote("");
    const result = await remindFamilyApproval();
    setNote(
      result.ok
        ? "Done — their request list will show yours at the top."
        : result.message ?? "Could not do that right now."
    );
    setBusy(false);
    onChanged();
  };

  const submitNewCode = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setCodeError("Enter the family code.");
      return;
    }
    setBusy(true);
    setCodeError("");
    // Clear the old pending row first — join_family() reports `already`
    // for an existing request rather than replacing it.
    await cancelMyFamilyRequest();
    const result = await joinFamily(trimmed);
    setBusy(false);

    if (result.status === "pending" || result.status === "approved") {
      setReentering(false);
      setCode("");
      onChanged();
      return;
    }
    if (result.status === "invalid") setCodeError("That code isn't valid. Check it and try again.");
    else if (result.status === "own_family") setCodeError("That's already your own family.");
    else if (result.status === "rate_limited")
      setCodeError("Too many tries. Wait an hour and try again.");
    else setCodeError(result.message ?? "Could not do that right now.");
    onChanged();
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="mx-auto max-w-md rounded-xl border border-line bg-card p-6">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-grass" aria-hidden />
          <h1 className="text-lg font-semibold text-ink">
            Waiting for {request.approverFirstName} to approve
          </h1>
        </div>

        <p className="mt-2.5 text-sm text-stone">
          You asked to join {sinceLabel(request.requestedAt)}. Until someone in the family
          approves you, you can&rsquo;t see anything in it — that&rsquo;s deliberate.
        </p>

        <p className="mt-2.5 text-xs text-stone">
          Code you used: <span className="font-mono font-semibold text-ink">{request.familyCode}</span>
        </p>

        {!reentering && (
          <div className="mt-4 flex flex-wrap gap-2">
            <SeededButton className="min-h-[38px]" disabled={busy} onClick={remind}>
              {busy ? "…" : "Remind them"}
            </SeededButton>
            <SeededButton
              variant="secondary"
              className="min-h-[38px]"
              disabled={busy}
              onClick={() => {
                setReentering(true);
                setNote("");
              }}
            >
              Wrong code? Re-enter
            </SeededButton>
          </div>
        )}

        {note && <p className="mt-3 text-sm text-stone">{note}</p>}

        {!reentering && (
          <p className="mt-3 text-xs text-stone">
            Reminding doesn&rsquo;t send an email — Seeded doesn&rsquo;t send any. It moves your
            request to the top of their list for next time they open Seeded.
            {request.remindedAt ? ` You last nudged them ${sinceLabel(request.remindedAt)}.` : ""}
          </p>
        )}

        {reentering && (
          <div className="mt-4">
            <label htmlFor="family-code-reenter" className="text-[13px] font-medium text-stone">
              Family code
            </label>
            <input
              id="family-code-reenter"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste the code you were given"
              aria-invalid={Boolean(codeError)}
              className="mt-1.5 h-[42px] w-full rounded-md border border-input bg-cream px-3 font-mono text-sm text-ink"
            />
            {codeError && <p className="mt-1.5 text-sm text-error">{codeError}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <SeededButton className="min-h-[38px]" disabled={busy} onClick={submitNewCode}>
                {busy ? "Checking…" : "Use this code"}
              </SeededButton>
              <SeededButton
                variant="ghost"
                className="min-h-[38px]"
                disabled={busy}
                onClick={() => {
                  setReentering(false);
                  setCodeError("");
                }}
              >
                Cancel
              </SeededButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// A bare family-code entry form, shared by the declined screen and the
// "you're not in a family" state.
export function FamilyJoinCodeForm({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter the family code.");
      return;
    }
    setBusy(true);
    setError("");
    await cancelMyFamilyRequest();
    const result = await joinFamily(trimmed);
    setBusy(false);

    if (result.status === "pending" || result.status === "approved") {
      setCode("");
      onJoined();
      return;
    }
    if (result.status === "invalid") setError("That code isn't valid. Check it and try again.");
    else if (result.status === "own_family") setError("That's already your own family.");
    else if (result.status === "rate_limited") setError("Too many tries. Wait an hour and try again.");
    else setError(result.message ?? "Could not do that right now.");
    onJoined();
  };

  return (
    <div>
      <label htmlFor="family-code-join" className="text-[13px] font-medium text-stone">
        Family code
      </label>
      <input
        id="family-code-join"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        autoComplete="off"
        spellCheck={false}
        placeholder="Paste the code you were given"
        aria-invalid={Boolean(error)}
        className="mt-1.5 h-[42px] w-full rounded-md border border-input bg-cream px-3 font-mono text-sm text-ink"
      />
      {error && <p className="mt-1.5 text-sm text-error">{error}</p>}
      <SeededButton className="mt-3 min-h-[38px]" disabled={busy} onClick={submit}>
        {busy ? "Checking…" : "Ask to join"}
      </SeededButton>
    </div>
  );
}

// Shown once a request has been denied.
//
// Deny DELETES the row rather than parking it in a 'denied' state — a
// deliberate choice in 026, so nobody carries a permanent record of having
// been refused. The cost is that this state only survives as long as the
// tab: we show it when we observe a pending request disappear while the
// person is still family-less. After a reload it degrades to the plain
// "join a family" prompt below, which is accurate rather than misleading.
export function FamilyRequestDeclined({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="mx-auto max-w-md rounded-xl border border-line bg-card p-6">
        <h1 className="text-lg font-semibold text-ink">Request declined</h1>
        <p className="mt-2.5 text-sm text-stone">
          Someone in that family declined your request. If you think that was a mistake, check
          the code with them and ask again.
        </p>
        <div className="mt-4">
          <FamilyJoinCodeForm onJoined={onRetry} />
        </div>
      </div>
    </div>
  );
}

// No family, no pending request.
export function FamilyJoinPrompt({ onJoined }: { onJoined: () => void }) {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="mx-auto max-w-md rounded-xl border border-line bg-card p-6">
        <h1 className="text-lg font-semibold text-ink">You&rsquo;re not in a family yet</h1>
        <p className="mt-2.5 text-sm text-stone">
          Ask the player for their family code. Someone already in the family has to approve you
          before you can see anything.
        </p>
        <div className="mt-4">
          <FamilyJoinCodeForm onJoined={onJoined} />
        </div>
      </div>
    </div>
  );
}
