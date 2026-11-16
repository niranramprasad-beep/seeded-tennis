"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronDown, Search } from "lucide-react";
import type { Division, Gender, School } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import {
  explainSchoolFit,
  schoolUtrRange,
  summerBeforeSeniorYear,
  utrToPct,
  type SchoolFitBand,
} from "@/lib/school-fit";
import { loadUtrEntries } from "@/lib/db/plan";
import { UTR_RANGE_SOURCE_LABEL } from "@/lib/db/schools";
import { regionForState, ALL_REGIONS, type SchoolRegion } from "@/lib/school-regions";
import { academicTier, ACADEMIC_TIER_LABEL, type AcademicTier } from "@/lib/school-academics";
import { sortSchoolsForSeeded, SEEDED_SORT_LABEL, type SeededSchoolSort } from "@/lib/school-sort";
import { isEditableTarget } from "@/lib/keyboard-shortcuts";
import { useWhatIfUtr } from "@/lib/hooks/use-what-if-utr";
import { useFitReport } from "@/lib/hooks/use-fit-report";
import { resolveFamilyPlayerFacts } from "@/lib/family-view";
import { loadFamilyMembers, type FamilyMember } from "@/lib/db/family";
import { useStarSchools, STAR_TOAST_DURATION_MS } from "@/lib/hooks/use-star-schools";
import { GenderToggle } from "@/components/shared/gender-toggle";
import { FitBadge, type FitBand } from "@/components/seeded/ui/fit-badge";
import { DataChip, type DataChipStatus } from "@/components/seeded/ui/data-chip";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { StarButton } from "@/components/seeded/ui/star-button";
import { Toast } from "@/components/seeded/ui/toast";
import { WhatIfPanel } from "@/components/seeded/ui/what-if-panel";
import { Drawer } from "@/components/ui/drawer";
import { cn, hasRealUtr } from "@/lib/utils";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 font-sans text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30 sm:h-10";

type ChipFilter = "all" | FitBand | "saved";

// Neither School (lib/types.ts) nor any loader has a real "openings" or
// "data verification" field yet — every row genuinely has nothing to show
// here today, which is why both the Openings and Data table columns always
// render "Not tracked". These two tiny lookups are the single real source
// each column's value comes from, so the moment either field is added to
// the catalog, branching on it here is the only change needed — the
// column-hiding logic below (which reads these, not a hardcoded flag) picks
// it up automatically.
interface ColumnChip {
  status: DataChipStatus;
  label: string;
}
const NOT_TRACKED: ColumnChip = { status: "missing", label: "Not tracked" };
function openingsChip(_s: School): ColumnChip {
  return NOT_TRACKED;
}
function dataVerificationChip(_s: School): ColumnChip {
  return NOT_TRACKED;
}

// localStorage persistence for this page's filters — same read-on-mount /
// write-on-change pattern as design-context.tsx and gender-context.tsx.
// Gender itself already persists globally via gender-context.tsx, so it's
// deliberately not duplicated here.
const SCHOOLS_FILTERS_STORAGE_KEY = "seeded.schools.filters";
const CHIP_VALUES: ChipFilter[] = ["all", "reach", "target", "likely", "out-of-range", "saved"];
interface StoredSchoolsFilters {
  division?: string;
  maxRank?: number;
  query?: string;
  region?: string;
  chip?: string;
  sort?: string;
}

interface Props {
  gender: Gender;
  setGender: (g: Gender) => void;
  /** Whether the visitor picked the side themselves (gender-context). */
  genderIsExplicit: boolean;
  query: string;
  setQuery: (v: string) => void;
  division: "all" | Division;
  setDivision: (v: "all" | Division) => void;
  maxRank: number;
  setMaxRank: (v: number) => void;
  ranked: School[];
  divisions: Division[];
  reset: () => void;
  /** Full, unfiltered catalog (both genders) — used only as the real
   * candidate pool for "Why this band"'s alternative-school suggestion
   * (lib/school-fit.ts's explainSchoolFit), so a narrowed `ranked` list
   * (division/search/rank filters applied) never limits which real schools
   * can be suggested as realistic alternatives. */
  allSchools: School[];
}

// Pixel-exact to Schools.dc.html. Owns no base filter/sort state (that's
// still the parent SchoolsBrowser's, shared with Legacy) — only the
// Seeded-exclusive additions: region, the fit-band chip row, the what-if
// slider/sort (lib/school-sort.ts — new Seeded-only sort modes that need
// the real fit-band math Legacy has no use for), compare selection, star-
// to-target, and the `/`/`j`/`k`/`s` keyboard shortcuts, none of which
// Legacy has any use for.
export function SeededSchoolsBrowser({
  gender,
  setGender,
  genderIsExplicit,
  query,
  setQuery,
  division,
  setDivision,
  maxRank,
  setMaxRank,
  ranked,
  divisions,
  reset,
  allSchools,
}: Props) {
  const { player, updatePlayer } = usePlayer();
  const [region, setRegion] = useState<"all" | SchoolRegion>("all");
  const [chip, setChip] = useState<ChipFilter>("all");
  const [sort, setSort] = useState<SeededSchoolSort>("default");
  const [compareSlugs, setCompareSlugs] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { isStarred, toggleStar, toast, dismissToast } = useStarSchools();

  // Same "utr-entries" SWR key /today and /plan already fetch under — a
  // real cache hit here, not a second network round-trip, whenever one of
  // those has already loaded this session.
  const { data: utrEntries } = useSWR("utr-entries", () => loadUtrEntries());
  const realUtrHistory = useMemo(
    () => (utrEntries ?? []).map((e) => ({ date: new Date(e.recordedAt), utr: e.utr })),
    [utrEntries]
  );

  // The "what if my UTR is ___ by June {year}?" slider — defaults to the
  // player's real current UTR (identical to today's page until actually
  // touched), and from then on drives every band/count/dot below in place
  // of the real currentUTR. See lib/what-if-utr.ts for why only "My pace"
  // mode re-passes real history into the 4-band classifier.
  const whatIf = useWhatIfUtr({
    currentUTR: player.currentUTR,
    graduationYear: player.graduationYear,
    gender: player.gender,
    utrHistory: realUtrHistory,
  });
  const effectiveUtr = whatIf.hypotheticalUTR;

  // A signed-out visitor, or anyone who has never logged a rating, carries
  // the `currentUTR <= 0` sentinel. `hasRealUtr` is the ONLY thing that may
  // decide whether anything derived from it is shown — see the placeholder
  // section of CLAUDE.md. Before this guard the page computed every band
  // against 0, so a first-time visitor was told "Reach 37 · Target 0 ·
  // Likely 0" and every row read "You 0.0", which is both a fabricated
  // number and a wrong answer: 0 is below every team floor, so the
  // classifier honestly reports "reach" for the entire catalogue.
  //
  // With no rating we show the catalogue and no fit at all. Not a zero, not
  // an empty band, not a greyed-out guess — no fit.
  const hasUtr = hasRealUtr(effectiveUtr);

  // The rating, or null. Declared before anything that could want a
  // number, because it is the only number any of them may have.
  //
  // A verifier defeated the previous arrangement in one line: `bandFor`
  // took the raw `effectiveUtr` behind a `hasUtr ?`, so swapping that for
  // `hasUtr ? effectiveUtr : player.currentUTR` — a plausible "don't leave
  // the rows blank" fallback — put "Reach" back on all 37 rows with the
  // whole suite green. Every assertion still passed: one classify call, a
  // `hasUtr ?` in the window before it, a `| null` return type that never
  // returned null.
  //
  // The fix is to take the number away. `classifySchoolFit` is now reached
  // only through `youUtr`, which is `number | null`, so the un-gated
  // fallback does not typecheck — `player.currentUTR` is a `number` and
  // cannot be assigned to it without re-introducing a null check. The
  // compiler enforces it; the test only stops someone removing the seam.
  const youUtr: number | null = hasUtr ? effectiveUtr : null;

  // The rating the BANDS are judged against, and the rating to plot. For a
  // player that is their own (or their what-if choice); for a parent it is
  // their child's, because the parent has none and the page is about the
  // child. Null when there is no usable rating at all — then the page
  // shows the catalogue and no fit, as before.
  //
  // `hasFit` replaces `hasUtr` as the gate for the chips, the sort and the
  // prompt: a parent HAS a fit to show while having no rating of their
  // own, and gating on the viewer's rating gave them bands with no marker
  // and an "Enter your UTR" prompt addressed to the wrong person.

  // THE ONLY PLACE THIS FILE IS ALLOWED TO CLASSIFY A SCHOOL.
  //
  // The gate used to be repeated at each of three call sites, and an
  // independent verifier found the third one ungated after the other two
  // were fixed — the Compare drawer rendered "Reach" for a visitor with no
  // rating, 110 lines below the guard that was supposed to have removed
  // every band on the page. Repeating a condition is how you eventually
  // forget it.
  //
  // So there is one call site, it returns `null` without a rating, and
  // `FitBadge` cannot render a null band. A fourth caller added later gets
  // the gate for free. lib/schools-neutral-without-utr.test.ts fails the
  // build if `classifySchoolFit` is ever called anywhere else in this file.
  // The report is the authority now; this file no longer classifies at
  // all. `overrideUtr` carries the what-if slider's explicit choice, which
  // is already a future rating and must not be projected a second time
  // (see buildFitReport). With the slider untouched it equals the player's
  // own rating, so the bands here are the same ones /today and the fit
  // report show.
  // A PARENT's own nav links here ("Schools" in PARENT_NAV_LINKS), and a
  // parent has no UTR of their own — so this page banded 37 programs
  // against nothing and showed "Not tracked" all the way down, while the
  // Overview tab beside it said "Bailey's recruiting". The one page a
  // parent would open to understand their child's options told them
  // nothing about their child. Found by walking persona (f).
  //
  // Same resolver the family overview uses, so the two screens cannot
  // disagree about who the player is or what their rating is.
  const { data: familyMembers = [] } = useSWR<FamilyMember[]>(
    player.role === "parent" ? "family-members" : null,
    () => loadFamilyMembers()
  );
  const playerFacts = useMemo(
    () => resolveFamilyPlayerFacts(familyMembers.find((m) => m.role === "player"), player),
    [familyMembers, player]
  );
  const viewingAsParent = player.role === "parent" && playerFacts.hasLinkedPlayer;

  // A parent browsing their child's fit must be looking at their child's
  // side of the catalogue. GenderProvider seeds from the SIGNED-IN user's
  // profile, which for a parent is the parent — so after the parent-view
  // fix this page said "Sorted by fit for Bailey · 37 men's programs" and
  // banded her 9.40 against men's rosters. Only overrides a side the
  // visitor has not picked themselves.
  useEffect(() => {
    if (!viewingAsParent || genderIsExplicit) return;
    const want: Gender | null =
      playerFacts.gender === "female" ? "women" : playerFacts.gender === "male" ? "men" : null;
    if (want && want !== gender) setGender(want);
  }, [viewingAsParent, genderIsExplicit, playerFacts.gender, gender, setGender]);
  const subjectName = viewingAsParent
    ? familyMembers.find((m) => m.role === "player")?.name?.split(" ")[0] ?? "your player"
    : null;

  // `overrideUtr` is for an EXPLICIT what-if choice only.
  //
  // It used to be `viewingAsParent ? null : youUtr`, and `youUtr` is the
  // slider's value, which `resolveWhatIfDisplay` returns as the player's
  // own rating when the slider has never been touched. buildFitReport
  // treats any non-null override as a deliberate choice — basis "current",
  // no projection — so EVERY signed-in player was judged on today's rating
  // here while /today, /outreach and /family projected to junior year.
  // That is Workstream A's bug, reintroduced one line below a comment
  // claiming the opposite. `isAtRealCurrent` is the hook's own signal that
  // nobody has moved the slider.
  const explicitWhatIf = whatIf.isAtRealCurrent ? null : youUtr;
  const playerUserId = viewingAsParent
    ? (familyMembers.find((m) => m.role === "player")?.id ?? null)
    : null;

  const report = useFitReport({
    player: viewingAsParent
      ? {
          currentUTR: playerFacts.currentUtr ?? 0,
          graduationYear: playerFacts.graduationYear ?? player.graduationYear,
          gender: playerFacts.gender ?? player.gender,
        }
      : player,
    schools: ranked,
    overrideUtr: viewingAsParent ? null : explicitWhatIf,
    // A parent's Reach/Out-of-range split must come from the CHILD's
    // logged history, not their own.
    historyUserId: playerUserId,
  });

  const judgingUtr: number | null = report?.utr.value ?? null;
  const subjectTodayUtr: number | null = viewingAsParent
    ? (playerFacts.currentUtr ?? null)
    : youUtr;
  const hasFit = report != null;

  const bandFor = useCallback(
    (s: School): SchoolFitBand | null => report?.bandBySlug.get(s.slug) ?? null,
    [report]
  );

  // Same real grad-year context as the what-if hook, plus the full catalog
  // — explainSchoolFit only needs the catalog for its point-7 alternative-
  // school suggestion. Uses the SAME history choice as the what-if pass
  // (real history only for "My pace"), so the expanded row's "why this
  // band" never disagrees with the band chip right above it.
  const explanationInput = useMemo(
    () => ({
      // Always defined since P1-FIT-1 — see the same note in
      // seeded-roadmap-layout.tsx.
      utrHistory: whatIf.whatIfProjection.utrHistory,
      graduationYear: player.graduationYear,
      gender: player.gender,
      catalog: allSchools,
    }),
    [whatIf.whatIfProjection, player.graduationYear, player.gender, allSchools]
  );

  // A school's profile page links here with ?compare={slug}&gender={gender}
  // to pre-select it (same plain window.location.search read
  // coaches-view.tsx already uses for its own ?school= deep link — no
  // useSearchParams()/Suspense needed). `ranked` is already gender-filtered
  // by the parent, so a cross-gender deep link (e.g. from a women's program
  // page while this defaults to men's) would silently fail a `ranked`
  // membership check — the slug's own data-file suffix convention isn't
  // reliable enough to infer gender from (schools.ts has no suffix for
  // men, schools-extra.ts uses "-m"), so the profile page passes the
  // school's real `gender` explicitly and this switches the toggle to
  // match before trusting the slug.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("compare");
    const g = params.get("gender");
    if (!slug) return;
    if ((g === "men" || g === "women") && g !== gender) setGender(g);
    setCompareSlugs((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restores division/region/academics/search/sort/chip from a previous
  // visit — same localStorage read-on-mount pattern as design-context.tsx.
  // `filtersHydrated` gates the write effect below so it can't fire first
  // with the pre-restore defaults and stomp on what's actually saved (the
  // same guard training-view.tsx uses for its own local draft state).
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SCHOOLS_FILTERS_STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as StoredSchoolsFilters;
        if (stored.division === "all" || divisions.includes(stored.division as Division)) {
          setDivision(stored.division as "all" | Division);
        }
        if (typeof stored.maxRank === "number" && Number.isFinite(stored.maxRank)) {
          setMaxRank(stored.maxRank);
        }
        if (typeof stored.query === "string") setQuery(stored.query);
        if (stored.region === "all" || ALL_REGIONS.includes(stored.region as SchoolRegion)) {
          setRegion(stored.region as "all" | SchoolRegion);
        }
        if (stored.chip && CHIP_VALUES.includes(stored.chip as ChipFilter)) {
          setChip(stored.chip as ChipFilter);
        }
        if (stored.sort && stored.sort in SEEDED_SORT_LABEL) {
          setSort(stored.sort as SeededSchoolSort);
        }
      }
    } catch {
      // Ignore malformed localStorage and keep the default filters.
    }
    setFiltersHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persists on every change, once restore above has actually run. Keeping
  // this to one effect over the plain primitives below (rather than N
  // separate localStorage.setItem callsites inline in each setter) means
  // this page's full filter state is always what's on disk, from whichever
  // control changed it.
  useEffect(() => {
    if (!filtersHydrated) return;
    try {
      const payload: StoredSchoolsFilters = { division, maxRank, query, region, chip, sort };
      window.localStorage.setItem(SCHOOLS_FILTERS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [filtersHydrated, division, maxRank, query, region, chip, sort]);

  const academicValue: "all" | AcademicTier =
    maxRank <= 25 ? "top25" : maxRank <= 50 ? "top50" : maxRank <= 100 ? "top100" : "all";

  // Not computed at all without a rating — a count derived from the
  // sentinel is a number nobody can defend.
  const counts = report?.counts ?? null;
  const savedSlugs = useMemo(() => new Set(player.targetSchoolSlugs), [player.targetSchoolSlugs]);

  // "gap" and "fit" are both distance-from-your-rating orders. Without a
  // rating they would sort the catalogue by distance from zero — the
  // weakest programs first, presented as if it meant something. The SELECT
  // reads this same value, so the control can never claim an order the
  // list is not in (including one restored from localStorage).
  const safeSort: SeededSchoolSort =
    hasFit || sort === "academics" || sort === "default" ? sort : "default";

  const visible = useMemo(() => {
    const filtered = ranked.filter((s) => {
      if (region !== "all" && regionForState(s.state) !== region) return false;
      if (chip === "saved") return savedSlugs.has(s.slug);
      // A band filter is unreachable from the UI without a rating (the band
      // chips aren't rendered), but localStorage can still hand us one from
      // a previous signed-in session — so it is ignored rather than applied
      // against the sentinel, which would have hidden the whole catalogue.
      else if (hasFit && chip !== "all" && bandFor(s) !== chip) return false;
      return true;
    });
    return sortSchoolsForSeeded(filtered, safeSort, effectiveUtr, whatIf.whatIfProjection);
  }, [ranked, region, chip, safeSort, hasFit, effectiveUtr, bandFor, whatIf.whatIfProjection, savedSlugs]);

  // A materially different list (a filter/sort change) invalidates
  // whatever row the keyboard highlight was pointing at.
  useEffect(() => {
    setHighlightedIndex(null);
  }, [region, chip, sort, query, division, maxRank, gender]);

  // `/` focuses search, `j`/`k` move the highlighted row, `s` stars/
  // unstars it — all guarded so typing in the search box (or any other
  // text input) never triggers them. See lib/keyboard-shortcuts.ts.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "j" || e.key === "k") {
        if (visible.length === 0) return;
        e.preventDefault();
        setHighlightedIndex((prev) => {
          const base = prev == null ? -1 : prev;
          const next = e.key === "j" ? base + 1 : base - 1;
          return Math.min(Math.max(next, 0), visible.length - 1);
        });
      } else if (e.key === "s") {
        if (highlightedIndex == null) return;
        const s = visible[highlightedIndex];
        if (!s) return;
        e.preventDefault();
        toggleStar(s.slug, s.shortName);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, highlightedIndex, toggleStar]);

  const safeHighlightIndex =
    highlightedIndex != null && highlightedIndex < visible.length ? highlightedIndex : null;

  const toggleCompare = (slug: string) => {
    setCompareSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : prev.length >= 3 ? prev : [...prev, slug]
    );
  };

  // Bulk action from the compare tray (an earlier phase) — kept as its own
  // single merge+write rather than N individual toggleStar() calls, which
  // would race against each other (each one's closure reads the same
  // pre-loop membership snapshot). Still the exact same real
  // targetSchoolSlugs/updatePlayer() mechanism; a bulk add reasonably gets
  // one bulk write, not N stacked per-item undo toasts.
  const saveSelectedToTargets = () => {
    const merged = Array.from(new Set([...player.targetSchoolSlugs, ...compareSlugs]));
    updatePlayer({ targetSchoolSlugs: merged });
  };

  const compareSchools = ranked.filter((s) => compareSlugs.includes(s.slug));

  // Live against the actual rendered rows (`visible`, after every active
  // filter), re-evaluated on every render — not a one-time decision. Hides
  // a column only when EVERY visible row's real value for it is still
  // "Not tracked"; the instant openingsChip()/dataVerificationChip() above
  // have a real field to branch on for even one row, these flip back to
  // true and the column reappears with no further changes needed here.
  const showOpenings = visible.some((s) => openingsChip(s).label !== "Not tracked");
  const showDataCol = visible.some((s) => dataVerificationChip(s).label !== "Not tracked");
  // Inline style, not a Tailwind arbitrary-value class — the set of
  // columns (and therefore the template) is only known at runtime, so a
  // dynamically-built `grid-cols-[...]` string wouldn't be visible to
  // Tailwind's build-time class scanner.
  const tableGridTemplate = [
    "28px",
    "28px",
    "minmax(0,2.2fr)",
    "100px",
    "minmax(0,2fr)",
    ...(showOpenings ? ["80px"] : []),
    "90px",
    ...(showDataCol ? ["110px"] : []),
  ].join(" ");
  const genderLabel = gender === "men" ? "men's" : "women's";
  const hiddenColumnNote =
    !showOpenings && !showDataCol
      ? `Openings and verification status aren't tracked yet for any ${genderLabel} program shown — those columns reappear automatically once we have real data.`
      : !showOpenings
        ? `Openings aren't tracked yet for any ${genderLabel} program shown — that column reappears automatically once we have real data.`
        : !showDataCol
          ? `Verification status isn't tracked yet for any ${genderLabel} program shown — that column reappears automatically once we have real data.`
          : null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-seeded text-[30px] font-semibold tracking-tight text-ink">Schools</h1>
          {/* "Sorted by fit for you" is only true once there is a rating to
              sort against — without one the order is the catalogue's own. */}
          <p className="mt-1.5 text-stone">
            {report
              ? viewingAsParent
                ? `Sorted by fit for ${subjectName}. `
                : "Sorted by fit for you. "
              : ""}
            {ranked.length} {genderLabel} programs.
          </p>
        </div>
        <label className="flex w-full max-w-[360px] flex-col gap-1.5 text-xs font-medium text-stone">
          Search
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-light" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="School, city or conference"
              className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30"
            />
          </div>
        </label>
      </div>

      <div className="mt-5">
        {hasUtr && !viewingAsParent ? (
          <WhatIfPanel {...whatIf} seniorSummerYear={summerBeforeSeniorYear(player.graduationYear).getFullYear()} />
        ) : viewingAsParent ? (
          // A parent has no rating of their own and the slider is not for
          // them. The prompt below is addressed to a player, so showing it
          // here asked the wrong person for the wrong thing.
          <div className="rounded-xl border border-dashed border-line bg-cream/60 px-[18px] py-4">
            <p className="m-0 text-[15px] text-stone">
              Fit is shown for {subjectName}, using the rating on their profile. You
              can&rsquo;t change it from here &mdash; this view is read-only.
            </p>
          </div>
        ) : (
          // The what-if slider is "what if my rating were X by June" — it
          // has nothing to move from without a rating, and rendering it
          // anyway is what put a 0.0 on the screen.
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line bg-cream/60 px-[18px] py-4">
            <p className="m-0 text-[15px] text-ink">
              <strong className="font-semibold">Enter your UTR to see your fit.</strong>{" "}
              <span className="text-stone">
                Every program below is listed either way — fit bands need a rating to compare against.
              </span>
            </p>
            <Link
              href="/onboarding"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-grass px-[18px] font-sans text-[15px] font-semibold text-on-primary hover:bg-grass-600"
            >
              Enter my UTR
            </Link>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <ChipButton active={chip === "all" || (!hasFit && chip !== "saved")} onClick={() => setChip("all")} variant="dark">
            All {ranked.length}
          </ChipButton>
          {counts && (
            <>
              <ChipButton active={chip === "reach"} onClick={() => setChip("reach")} variant="reach">
                Reach {counts.reach}
              </ChipButton>
              <ChipButton active={chip === "target"} onClick={() => setChip("target")} variant="target">
                Target {counts.target}
              </ChipButton>
              <ChipButton active={chip === "likely"} onClick={() => setChip("likely")} variant="likely">
                Likely {counts.likely}
              </ChipButton>
              <ChipButton
                active={chip === "out-of-range"}
                onClick={() => setChip("out-of-range")}
                variant="outOfRange"
              >
                Out of range {counts.outOfRange}
              </ChipButton>
            </>
          )}
          <ChipButton active={chip === "saved"} onClick={() => setChip("saved")} variant="plain">
            Saved {savedSlugs.size}
          </ChipButton>
        </div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-stone">
          Sort
          {/* "Gap (closest first)" and "Fit (band order)" both order the
              list by distance from YOUR rating, so without one they fall
              back to the default order. The control used to accept them
              anyway: it showed "Gap" as selected, persisted it, and left
              the rows in catalogue order — the dropdown asserting something
              about the list that was not true, which is the same class of
              problem as a fabricated band. They are disabled instead, with
              the reason given rather than left to be guessed at. */}
          <select
            value={safeSort}
            onChange={(e) => setSort(e.target.value as SeededSchoolSort)}
            className="h-11 rounded-lg border border-input bg-card px-2 font-sans text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-grass/30 sm:h-8"
          >
            {Object.entries(SEEDED_SORT_LABEL).map(([key, label]) => {
              const needsUtr = key === "gap" || key === "fit";
              return (
                <option key={key} value={key} disabled={needsUtr && !hasFit}>
                  {label}
                  {needsUtr && !hasFit ? " — needs a UTR" : ""}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {/* Full-width bar, above the table (not a sidebar beside it) — a
          narrow sidebar here used to cut off select text (e.g. "All" as
          "Al"); every control below gets real room for its full label. */}
      <div
        className="mt-5 flex flex-wrap items-end gap-4 rounded-xl border border-line bg-card p-[18px]"
        aria-label="Filters"
      >
        <div className="flex flex-col gap-1.5 text-xs font-medium text-stone">
          Gender
          <GenderToggle value={gender} onChange={setGender} />
        </div>
        <label className="flex w-full flex-col gap-1.5 text-xs font-medium text-stone sm:w-auto sm:min-w-[200px] sm:flex-1">
          Division
          <select value={division} onChange={(e) => setDivision(e.target.value as "all" | Division)} className={selectClass}>
            <option value="all">All divisions</option>
            {divisions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="flex w-full flex-col gap-1.5 text-xs font-medium text-stone sm:w-auto sm:min-w-[200px] sm:flex-1">
          Region
          <select value={region} onChange={(e) => setRegion(e.target.value as "all" | SchoolRegion)} className={selectClass}>
            <option value="all">All regions</option>
            {ALL_REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex w-full flex-col gap-1.5 text-xs font-medium text-stone sm:w-auto sm:min-w-[200px] sm:flex-1">
          Academics
          <select
            value={academicValue}
            onChange={(e) => {
              const v = e.target.value as "all" | AcademicTier;
              setMaxRank(v === "all" ? 150 : v === "top25" ? 25 : v === "top50" ? 50 : 100);
            }}
            className={selectClass}
          >
            <option value="all">Any ranking</option>
            <option value="top25">{ACADEMIC_TIER_LABEL.top25} national</option>
            <option value="top50">{ACADEMIC_TIER_LABEL.top50} national</option>
            <option value="top100">{ACADEMIC_TIER_LABEL.top100} national</option>
          </select>
        </label>
        {(region !== "all" || division !== "all" || maxRank < 150 || query) && (
          <button
            onClick={() => {
              reset();
              setRegion("all");
            }}
            className="h-10 shrink-0 self-end text-xs font-semibold text-grass"
          >
            Reset filters
          </button>
        )}
      </div>

      <div className="mt-5">
        {hiddenColumnNote && <p className="mb-3 text-xs text-stone-light">{hiddenColumnNote}</p>}

        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <div className="min-w-[760px]">
            <div
              className="grid items-center gap-3.5 border-b border-line px-[18px] py-3 text-xs font-semibold uppercase tracking-wide text-stone"
              style={{ gridTemplateColumns: tableGridTemplate }}
            >
              <span aria-hidden />
              <span aria-hidden />
              <span>Program</span>
              <span>{viewingAsParent ? `${subjectName}\u2019s fit` : "Your fit"}</span>
              {/* The team side of this comparison is an unverified estimate
                  with no source or date (P0-3) — say so in the header rather
                  than repeat it on all ~37 rows. */}
              <span className="normal-case">
                <span className="uppercase">
                  {viewingAsParent ? `${subjectName} vs team UTR` : "You vs team UTR"}
                </span>
                <span className="block font-normal tracking-normal text-stone-light">
                  {UTR_RANGE_SOURCE_LABEL}
                </span>
              </span>
              {showOpenings && <span>Openings</span>}
              <span>Acad.</span>
              {showDataCol && <span>Data</span>}
            </div>
            {visible.map((s, index) => {
              const fit = bandFor(s);
              const range = schoolUtrRange(s);
              const expanded = expandedSlug === s.slug;
              // Only the currently-expanded row actually builds the full
              // explanation (real regression + alternatives lookup) — no
              // reason to pay that cost for every row in the list.
              // Without a rating this produced "Gap to team floor: +9.1"
              // and a "closest schools" list that was just the catalogue's
              // five weakest programs — both measured against the sentinel.
              const explanation =
                expanded && hasUtr ? explainSchoolFit(effectiveUtr, s, explanationInput) : null;
              return (
                <div key={s.id}>
                  {/* The row was `role="button" tabIndex={0}` wrapping a
                      checkbox, a star button and a link — axe's
                      `nested-interactive`, 74 nodes on this page alone, and a
                      genuine mess to hear: a button that contains a checkbox
                      and two links. The expand control is now the chevron,
                      which is a real button with a real name. The row keeps
                      its click as a mouse convenience only.

                      This does not affect the j/k row highlight: that is a
                      window-level handler (see above) and never depended on
                      the row being focusable. */}
                  <div
                    data-keyboard-highlighted={safeHighlightIndex === index || undefined}
                    onClick={() => setExpandedSlug(expanded ? null : s.slug)}
                    style={{ gridTemplateColumns: tableGridTemplate }}
                    className={cn(
                      "grid cursor-pointer items-center gap-3.5 border-b border-line px-[18px] py-3.5 last:border-b-0 hover:bg-cream/40",
                      safeHighlightIndex === index && "bg-cream/70 ring-2 ring-inset ring-grass/40"
                    )}
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Hide" : "Show"} fit detail for ${s.shortName}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedSlug(expanded ? null : s.slug);
                      }}
                      className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md p-2 hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grass/50 sm:-m-1 sm:h-7 sm:w-7 sm:p-1"
                    >
                      <ChevronDown
                        className={cn("h-4 w-4 shrink-0 text-stone-light transition-transform", expanded && "rotate-180")}
                        aria-hidden
                      />
                    </button>
                    {/* 13px tall at 375 — the smallest thing on the page
                        and the one a thumb misses. A native checkbox cannot
                        be grown to 44px without looking wrong, so the LABEL
                        is the tap target: clicking it toggles the control,
                        giving a 44px finger area around a 20px box. */}
                    <label
                      className="-m-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center sm:-m-0 sm:h-auto sm:w-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="sr-only">Compare {s.shortName}</span>
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0 accent-grass sm:h-4 sm:w-4"
                        checked={compareSlugs.includes(s.slug)}
                        onChange={() => toggleCompare(s.slug)}
                        disabled={!compareSlugs.includes(s.slug) && compareSlugs.length >= 3}
                      />
                    </label>
                    <div className="flex min-w-0 items-center gap-1">
                      <StarButton
                        starred={isStarred(s.slug)}
                        onToggle={() => toggleStar(s.slug, s.shortName)}
                        label={s.shortName}
                        className="h-11 w-11 sm:h-7 sm:w-7"
                      />
                      <Link
                        href={`/schools/${s.slug}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex min-h-11 min-w-0 flex-col justify-center text-ink sm:min-h-0"
                      >
                        <p className="truncate text-[15px] font-semibold">{s.shortName}</p>
                        <p className="truncate text-xs text-stone-light">
                          {s.conference} · {s.division} · {s.state}
                        </p>
                      </Link>
                    </div>
                    {fit ? (
                      <FitBadge band={fit} />
                    ) : (
                      <span className="text-[13px] text-stone-light">Not tracked</span>
                    )}
                    <RangeBar
                      rangeStartPct={utrToPct(range.min)}
                      rangeEndPct={utrToPct(range.max)}
                      medianPct={utrToPct(s.avgRosterUTR)}
                      youPct={judgingUtr === null ? null : utrToPct(judgingUtr)}
                      // The team range is real data and shows either way.
                      caption={
                        judgingUtr === null
                          ? `Team ${range.min.toFixed(1)}–${range.max.toFixed(1)}`
                          : `${viewingAsParent ? subjectName : "You"} ${judgingUtr.toFixed(1)} · ${range.min.toFixed(1)}–${range.max.toFixed(1)}`
                      }
                      low={range.min}
                      median={s.avgRosterUTR}
                      high={range.max}
                      you={judgingUtr}
                      youLabel={viewingAsParent ? (subjectName ?? "Player") : "You"}
                    />
                    {showOpenings && (
                      <DataChip status={openingsChip(s).status}>{openingsChip(s).label}</DataChip>
                    )}
                    <DataChip status="updated">{ACADEMIC_TIER_LABEL[academicTier(s.usNewsRanking)]}</DataChip>
                    {showDataCol && (
                      <DataChip status={dataVerificationChip(s).status}>{dataVerificationChip(s).label}</DataChip>
                    )}
                  </div>
                  {expanded && !hasUtr && (
                    <div className="border-b border-line bg-cream/40 px-[18px] py-4 text-sm text-stone last:border-b-0">
                      <p className="m-0">
                        Add your UTR and Seeded will explain where you sit against this
                        team&apos;s range and what would move you up a band.{" "}
                        <Link href="/onboarding" className="font-semibold text-grass underline underline-offset-4 hover:text-grass-700">
                          Enter my UTR
                        </Link>
                      </p>
                    </div>
                  )}
                  {expanded && explanation && (
                    <div className="border-b border-line bg-cream/40 px-[18px] py-4 text-sm text-ink last:border-b-0">
                      <p>{explanation.summary}</p>
                      {explanation.gapToFloor != null && explanation.gapToMedian != null && (
                        <p className="mt-1.5 text-stone">
                          Gap to team floor: {explanation.gapToFloor > 0 ? "+" : ""}
                          {explanation.gapToFloor.toFixed(1)} · Gap to team median:{" "}
                          {explanation.gapToMedian > 0 ? "+" : ""}
                          {explanation.gapToMedian.toFixed(1)}
                        </p>
                      )}
                      {explanation.nextBand && (
                        <p className="mt-1.5">
                          <strong>What would move it: </strong>
                          {explanation.nextBand.message}
                        </p>
                      )}
                      {explanation.unreachable && explanation.alternatives.length > 0 && (
                        <p className="mt-1.5 text-stone">
                          <strong className="text-ink">Consider instead: </strong>
                          {explanation.alternatives.map((a) => a.shortName).join(", ")} — similar academics or
                          region, and realistically in reach today.
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-stone-light">
                        {explanation.playersLeaving} {explanation.academics}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                <p className="text-[15px] font-medium text-ink">No programs match</p>
                <button onClick={() => { reset(); setRegion("all"); setChip("all"); }} className="text-sm font-semibold text-grass">
                  Reset filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {compareSlugs.length > 0 && (
        <div className="sticky bottom-4 mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-[18px] py-3 shadow-card">
          <span className="text-sm text-ink">
            <strong>{compareSlugs.length} selected</strong> · {compareSchools.map((s) => s.shortName).join(", ")}
          </span>
          <span className="flex-1" />
          <button
            onClick={saveSelectedToTargets}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-semibold text-ink"
          >
            Save to targets
          </button>
          <button
            onClick={() => setCompareOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-grass px-4 text-sm font-semibold text-on-primary hover:bg-grass-600"
          >
            Compare side by side
          </button>
        </div>
      )}

      <Drawer open={compareOpen} onClose={() => setCompareOpen(false)} title="Compare schools" widthClass="max-w-xl">
        <div className="flex flex-col gap-4">
          {compareSchools.map((s) => {
            // Gated on hasUtr like every other band on this page. An
            // independent verifier found this one ungated after the rest
            // were fixed: tick two schools, open "Compare side by side",
            // and both cards said "Reach" — the sentinel-derived band,
            // 110 lines below the guard that was supposed to have removed
            // every one of them. A drawer is still the page.
            const fit = bandFor(s);
            return (
              <div key={s.id} className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{s.shortName}</p>
                  {fit ? (
                    <FitBadge band={fit} />
                  ) : (
                    <span className="text-[13px] text-stone-light">Not tracked</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-stone-light">
                  {s.conference} · {s.division} · {s.city}, {s.state}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-stone-light">
                    Avg roster UTR
                    <span className="block text-xs">{UTR_RANGE_SOURCE_LABEL}</span>
                  </dt>
                  <dd className="text-right font-mono tabular-nums text-ink">{s.avgRosterUTR.toFixed(1)}</dd>
                  <dt className="text-stone-light">
                    Min competitive UTR
                    <span className="block text-xs">{UTR_RANGE_SOURCE_LABEL}</span>
                  </dt>
                  <dd className="text-right font-mono tabular-nums text-ink">{s.minCompetitiveUTR.toFixed(1)}</dd>
                  <dt className="text-stone-light">US News ranking</dt>
                  <dd className="text-right font-mono tabular-nums text-ink">#{s.usNewsRanking}</dd>
                </dl>
              </div>
            );
          })}
          {compareSchools.length === 0 && <p className="text-sm text-stone">Select up to 3 schools to compare.</p>}
        </div>
      </Drawer>

      <Toast open={!!toast} onDismiss={dismissToast} action={toast?.action} duration={STAR_TOAST_DURATION_MS}>
        {toast?.message ?? " "}
      </Toast>
    </div>
  );
}

const CHIP_VARIANT: Record<string, { on: string; off: string }> = {
  dark: { on: "bg-ink text-cream border-ink", off: "bg-card text-stone border-line" },
  reach: { on: "bg-[rgb(var(--c-clay-tint-bg))] text-[rgb(var(--c-clay-tint-text))] border-[rgb(var(--c-clay-tint-border))]", off: "bg-card text-stone border-line" },
  target: { on: "bg-grass-50 text-grass border-grass-100", off: "bg-card text-stone border-line" },
  likely: { on: "bg-[rgb(var(--c-sage-tint-bg))] text-[rgb(var(--c-sage-tint-text))] border-[rgb(var(--c-sage-tint-border))]", off: "bg-card text-stone border-line" },
  outOfRange: { on: "bg-ink text-cream border-ink", off: "bg-card text-stone border-line" },
  plain: { on: "bg-ink text-cream border-ink", off: "bg-card text-stone border-line" },
};

function ChipButton({
  active,
  onClick,
  variant,
  children,
}: {
  active: boolean;
  onClick: () => void;
  variant: keyof typeof CHIP_VARIANT;
  children: React.ReactNode;
}) {
  const v = CHIP_VARIANT[variant];
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 text-[13px] font-semibold transition-colors sm:min-h-0 sm:py-1.5",
        active ? v.on : v.off
      )}
    >
      {children}
    </button>
  );
}
