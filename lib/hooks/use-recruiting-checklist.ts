"use client";

// React state wrapper around lib/recruiting-checklist.ts's pure merge
// logic + lib/supabase/recruiting-checklist.ts's real persistence. Same
// optimistic-update shape as lib/hooks/use-star-schools.ts: the UI updates
// immediately, the real write happens in the background, and a real
// failure quietly rolls the optimistic change back rather than leaving the
// UI showing a state that was never actually saved.
import useSWR from "swr";
import { useCallback } from "react";
import {
  mergeRecruitingChecklist,
  type MergedRecruitingChecklistItem,
  type RecruitingChecklistContext,
  type RecruitingChecklistState,
} from "@/lib/recruiting-checklist";
import {
  addCustomRecruitingChecklistItem,
  loadRecruitingChecklistState,
  removeCustomRecruitingChecklistItem,
  setRecruitingChecklistItemState,
} from "@/lib/supabase/recruiting-checklist";

const EMPTY_STATE: RecruitingChecklistState = { completedIds: [], hiddenIds: [], customItems: [] };

export interface UseRecruitingChecklistResult {
  items: MergedRecruitingChecklistItem[];
  loading: boolean;
  toggleCompleted: (id: string) => void;
  toggleHidden: (id: string) => void;
  addItem: (label: string) => void;
  removeItem: (id: string) => void;
}

export function useRecruitingChecklist(
  context: Omit<RecruitingChecklistContext, "now">
): UseRecruitingChecklistResult {
  const { data, mutate, isLoading } = useSWR("recruiting-checklist-state", () =>
    loadRecruitingChecklistState()
  );
  const state = data ?? EMPTY_STATE;

  const items = mergeRecruitingChecklist(context, state);

  const setItemState = useCallback(
    (id: string, patch: Partial<{ completed: boolean; hidden: boolean }>) => {
      const current = items.find((i) => i.id === id);
      if (!current || !current.editable) return; // autoDone items aren't independently toggleable

      const nextCompleted = patch.completed ?? current.completed;
      const nextHidden = patch.hidden ?? current.hidden;

      const optimistic: RecruitingChecklistState = {
        completedIds: nextCompleted
          ? Array.from(new Set([...state.completedIds, id]))
          : state.completedIds.filter((x) => x !== id),
        hiddenIds: nextHidden
          ? Array.from(new Set([...state.hiddenIds, id]))
          : state.hiddenIds.filter((x) => x !== id),
        customItems: state.customItems,
      };

      void mutate(
        (async () => {
          const ok = await setRecruitingChecklistItemState(id, {
            completed: nextCompleted,
            hidden: nextHidden,
          });
          return ok ? optimistic : state; // real failure: silently roll back
        })(),
        { optimisticData: optimistic, rollbackOnError: false, revalidate: false }
      );
    },
    [items, mutate, state]
  );

  const toggleCompleted = useCallback(
    (id: string) => {
      const current = items.find((i) => i.id === id);
      if (current) setItemState(id, { completed: !current.completed });
    },
    [items, setItemState]
  );

  const toggleHidden = useCallback(
    (id: string) => {
      const current = items.find((i) => i.id === id);
      if (current) setItemState(id, { hidden: !current.hidden });
    },
    [items, setItemState]
  );

  const addItem = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      void mutate(
        (async () => {
          const itemKey = await addCustomRecruitingChecklistItem(trimmed);
          if (!itemKey) return state; // real failure — nothing added
          return {
            ...state,
            customItems: [...state.customItems, { id: itemKey, label: trimmed }],
          };
        })(),
        { revalidate: false }
      );
    },
    [mutate, state]
  );

  const removeItem = useCallback(
    (id: string) => {
      const optimistic: RecruitingChecklistState = {
        completedIds: state.completedIds.filter((x) => x !== id),
        hiddenIds: state.hiddenIds.filter((x) => x !== id),
        customItems: state.customItems.filter((c) => c.id !== id),
      };
      void mutate(
        (async () => {
          const ok = await removeCustomRecruitingChecklistItem(id);
          return ok ? optimistic : state;
        })(),
        { optimisticData: optimistic, rollbackOnError: false, revalidate: false }
      );
    },
    [mutate, state]
  );

  return { items, loading: isLoading, toggleCompleted, toggleHidden, addItem, removeItem };
}
