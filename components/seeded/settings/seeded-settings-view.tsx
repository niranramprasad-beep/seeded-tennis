"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { Player, SchoolLite, SubscriptionTier } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { loadMatches } from "@/lib/db/events";
import { loadCoachOutreachDated } from "@/lib/db/outreach";
import { loadUtrEntries } from "@/lib/db/plan";
import { buildAccountDataCsv, downloadTextFile } from "@/lib/data/export-csv";
import { getText, postJson } from "@/lib/api-client";
import { localDateKey } from "@/lib/time";
import { slugify } from "@/lib/utils";
import { SeededSettingsShell, type SettingsTabId } from "./seeded-settings-shell";
import { ProfileCard } from "./profile-card";
// NotificationsCard is deliberately not imported — see P0-7 note below.
import { AppearanceCard } from "./appearance-card";
import { PrivacyCard } from "./privacy-card";
import { AccountCard } from "./account-card";
import { FamilyCard } from "./family-card";

const TIER_LABEL: Record<SubscriptionTier, string> = {
  free: "Free",
  player: "Player",
  family: "Family",
};

// Pixel-exact to "17 Settings + account.png". The mockup bundles Player
// profile / Notifications / Appearance / Privacy + data into one
// scrollable Profile tab — so that's exactly what the "profile" tab
// renders. Account/Family/Notifications/Privacy+data each also get their
// own standalone tab (reusing the SAME card components, not duplicated
// logic) since the mockup's left nav lists them as separate sections even
// though it only ever screenshots Profile active. Billing is the one real
// route among the tabs — SeededSettingsShell links it to /settings/billing
// instead of a client tab.
export function SeededSettingsView({ schools }: { schools: SchoolLite[] }) {
  const { player, updatePlayer, signOut } = usePlayer();
  const { tier } = useTier();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTabId>("profile");

  const targetSchools = schools.filter((s) => player.targetSchoolSlugs.includes(s.slug));

  // P0-7: the notification-prefs and public-recruiting-page state lived here.
  // Both fed UI that promised things Seeded can't do (it sends no email and
  // has no public page), so that UI is hidden — which left these fetching
  // `user_settings` on every settings load for data nobody renders. The
  // loaders/savers in lib/db/settings.ts are intentionally left in place for
  // when either feature becomes real (POST-V1); only the dead wiring is gone.

  // --- Download my data (P0-8)
  // Two downloads, two different promises. The CSV is the old behaviour,
  // unchanged: readable, and built from whichever SWR caches are warm. The
  // JSON is the data-rights export — server-side, every table, and complete
  // by construction rather than by whichever pages happen to have loaded.
  // See lib/db/account-export.ts.
  const { data: matches } = useSWR("matches", () => loadMatches());
  const { data: utrEntries } = useSWR("utr-entries", () => loadUtrEntries());
  const { data: outreach } = useSWR("coach-outreach-dated", () => loadCoachOutreachDated());
  const [downloading, setDownloading] = useState<"everything" | "spreadsheet" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleDownloadSpreadsheet = () => {
    setDownloading("spreadsheet");
    try {
      const csv = buildAccountDataCsv({
        player,
        targetSchools,
        matches: matches ?? [],
        utrEntries: utrEntries ?? [],
        outreach: outreach ?? {},
      });
      downloadTextFile(`seeded-data-${slugify(player.name || "player")}-${localDateKey()}.csv`, csv);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadEverything = async () => {
    setDownloading("everything");
    try {
      const json = await getText("/api/account/export");
      downloadTextFile(`seeded-everything-${slugify(player.name || "player")}-${localDateKey()}.json`, json);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not build your download.");
    } finally {
      setDownloading(null);
    }
  };

  // --- Delete account (P0-8: real, immediate, irreversible)
  // Was a soft delete behind a 30-day grace period that deleted nothing.
  // Now calls public.delete_my_account() through the same validated route.
  // On success there is no session and no account left to render, so this
  // signs out locally and sends them to the homepage rather than leaving a
  // settings page bound to a user that no longer exists.
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await postJson("/api/account/deletion", { action: "delete", confirm: "DELETE" });
      signOut();
      router.replace("/?deleted=1");
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete your account. Try again."
      );
    } finally {
      setDeleting(false);
    }
  };

  const savePlayer = (patch: Partial<Player>) => updatePlayer(patch);

  return (
    <SeededSettingsShell active={activeTab} onTabChange={setActiveTab}>
      {activeTab === "profile" && (
        <>
          <ProfileCard player={player} onSave={savePlayer} />
          {/* P0-7: <NotificationsCard> was here. Its five toggles write real
              rows to `user_settings` and nothing ever reads them — Seeded
              sends no email and no push, so every one of them is a switch
              wired to nothing. Hidden, not deleted: the component and
              lib/db/settings.ts stay for when notifications are real
              (POST-V1). Same for the "notifications" tab below. */}
          <AppearanceCard />
          <PrivacyCard
            onDownloadEverything={handleDownloadEverything}
            onDownloadSpreadsheet={handleDownloadSpreadsheet}
            downloading={downloading}
            onDelete={deleteAccount}
            deleting={deleting}
            deleteError={deleteError}
            exportError={exportError}
          />
        </>
      )}

      {activeTab === "account" && (
        <AccountCard
          player={player}
          tierLabel={TIER_LABEL[tier]}
          onSignOut={() => {
            signOut();
            router.push("/");
          }}
        />
      )}

      {activeTab === "family" && <FamilyCard player={player} />}

      {activeTab === "privacy" && (
        <PrivacyCard
          onDownloadEverything={handleDownloadEverything}
          onDownloadSpreadsheet={handleDownloadSpreadsheet}
          downloading={downloading}
          onDelete={deleteAccount}
          deleting={deleting}
          deleteError={deleteError}
          exportError={exportError}
        />
      )}
    </SeededSettingsShell>
  );
}
