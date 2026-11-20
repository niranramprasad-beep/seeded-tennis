// Every Settings section has its own URL (PR D, D6). One list, read by the
// Settings shell's tab nav, the ⌘K palette and every link that targets a
// section — lib/settings-sections.test.ts checks the pages exist.
//
// /settings itself still works: it sends you to a section, honouring the
// old deep-link shapes (`/settings#family`, `/settings?tab=family`) that
// were client-side tab state before the sections had URLs.

export type SettingsSectionId = "profile" | "account" | "family" | "billing" | "privacy";

export const SETTINGS_SECTIONS: ReadonlyArray<{ id: SettingsSectionId; label: string; href: string }> = [
  { id: "profile", label: "Profile", href: "/settings/profile" },
  { id: "account", label: "Account", href: "/settings/account" },
  { id: "family", label: "Family", href: "/settings/family" },
  { id: "billing", label: "Billing", href: "/settings/billing" },
  { id: "privacy", label: "Privacy + data", href: "/settings/privacy" },
];

/** A parent has no "Account" section of player facts — their account
 * details are on Profile (parent-settings-view.tsx). */
export const PARENT_SETTINGS_SECTIONS = SETTINGS_SECTIONS.filter((s) => s.id !== "account");

export function settingsHref(id: SettingsSectionId): string {
  return SETTINGS_SECTIONS.find((s) => s.id === id)!.href;
}

/** Where /onboarding sends an account that has already onboarded. The
 * query is what makes /settings/profile show "Update your profile here". */
export const SETTINGS_FROM_ONBOARDING_HREF = "/settings/profile?from=onboarding";

const ALIASES: Record<string, SettingsSectionId> = {
  profile: "profile",
  account: "account",
  family: "family",
  billing: "billing",
  privacy: "privacy",
  "privacy-data": "privacy",
  data: "privacy",
  // P0-7 hid the Notifications tab; its old links land on Profile.
  notifications: "profile",
  appearance: "profile",
};

/** The section an old `/settings#x` or `/settings?tab=x` link meant, or
 * "profile" when it names nothing we know. */
export function sectionFromLegacyLink(hash: string | null | undefined, tab: string | null | undefined): SettingsSectionId {
  for (const raw of [tab, hash]) {
    const key = (raw ?? "").replace(/^#/, "").trim().toLowerCase();
    if (key && ALIASES[key]) return ALIASES[key];
  }
  return "profile";
}

/** The section a role may open. A parent asking for "account" gets
 * "profile", where a parent's account details live. */
export function sectionForRole(id: SettingsSectionId, role: "player" | "parent"): SettingsSectionId {
  return role === "parent" && id === "account" ? "profile" : id;
}
