"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { SeededButton } from "@/components/seeded/ui/button";
import type { BudgetExpenseCategory } from "@/lib/supabase/budget";
import { localDateKey } from "@/lib/time";
import { cn } from "@/lib/utils";

// Shared overlay + panel shell — same motion/shape language as
// components/seeded/settings/delete-account-dialog.tsx, just without that
// dialog's destructive (error-red) styling, since both forms here write
// ordinary parent-owned budget data.
export function ModalShell({
  open,
  onClose,
  titleId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-ink/50"
          />
          {/* Centers via flexbox, not a `left-1/2 -translate-x-1/2` transform
              trick — Framer Motion writes its own `transform` inline style
              for the panel below (animating y/scale), and once that
              animation settles it sets `transform: none`, which would
              silently wipe out a Tailwind transform-based centering class
              and push the panel off-screen at narrow viewports. This outer
              layer is pointer-events-none (and the panel pointer-events-auto)
              so a click in the empty side margins still falls through to
              the backdrop behind, same as before. */}
          <div className="pointer-events-none fixed inset-x-0 top-[14vh] z-[101] flex justify-center px-4">
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto w-full max-w-md overflow-hidden rounded-[18px] border border-line bg-card p-6 shadow-seeded-3"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function fieldClass() {
  return "h-11 w-full rounded-md border border-input bg-card px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-grass/30";
}

export function EditBudgetModal({
  open,
  onClose,
  initialLabel,
  initialTotal,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initialLabel: string;
  initialTotal: number;
  onSave: (input: { seasonLabel: string; totalBudget: number }) => Promise<void>;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [total, setTotal] = useState(String(initialTotal));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setLabel(initialLabel);
      setTotal(String(initialTotal));
      setError("");
    }
  }, [open, initialLabel, initialTotal]);

  const submit = async () => {
    const totalBudget = Number(total);
    if (!label.trim()) return setError("Season label is required.");
    if (!Number.isFinite(totalBudget) || totalBudget < 0) return setError("Enter a valid budget amount.");
    setSaving(true);
    setError("");
    try {
      await onSave({ seasonLabel: label.trim(), totalBudget });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the budget.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} titleId="edit-budget-title">
      <div className="flex items-start justify-between">
        <h2 id="edit-budget-title" className="text-lg font-semibold text-ink">
          Edit season budget
        </h2>
        <button onClick={onClose} aria-label="Close" className="text-stone-light hover:text-ink">
          <X className="h-5 w-5" />
        </button>
      </div>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium text-stone">Season</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={fieldClass()}
          placeholder="Fall 2026"
        />
      </label>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium text-stone">Total budget</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-light">$</span>
          <input
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            inputMode="decimal"
            className={cn(fieldClass(), "pl-6")}
            placeholder="3000"
          />
        </div>
      </label>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover"
        >
          Cancel
        </button>
        <SeededButton onClick={submit} loading={saving}>
          Save budget
        </SeededButton>
      </div>
    </ModalShell>
  );
}

const CATEGORY_OPTIONS: { value: BudgetExpenseCategory; label: string }[] = [
  { value: "entries", label: "Entries" },
  { value: "travel", label: "Travel" },
  { value: "camps", label: "Camps" },
];

export function AddExpenseModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (input: {
    category: BudgetExpenseCategory;
    label: string;
    amount: number;
    expenseDate: string;
  }) => Promise<void>;
}) {
  const [category, setCategory] = useState<BudgetExpenseCategory>("camps");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDateKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setCategory("camps");
      setLabel("");
      setAmount("");
      setDate(localDateKey());
      setError("");
    }
  }, [open]);

  const submit = async () => {
    const amt = Number(amount);
    if (!label.trim()) return setError("A short description is required.");
    if (!Number.isFinite(amt) || amt < 0) return setError("Cost can't be negative.");
    if (!date) return setError("Enter a date.");
    setSaving(true);
    setError("");
    try {
      await onSave({ category, label: label.trim(), amount: amt, expenseDate: date });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the expense.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} titleId="add-expense-title">
      <div className="flex items-start justify-between">
        <h2 id="add-expense-title" className="text-lg font-semibold text-ink">
          Add expense
        </h2>
        <button onClick={onClose} aria-label="Close" className="text-stone-light hover:text-ink">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4 inline-flex w-full gap-1 rounded-pill border border-[rgb(var(--c-line))] bg-cream/60 p-1">
        {CATEGORY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setCategory(opt.value)}
            aria-pressed={category === opt.value}
            className={cn(
              "flex-1 rounded-pill py-1.5 font-sans text-sm font-semibold transition-colors",
              category === opt.value ? "bg-ink text-cream" : "text-stone hover:text-ink"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium text-stone">Description</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={fieldClass()}
          placeholder="Duke Tennis Camp"
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone">Cost</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-light">$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className={cn(fieldClass(), "pl-6")}
              placeholder="380"
            />
          </div>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={fieldClass()}
          />
        </label>
      </div>

      {error && <p className="mt-2 text-sm text-error">{error}</p>}
      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover"
        >
          Cancel
        </button>
        <SeededButton onClick={submit} loading={saving}>
          Add expense
        </SeededButton>
      </div>
    </ModalShell>
  );
}
