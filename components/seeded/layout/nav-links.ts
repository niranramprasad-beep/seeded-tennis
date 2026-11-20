import {
  CalendarDays,
  Clock,
  Compass,
  CreditCard,
  DollarSign,
  FileText,
  LayoutDashboard,
  Mail,
  School,
  Settings,
  Shield,
  TrendingUp,
  Trophy,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { settingsHref } from "@/lib/settings-sections";

// The ONE list of where each role can go. The sidebar and the ⌘K palette
// both read it.
//
// They used to keep two copies under a "keep both in sync" comment. The
// last pass removed "Events" from the parent sidebar (a parent clicking it
// was silently bounced to /family) and the palette's copy kept it — so a
// parent pressing ⌘K → Events got the same dead end the fix was for. A
// comment asking two lists to agree is not a mechanism; one list is.
// `lib/nav-single-source.test.ts` fails the build if either file grows its
// own list again, or if a parent link points somewhere AuthGate bounces.
export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra words the palette matches on. */
  keywords?: string;
  badge?: number;
};

// The redesign's 5-item IA (Today.dc.html / MobileToday.dc.html).
export const PLAYER_NAV_LINKS: NavLink[] = [
  { href: "/today", label: "Today", icon: Clock },
  { href: "/plan", label: "Plan", icon: TrendingUp, keywords: "roadmap checkpoints" },
  { href: "/schools", label: "Schools", icon: School, keywords: "browse programs" },
  { href: "/outreach", label: "Outreach", icon: Mail, keywords: "coaches email" },
  { href: "/events", label: "Events", icon: CalendarDays, keywords: "calendar training matches" },
];

/** In the avatar menu for both roles, and in the ⌘K palette. /settings
 * forwards to Profile; the sidebar highlights it on every /settings/… page. */
export const SETTINGS_LINK: NavLink = { href: "/settings", label: "Settings", icon: Settings };

// ⌘K only: the Settings sections that have their own URL, so "family",
// "billing" or "delete" in the palette goes straight there
// (lib/settings-sections.ts is the one list of sections). Profile is
// SETTINGS_LINK. A parent has no Account section.
const SETTINGS_ACCOUNT_LINK: NavLink = {
  href: settingsHref("account"),
  label: "Account settings",
  icon: User,
  keywords: "settings plan sign out",
};
const SETTINGS_SECTION_SHARED: NavLink[] = [
  { href: settingsHref("family"), label: "Family settings", icon: Users, keywords: "settings members join requests approve leave code" },
  { href: settingsHref("billing"), label: "Billing", icon: CreditCard, keywords: "settings plan subscription payment" },
  { href: settingsHref("privacy"), label: "Privacy + data", icon: Shield, keywords: "settings download export delete account" },
];
export const PLAYER_SETTINGS_SECTION_LINKS: NavLink[] = [SETTINGS_ACCOUNT_LINK, ...SETTINGS_SECTION_SHARED];
export const PARENT_SETTINGS_SECTION_LINKS: NavLink[] = SETTINGS_SECTION_SHARED;

// Board 22 (docs/DESIGN_MOCKUP_SPEC_V2.md): Overview · Weekly reports ·
// Budget · Schools · Settings. No Events: /events is the player's
// tournament planner, a write surface a parent is deliberately kept out of
// (AuthGate's isParentAllowedPath does not admit it). Upcoming events
// already appear on the parent's Overview and weekly report. Settings is in
// the parent's main nav because a parent has five places to go, not ten.
export const PARENT_NAV_LINKS: NavLink[] = [
  { href: "/family", label: "Overview", icon: LayoutDashboard, keywords: "family dashboard" },
  { href: "/family/weekly-reports", label: "Weekly reports", icon: FileText, keywords: "summary report" },
  { href: "/family/budget", label: "Budget", icon: DollarSign, keywords: "season spend expenses" },
  { href: "/schools", label: "Schools", icon: School, keywords: "browse programs" },
  SETTINGS_LINK,
];

const TOURNAMENT_CHECKER_LINK: NavLink = {
  href: "/tournament-fit",
  label: "Tournament checker",
  icon: Compass,
  keywords: "tournament fit check event",
};

const RESULTS_LINK: NavLink = {
  href: "/matches",
  label: "Results",
  icon: Trophy,
  keywords: "matches log a result history record",
};

/** Pages both roles may open that are not in the main nav. */
export const SHARED_SECONDARY_LINKS: NavLink[] = [TOURNAMENT_CHECKER_LINK];

// "Tools": a small secondary group under the main nav, in the sidebar, the
// avatar menu (phones, where the bottom bar holds exactly the five) and ⌘K.
// The PRIMARY nav stays the five items above — CLAUDE.md and
// docs/DECISIONS.md (2026-11-18). Results and the tournament checker were
// reachable only through a link on /events and the avatar menu.
export const PLAYER_TOOL_LINKS: NavLink[] = [RESULTS_LINK, TOURNAMENT_CHECKER_LINK];
// A parent cannot open /matches (it is the player's write surface).
export const PARENT_TOOL_LINKS: NavLink[] = [TOURNAMENT_CHECKER_LINK];

