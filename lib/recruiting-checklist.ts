// Pure math behind /plan's "Recruiting timeline" checklist — no React, no
// Supabase. Mixes two kinds of item:
//   - DATE-GATED milestones, computed for real from the player's real
//     graduationYear via lib/time.ts's D1/D3 contact-window functions
//     (themselves built on lib/config/recruiting.ts's NCAA-calendar
//     constants). Tennis has no sport-specific NCAA calendar, so these are
//     the GENERAL contact-period rules — real as of when this was written,
//     but recruiting rules do change, so every caller must show the
//     "confirm at ncaa.org" caveat rather than presenting them as fixed.
//   - EVERGREEN tasks with no calendar gate (NCAA Eligibility Center
//     registration, highlight video, camps/showcases research).
// A few items have a REAL computed `autoDone` (target list, UTR profile
// link, first coach emails) pulled from data that already exists elsewhere
// in the app (star-to-target, /settings' profile link, coach_outreach) —
// those render as a read-only checked state, the same honest pattern
// lib/plan-stats.ts's buildPlanChecklist already uses for its two items,
// never a fabricated guess. Every other item is genuinely user-toggled and
// needs the real persisted state from lib/db/plan.ts
// merged in by `mergeRecruitingChecklist` below.
import {
  getD1ContactOpenDate,
  getD1OffCampusContactDate,
  getD1WrittenOfferDate,
  getD3OffCampusContactDate,
  getD3OfficialVisitDate,
  localDateKey,
} from "@/lib/time";

export type RecruitingChecklistCategory =
  | "eligibility"
  | "targets"
  | "profile"
  | "highlight"
  | "camps"
  | "outreach"
  | "visits"
  | "custom";

export interface RecruitingChecklistDefaultItem {
  id: string;
  label: string;
  category: RecruitingChecklistCategory;
  /** Which division's rule this milestone reflects — undefined for
   * division-agnostic evergreen tasks. */
  division?: "D1" | "D3";
  /** ISO "YYYY-MM-DD" — null for evergreen tasks with no calendar gate. */
  dueDate: string | null;
  note: string;
  /** Real computed boolean when one exists (target list, UTR profile
   * link, first coach emails); null means there's nothing real to derive
   * it from, so the user's own persisted toggle is the only source of
   * truth for this item. */
  autoDone: boolean | null;
}

export interface RecruitingChecklistContext {
  graduationYear: number;
  /** player.targetSchoolSlugs.length — real, via the star-to-target mechanism. */
  targetSchoolCount: number;
  /** player.utrProfileLink — real, from /settings' Profile tab. */
  utrProfileLink: string | null | undefined;
  /** Real count of target schools marked emailed/replied+ in coach_outreach. */
  contactedOrRepliedCount: number;
  now?: Date;
}

const NCAA_CAVEAT =
  "General NCAA contact-period guidance, not sport-specific to tennis — rules change; confirm the current calendar at ncaa.org.";

/** The fixed set of default checklist items — every date computed for real
 * from `context.graduationYear`, nothing hardcoded to a specific year. */
export function buildDefaultRecruitingChecklist(
  context: RecruitingChecklistContext
): RecruitingChecklistDefaultItem[] {
  const { graduationYear } = context;
  const d1ContactOpen = localDateKey(getD1ContactOpenDate(graduationYear));
  const d1OffCampus = localDateKey(getD1OffCampusContactDate(graduationYear));
  const d1WrittenOffer = localDateKey(getD1WrittenOfferDate(graduationYear));
  const d3OffCampus = localDateKey(getD3OffCampusContactDate(graduationYear));
  const d3OfficialVisit = localDateKey(getD3OfficialVisitDate(graduationYear));

  return [
    {
      id: "ncaa-eligibility",
      label: "Register with the NCAA Eligibility Center",
      category: "eligibility",
      dueDate: null,
      note: "Available anytime — do this as early as freshman or sophomore year at web3.ncaa.org/ecwr3.",
      autoDone: null,
    },
    {
      id: "target-list",
      label: `Build your target list — ${context.targetSchoolCount} school${context.targetSchoolCount === 1 ? "" : "s"} starred`,
      category: "targets",
      dueDate: null,
      note: "Star schools anywhere in the app (Schools, School Profile, or right below) to add them here.",
      autoDone: context.targetSchoolCount > 0,
    },
    {
      id: "utr-profile-link",
      label: "Add your UTR profile link",
      category: "profile",
      dueDate: null,
      note: context.utrProfileLink
        ? "Linked on your Settings → Profile tab."
        : "Add it on Settings → Profile so coaches can verify your rating.",
      autoDone: Boolean(context.utrProfileLink),
    },
    {
      id: "highlight-video",
      label: "Put together a highlight video",
      category: "highlight",
      dueDate: null,
      note: "Not tracked automatically yet — check this off once you have a link to send coaches.",
      autoDone: null,
    },
    {
      id: "camps-showcases",
      label: "Research camps & showcases for your grad year",
      category: "camps",
      dueDate: null,
      note: "No specific camp dates tracked here — look at schools' own camp pages and regional showcases for your grad year.",
      autoDone: null,
    },
    {
      id: "d1-contact-open",
      label: "D1: coaches can start emailing & calling you",
      category: "outreach",
      division: "D1",
      dueDate: d1ContactOpen,
      note: NCAA_CAVEAT,
      autoDone: null,
    },
    {
      id: "d1-offcampus-contact",
      label: "D1: off-campus contact, official & unofficial visits with staff can begin",
      category: "visits",
      division: "D1",
      dueDate: d1OffCampus,
      note: NCAA_CAVEAT,
      autoDone: null,
    },
    {
      id: "d1-written-offer",
      label: "D1: coaches can make written offers of athletic aid",
      category: "outreach",
      division: "D1",
      dueDate: d1WrittenOffer,
      note: NCAA_CAVEAT,
      autoDone: null,
    },
    {
      id: "d3-offcampus-contact",
      label: "D3: in-person off-campus contact can begin",
      category: "visits",
      division: "D3",
      dueDate: d3OffCampus,
      note: NCAA_CAVEAT,
      autoDone: null,
    },
    {
      id: "d3-official-visit",
      label: "D3: official visits can begin",
      category: "visits",
      division: "D3",
      dueDate: d3OfficialVisit,
      note: NCAA_CAVEAT,
      autoDone: null,
    },
    {
      id: "d3-unofficial-visit",
      label: "D3: unofficial visits are unrestricted",
      category: "visits",
      division: "D3",
      dueDate: null,
      note: "No calendar gate for D3 unofficial visits — you can take one anytime.",
      autoDone: null,
    },
    {
      id: "coach-emails",
      label: `Send your first coach emails & follow-ups — ${context.contactedOrRepliedCount} contacted`,
      category: "outreach",
      dueDate: d1ContactOpen,
      note: "D1 coaches can't correspond before the date above; D3 coaches have no such gate, so you can email them anytime.",
      autoDone: context.contactedOrRepliedCount > 0,
    },
  ];
}

export interface CustomRecruitingChecklistItem {
  id: string;
  label: string;
}

/** Real persisted state (lib/db/plan.ts) merged over
 * the computed defaults above. */
export interface RecruitingChecklistState {
  completedIds: string[];
  hiddenIds: string[];
  customItems: CustomRecruitingChecklistItem[];
}

export interface MergedRecruitingChecklistItem {
  id: string;
  label: string;
  category: RecruitingChecklistCategory;
  division?: "D1" | "D3";
  dueDate: string | null;
  note: string;
  isCustom: boolean;
  completed: boolean;
  hidden: boolean;
  /** False for items with a real autoDone signal — their checkbox reflects
   * real app data and isn't independently user-toggleable. */
  editable: boolean;
}

/**
 * Combines the computed defaults with a player's real persisted
 * completed/hidden/custom state into one render-ready list. Pure — the
 * actual Supabase read/write lives in lib/db/plan.ts;
 * this function only ever merges, never fetches.
 */
export function mergeRecruitingChecklist(
  context: RecruitingChecklistContext,
  state: RecruitingChecklistState
): MergedRecruitingChecklistItem[] {
  const defaults = buildDefaultRecruitingChecklist(context);
  const completed = new Set(state.completedIds);
  const hidden = new Set(state.hiddenIds);

  const defaultItems: MergedRecruitingChecklistItem[] = defaults.map((item) => ({
    id: item.id,
    label: item.label,
    category: item.category,
    division: item.division,
    dueDate: item.dueDate,
    note: item.note,
    isCustom: false,
    completed: item.autoDone ?? completed.has(item.id),
    hidden: hidden.has(item.id),
    editable: item.autoDone == null,
  }));

  const customItems: MergedRecruitingChecklistItem[] = state.customItems.map((item) => ({
    id: item.id,
    label: item.label,
    category: "custom",
    dueDate: null,
    note: "",
    isCustom: true,
    completed: completed.has(item.id),
    hidden: hidden.has(item.id),
    editable: true,
  }));

  return [...defaultItems, ...customItems];
}
