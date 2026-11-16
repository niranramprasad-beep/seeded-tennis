"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { Player, SchoolLite } from "@/lib/types";
import { buildFitReport, type FitReport, type FitView } from "@/lib/fit";
import { loadUtrEntries, loadUtrEntriesFor } from "@/lib/db/plan";

/**
 * The one way an app screen gets fit bands.
 *
 * Every signed-in surface that shows a band — Today, Schools, a school
 * page, the compare drawer, Outreach, the parent dashboard, the weekly
 * report — goes through here, so they cannot disagree about which rating
 * judges fit or what it says. Before this they each called the classifier
 * with whatever rating they happened to hold, and the pre-auth fit report
 * alone told a family four different stories on one screen.
 *
 * Returns `null` when the player has no usable rating. That is not an
 * error state to paper over: with no rating there are no bands, and the
 * caller must render its own honest prompt.
 */
export function useFitReport(input: {
  player: Pick<Player, "currentUTR" | "graduationYear" | "gender">;
  schools: Pick<SchoolLite, "slug" | "minCompetitiveUTR" | "avgRosterUTR">[];
  view?: FitView;
  /** The what-if slider's explicit choice, when one has been made. */
  overrideUtr?: number | null;
  /**
   * Whose history backs the Reach / Out-of-range split. Defaults to the
   * signed-in user. A parent viewing their child's fit must pass the
   * CHILD's id — before loadUtrEntries() was scoped, this silently used a
   * pool of every family member's ratings.
   */
  historyUserId?: string | null;
  /** Skip the history fetch on pre-auth surfaces that have none. */
  withHistory?: boolean;
}): FitReport | null {
  const { player, schools, view, overrideUtr, historyUserId, withHistory = true } = input;

  // Shares SWR's "utr-entries" cache key with every other screen, so this
  // costs nothing extra on a page that already loaded the player's history.
  const { data: entries } = useSWR(
    withHistory ? (historyUserId ? ["utr-entries", historyUserId] : "utr-entries") : null,
    () => (historyUserId ? loadUtrEntriesFor(historyUserId) : loadUtrEntries())
  );

  const projectionInput = useMemo(
    () =>
      entries && entries.length
        ? {
            utrHistory: entries.map((e) => ({ date: new Date(e.recordedAt), utr: e.utr })),
            graduationYear: player.graduationYear,
            gender: player.gender,
          }
        : undefined,
    [entries, player.graduationYear, player.gender]
  );

  return useMemo(
    () =>
      buildFitReport({
        currentUtr: player.currentUTR,
        graduationYear: player.graduationYear,
        gender: player.gender,
        schools,
        view,
        overrideUtr,
        projectionInput,
      }),
    [player.currentUTR, player.graduationYear, player.gender, schools, view, overrideUtr, projectionInput]
  );
}
