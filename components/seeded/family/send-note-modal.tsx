"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { SeededButton } from "@/components/seeded/ui/button";
import { ModalShell } from "./budget-modals";

// "Send {Player} a note" has real backing — this reuses the EXISTING
// encouragement-notes feature (lib/db/family.ts (formerly lib/supabase/features.ts)'s
// saveEncouragementNote/loadEncouragementNotes), which already does
// exactly this: a parent writes a note that shows up on the player's own
// dashboard. Parent-authored content, not a mutation of any player-owned
// field (UTR, profile, target schools, outreach status all stay untouched
// by this call) — same "parent-owned data is fine to write" bucket as
// budget edits/expenses.
export function SendNoteModal({
  open,
  onClose,
  playerName,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  playerName: string;
  onSend: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setBody("");
      setError("");
    }
  }, [open]);

  const submit = async () => {
    if (!body.trim()) return setError("Write a note first.");
    setSending(true);
    setError("");
    try {
      await onSend(body.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the note.");
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} titleId="send-note-title">
      <div className="flex items-start justify-between">
        <h2 id="send-note-title" className="text-lg font-semibold text-ink">
          Send {playerName} a note
        </h2>
        <button onClick={onClose} aria-label="Close" className="text-stone-light hover:text-ink">
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-1.5 text-sm text-stone">
        Shows up on {playerName}&rsquo;s own dashboard.
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="After a tough week or a big result…"
        className="mt-4 min-h-[110px] w-full rounded-card border-hairline border-line bg-cream/50 px-4 py-3 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/25"
      />
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover"
        >
          Cancel
        </button>
        <SeededButton onClick={submit} loading={sending}>
          Send note
        </SeededButton>
      </div>
    </ModalShell>
  );
}
