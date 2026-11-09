"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { Player, SchoolLite, SubscriptionTier } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { loadMatches, loadCoachOutreachDated } from "@/lib/supabase/features";
import { loadUtrEntries } from "@/lib/supabase/utr";
import {
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  loadPublicRecruitingPage,
  saveNotificationPrefs,
  savePublicRecruitingPage,
  type NotificationPrefs,
} from "@/lib/supabase/settings-prefs";
import { buildAccountDataCsv, downloadTextFile } from "@/lib/data/export-csv";
import { localDateKey } from "@/lib/time";
import { slugify } from "@/lib/utils";
import { SeededSettingsShell, type SettingsTabId } from "./seeded-settings-shell";
import { ProfileCard } from "./profile-card";
import { NotificationsCard } from "./notifications-card";
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

  // --- Notifications + public recruiting page (shared user_settings.
  // notification_preferences JSONB bag — see lib/supabase/settings-prefs.ts)
  const { data: loadedPrefs } = useSWR("notification-prefs", loadNotificationPrefs);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  useEffect(() => {
    if (loadedPrefs) setPrefs(loadedPrefs);
  }, [loadedPrefs]);
  const onChangePrefs = (next: NotificationPrefs) => {
    setPrefs(next);
    void saveNotificationPrefs(next);
  };

  const { data: loadedPublicPage } = useSWR("public-recruiting-page", loadPublicRecruitingPage);
  const [publicPage, setPublicPage] = useState(false);
  useEffect(() => {
    if (loadedPublicPage != null) setPublicPage(loadedPublicPage);
  }, [loadedPublicPage]);
  const onTogglePublicPage = (next: boolean) => {
    setPublicPage(next);
    void savePublicRecruitingPage(next);
  };

  // --- Download my data
  const { data: matches } = useSWR("matches", () => loadMatches());
  const { data: utrEntries } = useSWR("utr-entries", () => loadUtrEntries());
  const { data: outreach } = useSWR("coach-outreach-dated", () => loadCoachOutreachDated());
  const [downloading, setDownloading] = useState(false);
  const handleDownload = () => {
    setDownloading(true);
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
      setDownloading(false);
    }
  };

  // --- Delete account (soft delete, 30-day grace period — see
  // delete-account-dialog.tsx's doc comment for the full policy).
  const [deletingBusy, setDeletingBusy] = useState(false);
  const requestDeletion = () => {
    setDeletingBusy(true);
    updatePlayer({ deletionRequestedAt: new Date().toISOString() });
    setDeletingBusy(false);
  };
  const cancelDeletion = () => {
    setDeletingBusy(true);
    updatePlayer({ deletionRequestedAt: null });
    setDeletingBusy(false);
  };

  const savePlayer = (patch: Partial<Player>) => updatePlayer(patch);

  return (
    <SeededSettingsShell active={activeTab} onTabChange={setActiveTab}>
      {activeTab === "profile" && (
        <>
          <ProfileCard player={player} onSave={savePlayer} />
          <NotificationsCard prefs={prefs} onChange={onChangePrefs} />
          <AppearanceCard />
          <PrivacyCard
            publicRecruitingPage={publicPage}
            onTogglePublicRecruitingPage={onTogglePublicPage}
            onDownload={handleDownload}
            downloading={downloading}
            deletionRequestedAt={player.deletionRequestedAt}
            onRequestDeletion={requestDeletion}
            onCancelDeletion={cancelDeletion}
            deletingBusy={deletingBusy}
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

      {activeTab === "notifications" && <NotificationsCard prefs={prefs} onChange={onChangePrefs} />}

      {activeTab === "privacy" && (
        <PrivacyCard
          publicRecruitingPage={publicPage}
          onTogglePublicRecruitingPage={onTogglePublicPage}
          onDownload={handleDownload}
          downloading={downloading}
          deletionRequestedAt={player.deletionRequestedAt}
          onRequestDeletion={requestDeletion}
          onCancelDeletion={cancelDeletion}
          deletingBusy={deletingBusy}
        />
      )}
    </SeededSettingsShell>
  );
}
