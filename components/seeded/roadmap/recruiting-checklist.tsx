"use client";

import { useState } from "react";
import { EyeOff, Eye, Plus, X } from "lucide-react";
import type { MergedRecruitingChecklistItem } from "@/lib/recruiting-checklist";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

interface RecruitingChecklistCardProps {
  items: MergedRecruitingChecklistItem[];
  onToggleCompleted: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onAddItem: (label: string) => void;
  onRemoveItem: (id: string) => void;
}

const DIVISION_CLASS: Record<"D1" | "D3", string> = {
  D1: "bg-grass-50 text-grass border-grass-100",
  D3: "bg-card text-stone border-line",
};

// Real recruiting-timeline checklist (point 5 of the redesign spec):
// date-gated D1/D3 contact-window milestones computed for real from the
// player's grad year (lib/recruiting-checklist.ts), evergreen tasks
// (NCAA Eligibility Center, highlight video, camps/showcases), and a few
// items with a real auto-computed done state (target list, UTR profile
// link, coach emails — same honest "readOnly when it's real data" pattern
// buildPlanChecklist already used for its two items). Players can check
// off, hide, and add their own items — all persisted for real via
// lib/hooks/use-recruiting-checklist.ts / migration 016.
export function RecruitingChecklistCard({
  items,
  onToggleCompleted,
  onToggleHidden,
  onAddItem,
  onRemoveItem,
}: RecruitingChecklistCardProps) {
  const [showHidden, setShowHidden] = useState(false);
  const [draft, setDraft] = useState("");

  const visible = items.filter((i) => !i.hidden);
  const hiddenItems = items.filter((i) => i.hidden);

  const submit = () => {
    if (!draft.trim()) return;
    onAddItem(draft);
    setDraft("");
  };

  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">Recruiting timeline</h2>
        {hiddenItems.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="text-xs font-semibold text-grass"
          >
            {showHidden ? "Hide hidden items" : `Show ${hiddenItems.length} hidden`}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-stone">
        General NCAA contact-period guidance, not specific to tennis (it has no sport-specific
        calendar) — rules change, so confirm the current dates at{" "}
        <a href="https://www.ncaa.org" target="_blank" rel="noreferrer" className="font-semibold text-grass">
          ncaa.org
        </a>
        .
      </p>

      <ul className="mt-3.5 flex flex-col gap-2.5 text-sm">
        {visible.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            onToggleCompleted={onToggleCompleted}
            onToggleHidden={onToggleHidden}
            onRemoveItem={onRemoveItem}
          />
        ))}
      </ul>

      {showHidden && hiddenItems.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3 text-sm opacity-70">
          {hiddenItems.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              onToggleCompleted={onToggleCompleted}
              onToggleHidden={onToggleHidden}
              onRemoveItem={onRemoveItem}
            />
          ))}
        </ul>
      )}

      <div className="mt-3.5 flex items-center gap-2 border-t border-line pt-3.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Add your own task…"
          aria-label="Add a custom checklist item"
          className="h-9 flex-1 rounded-md border border-input bg-card px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          aria-label="Add item"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-stone transition-colors hover:text-ink",
            !draft.trim() && "cursor-not-allowed opacity-40"
          )}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ChecklistRow({
  item,
  onToggleCompleted,
  onToggleHidden,
  onRemoveItem,
}: {
  item: MergedRecruitingChecklistItem;
  onToggleCompleted: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onRemoveItem: (id: string) => void;
}) {
  return (
    <li className="flex flex-col gap-1 border-b border-line pb-2.5 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={item.completed}
          disabled={!item.editable}
          onChange={() => item.editable && onToggleCompleted(item.id)}
          aria-label={item.completed ? "Done" : "Not done"}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={item.completed ? "text-ink" : "text-stone"}>{item.label}</span>
            {item.division && (
              <span
                className={cn(
                  "whitespace-nowrap rounded-pill border px-1.5 py-0.5 text-[10px] font-semibold",
                  DIVISION_CLASS[item.division]
                )}
              >
                {item.division}
              </span>
            )}
            {item.dueDate && (
              <span className="whitespace-nowrap font-mono text-[11px] text-stone-light">
                {formatDate(item.dueDate)}
              </span>
            )}
          </div>
          {item.note && <p className="mt-0.5 text-xs text-stone-light">{item.note}</p>}
        </div>
        <button
          type="button"
          onClick={() => (item.isCustom ? onRemoveItem(item.id) : onToggleHidden(item.id))}
          aria-label={item.isCustom ? `Remove ${item.label}` : item.hidden ? `Unhide ${item.label}` : `Hide ${item.label}`}
          className="shrink-0 text-stone-light transition-colors hover:text-ink"
        >
          {item.isCustom ? (
            <X className="h-3.5 w-3.5" />
          ) : item.hidden ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </li>
  );
}
