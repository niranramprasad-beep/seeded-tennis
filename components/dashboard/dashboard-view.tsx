"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Check } from "lucide-react";
import type { SchoolLite } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { usePlanGoal } from "@/lib/hooks/use-plan-goal";
import type { PlanGoal } from "@/lib/fit";
import type { GoalPace } from "@/lib/school-fit";
import { Toast } from "@/components/seeded/ui/toast";
import { AuthGate } from "@/components/shared/auth-gate";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { SeededDashboardLayout } from "@/components/seeded/dashboard/seeded-dashboard-layout";
import { CheckinDrawer } from "@/components/seeded/dashboard/checkin-drawer";
import { SundayCheckinDrawer, type SundayCheckinSaveInput } from "./sunday-checkin-drawer";
import { formatDate, localDateKey, parseLocalDate } from "@/lib/time";
import { isSundayCheckinDue } from "@/lib/today-actions";
import { formatPlayerUtr, utrInputValue } from "@/lib/utils";
import {
  createUtrEntry,
  loadUtrEntries,
  type UtrEntry,
} from "@/lib/db/plan";
import { loadMatches, saveMatch, type MatchRecord } from "@/lib/db/events";

interface DashboardViewProps {
  schools: SchoolLite[];
}

export function DashboardView(props: DashboardViewProps) {
  return (
    <AuthGate>
      <DashboardInner {...props} />
    </AuthGate>
  );
}

function DashboardInner({ schools }: DashboardViewProps) {
  const { player, updatePlayer } = usePlayer();
  // SWR caches this under a stable key so flipping to another tab and back
  // shows the last-loaded entries instantly instead of a blank/loading
  // state, then quietly revalidates in the background.
  const {
    data: utrEntries = [],
    error: utrFetchError,
    isLoading: utrFetchLoading,
    mutate: mutateUtrEntries,
  } = useSWR<UtrEntry[]>("utr-entries", () => loadUtrEntries());
  // Same "matches" key /matches and /events already use — one shared
  // fetch/cache across every page, so a match logged here (or there) shows
  // up everywhere else instantly, no refetch needed.
  const { mutate: mutateMatches } = useSWR<MatchRecord[]>(
    "matches",
    () => loadMatches()
  );
  const [utrDrawerOpen, setUtrDrawerOpen] = useState(false);
  // /today?utr=1 opens the UTR drawer: /schools' "Enter my UTR" lands here
  // for a signed-in player (D2 sends onboarded players away from /onboarding,
  // and Settings has no rating field). Read once on mount, then the query is
  // dropped so a refresh doesn't reopen it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("utr") !== "1") return;
    setUtrDrawerOpen(true);
    url.searchParams.delete("utr");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);
  const [checkinDrawerOpen, setCheckinDrawerOpen] = useState(false);
  const [sundayCheckinOpen, setSundayCheckinOpen] = useState(false);
  const [sundayStatus, setSundayStatus] = useState<"idle" | "saving" | "error">("idle");
  const [sundayError, setSundayError] = useState("");
  const [utrStatus, setUtrStatus] = useState<"idle" | "loading" | "saving" | "error">("loading");
  const [utrError, setUtrError] = useState("");

  // "Now" captured once per mount (same convention as the Seeded dashboard
  // layout's own `now`) — real, not fabricated: it's only ever read against
  // the player's actual logged UTR history below.
  const now = useMemo(() => new Date(), []);
  // Not until the history has loaded: with `[]` standing in for "still
  // loading", isSundayCheckinDue read "no entry for 7+ days" and the banner
  // flashed on any weekday, then vanished (CLS 0.086 on /today at 375).
  const sundayCheckinDue = useMemo(
    () => !utrFetchLoading && !utrFetchError && isSundayCheckinDue(utrEntries, now),
    [utrFetchLoading, utrFetchError, utrEntries, now]
  );

  // Mirror SWR's fetch state into the existing status/error pair so the
  // render logic below (and the "saving"/"error" states the save flow
  // already manages) doesn't need to change.
  useEffect(() => {
    if (utrFetchLoading) {
      setUtrStatus("loading");
    } else if (utrFetchError) {
      setUtrStatus("error");
      setUtrError(
        utrFetchError instanceof Error ? utrFetchError.message : "Could not load UTR history."
      );
    } else {
      setUtrStatus((prev) => (prev === "loading" ? "idle" : prev));
    }
  }, [utrFetchLoading, utrFetchError]);

  const targetSchools = useMemo(
    () => schools.filter((s) => player.targetSchoolSlugs.includes(s.slug)),
    [schools, player.targetSchoolSlugs]
  );

  // The same goal and checkpoints /plan shows (lib/hooks/use-plan-goal.ts):
  // the one the player set, or none (PR D, D1: never the estimate). It used
  // to be the hardest target's floor, so "Next checkpoint" jumped whenever a
  // target was added (C11).
  const planGoal = usePlanGoal(player);
  const roadmap = planGoal.roadmap;

  const firstName = player.name.trim().split(/\s+/)[0] || "";
  const [savedToast, setSavedToast] = useState<string | null>(null);

  // Never invent data: with no logged entries yet, the only "actual" point is
  // the player's own current UTR from their profile — a real value, not a
  // fabricated history.
  const actualPoints = useMemo(() => {
    if (utrEntries.length === 0) {
      return [{ date: new Date(), utr: player.currentUTR }];
    }
    return utrEntries.map((e) => ({
      date: parseLocalDate(e.recordedAt),
      utr: e.utr,
    }));
  }, [utrEntries, player.currentUTR]);

  const targetPoints = useMemo(
    () => [
      { date: new Date(), utr: player.currentUTR },
      ...roadmap.map((y) => ({ date: new Date(y.calendarYear, 5, 1), utr: y.utrTarget })),
    ],
    [player.currentUTR, roadmap]
  );

  const handleSaveUtr = async (input: { utr: number; recordedAt: string; note: string }) => {
    setUtrStatus("saving");
    setUtrError("");
    try {
      const saved = await createUtrEntry(input);
      const entry =
        saved ??
        ({
          id: `local-${Date.now()}`,
          utr: input.utr,
          recordedAt: input.recordedAt,
          note: input.note,
        } satisfies UtrEntry);
      const nextEntries = [...utrEntries, entry].sort((a, b) =>
        a.recordedAt.localeCompare(b.recordedAt)
      );
      // Update SWR's cache directly with the known-correct result instead
      // of refetching — instant UI update, and `revalidate: false` means
      // the next real load doesn't pointlessly re-request the same page.
      mutateUtrEntries(nextEntries, { revalidate: false });
      // currentUTR must track whichever entry is most recently dated, not
      // whichever one was just logged — a backfilled older result must
      // never override a newer value already on record.
      const mostRecent = nextEntries[nextEntries.length - 1];
      updatePlayer({ currentUTR: mostRecent.utr });
      setUtrDrawerOpen(false);
      setUtrStatus("idle");
      // C19: the drawer used to close with no word that anything happened.
      setSavedToast(`UTR ${formatPlayerUtr(input.utr)} saved for ${formatDate(input.recordedAt)}.`);
    } catch (error) {
      setUtrStatus("error");
      setUtrError(error instanceof Error ? error.message : "Could not save UTR entry.");
    }
  };

  // The Sunday check-in writes through the exact same two real functions as
  // the standalone UTR drawer (createUtrEntry) and Match mode (saveMatch) —
  // no third parallel data-entry mechanism — so a submission here is
  // immediately the same real data /plan's chart and match history already
  // read, not a separate record that needs reconciling later.
  const handleSaveSundayCheckin = async (input: SundayCheckinSaveInput) => {
    setSundayStatus("saving");
    setSundayError("");
    try {
      const savedUtr = await createUtrEntry({
        utr: input.utr,
        recordedAt: input.recordedAt,
        note: "Sunday check-in",
      });
      const utrEntry =
        savedUtr ??
        ({
          id: `local-${Date.now()}`,
          utr: input.utr,
          recordedAt: input.recordedAt,
          note: "Sunday check-in",
        } satisfies UtrEntry);
      const nextEntries = [...utrEntries.filter((e) => e.id !== utrEntry.id), utrEntry].sort(
        (a, b) => a.recordedAt.localeCompare(b.recordedAt)
      );
      mutateUtrEntries(nextEntries, { revalidate: false });
      // Same "most recently DATED, not most recently logged" rule as the
      // standalone UTR drawer above.
      const mostRecent = nextEntries[nextEntries.length - 1];
      updatePlayer({ currentUTR: mostRecent.utr });

      if (input.match) {
        const savedMatch = await saveMatch({
          matchDate: input.match.matchDate,
          opponent: input.match.opponent,
          surface: input.match.surface,
          result: input.match.result,
          score: input.match.score,
          notificationRequested: false,
        });
        if (savedMatch) {
          mutateMatches(
            (prev = []) => [savedMatch, ...prev.filter((m) => m.id !== savedMatch.id)],
            { revalidate: false }
          );
        }
      }

      setSundayCheckinOpen(false);
      setSundayStatus("idle");
      setSavedToast(`Check-in saved. UTR ${formatPlayerUtr(input.utr)}.`);
    } catch (error) {
      setSundayStatus("error");
      setSundayError(error instanceof Error ? error.message : "Could not save your check-in.");
    }
  };

  const layoutProps = {
    firstName,
    player,
    actualPoints,
    targetPoints,
    targetSchools,
    setUtrDrawerOpen,
    setCheckinDrawerOpen,
    sundayCheckinDue,
    setSundayCheckinOpen,
    planGoal: planGoal.goal,
    goalPace: planGoal.goalPace,
    onUseEstimateGoal: (value: number) => void planGoal.setGoal(value),
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <SeededDashboardLayout {...layoutProps} />

      <UtrLogDrawer
        open={utrDrawerOpen}
        currentUtr={player.currentUTR}
        loading={utrStatus === "saving"}
        error={utrError}
        onClose={() => {
          setUtrDrawerOpen(false);
          setUtrError("");
        }}
        onSave={handleSaveUtr}
      />

      <SundayCheckinDrawer
        open={sundayCheckinOpen}
        currentUtr={player.currentUTR}
        loading={sundayStatus === "saving"}
        error={sundayError}
        onClose={() => {
          setSundayCheckinOpen(false);
          setSundayError("");
        }}
        onSave={handleSaveSundayCheckin}
      />

      <CheckinDrawer open={checkinDrawerOpen} onClose={() => setCheckinDrawerOpen(false)} />

      <Toast open={savedToast != null} onDismiss={() => setSavedToast(null)} variant="success">
        {savedToast ?? " "}
      </Toast>
    </div>
  );
}

export interface DashboardLayoutProps {
  firstName: string;
  player: ReturnType<typeof usePlayer>["player"];
  actualPoints: { date: Date; utr: number }[];
  targetPoints: { date: Date; utr: number }[];
  targetSchools: SchoolLite[];
  setUtrDrawerOpen: (v: boolean) => void;
  setCheckinDrawerOpen: (v: boolean) => void;
  /** Real, computed from the player's own UTR history — lib/today-actions.ts's
   * isSundayCheckinDue. True only on an actual Sunday (with nothing logged
   * yet today) or when genuinely overdue (7+ days since the last entry). */
  sundayCheckinDue: boolean;
  setSundayCheckinOpen: (v: boolean) => void;
  /** lib/hooks/use-plan-goal.ts — the same goal /plan shows. */
  planGoal: PlanGoal | null;
  goalPace: GoalPace | null;
  /** Saves the planning estimate as the goal (the pace warning offers it). */
  onUseEstimateGoal: (value: number) => void;
}

function UtrLogDrawer({
  open,
  currentUtr,
  loading,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  currentUtr: number;
  loading: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: { utr: number; recordedAt: string; note: string }) => void;
}) {
  const [utr, setUtr] = useState(utrInputValue(currentUtr));
  const [recordedAt, setRecordedAt] = useState(localDateKey());
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;
    setUtr(utrInputValue(currentUtr));
    setRecordedAt(localDateKey());
    setNote("");
    setLocalError("");
  }, [currentUtr, open]);

  const submit = () => {
    const value = Number(utr);
    if (!Number.isFinite(value) || value < 1 || value > 16.5) {
      setLocalError("Enter a UTR between 1.00 and 16.50.");
      return;
    }
    if (!recordedAt) {
      setLocalError("Choose the date this rating was recorded.");
      return;
    }
    onSave({ utr: value, recordedAt, note });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Update UTR"
      title="Log your current rating"
      footer={
        // A real form (final-check B6): Enter in "Current UTR" did nothing.
        // The footer sits outside the form's DOM, so it submits by id.
        <Button className="w-full" type="submit" form="utr-log-form" disabled={loading}>
          {loading ? "Saving..." : "Save UTR entry"}
          <Check className="h-4 w-4" />
        </Button>
      }
    >
      <form
        id="utr-log-form"
        noValidate
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!loading) submit();
        }}
      >
        {(localError || error) && (
          <p className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error" role="alert">
            {localError || error}
          </p>
        )}
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-stone-light">Current UTR</span>
          <input
            type="number"
            min={1}
            max={16.5}
            step={0.01}
            value={utr}
            onChange={(event) => setUtr(event.target.value)}
            className="h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-base text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-stone-light">Date</span>
          <input
            type="date"
            value={recordedAt}
            onChange={(event) => setRecordedAt(event.target.value)}
            className="h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-base text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-stone-light">Optional note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. what changed since your last rating"
            className="min-h-[104px] w-full rounded-xl border-[0.5px] border-line bg-card px-4 py-3 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30"
          />
        </label>
      </form>
    </Drawer>
  );
}
