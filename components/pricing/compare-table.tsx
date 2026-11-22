import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIERS, TIER_NAME, compareGroups, type CompareCell } from "./pricing-data";

// Board 19's "Compare every feature". Every row and every cell comes from
// compareGroups() — which reads FEATURE_TIER and the free-tier limit — so
// nothing in this file decides which plan gets what. pricing-data.test.ts
// fails the build if this file stops rendering from compareGroups(), or if
// FEATURE_TIER gains a key the table does not show.
//
// Sticky header: the card clips with `overflow-clip`, not `overflow-hidden`
// (hidden makes the card a scroll container, and a sticky cell sticks to
// its nearest scroll container — the card, which never scrolls). The table
// fits a 343px phone column without scrolling sideways, for the same reason.

export function CompareTable() {
  const groups = compareGroups();

  return (
    <div className="overflow-clip rounded-xl border border-line bg-card">
      <table className="w-full table-fixed border-separate border-spacing-0 text-left">
        <caption className="sr-only">What each plan includes</caption>
        <colgroup>
          {/* 40% at 375 (was 34%): feature names wrapped to 3–4 lines while
              the plan columns had room to spare (final-check B19). */}
          <col className="w-[40%] sm:w-[46%]" />
          <col />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className={cn(stickyHead, "px-3 text-left sm:px-6")}
            >
              <span className="sr-only">Feature</span>
            </th>
            {TIERS.map((t) => (
              <th
                key={t}
                scope="col"
                className={cn(
                  stickyHead,
                  "px-1 text-center font-seeded text-[15px] font-semibold sm:px-2 sm:text-base",
                  t === "player" ? "text-grass" : "text-ink"
                )}
              >
                {TIER_NAME[t]}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map(({ group, rows }) => (
          <tbody key={group}>
            <tr>
              <th
                scope="rowgroup"
                colSpan={TIERS.length + 1}
                className="border-b border-line bg-cream px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-stone sm:px-6"
              >
                {group}
              </th>
            </tr>
            {rows.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-b border-line px-3 py-3.5 text-left text-sm font-normal leading-snug text-ink sm:px-6 sm:text-[15px]"
                >
                  {row.label}
                </th>
                {TIERS.map((t) => (
                  <td key={t} className="border-b border-line px-1 py-3.5 text-center sm:px-2">
                    <CellContent cell={row.cells[t]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// bg-card so rows scroll underneath it; the bottom rule is a shadow because a
// border on a sticky cell scrolls away with the row in some engines. Signed-
// in phones have the app's 56px sticky bar (html[data-session], set by the
// head script in app/layout.tsx), so the header parks under it there.
const stickyHead =
  "sticky top-0 z-10 bg-card py-4 shadow-[inset_0_-1px_0_rgb(var(--c-line))] [html[data-session]_&]:top-14 lg:[html[data-session]_&]:top-0";

function CellContent({ cell }: { cell: CompareCell }) {
  if (cell.kind === "text") {
    return <span className="text-xs font-medium leading-tight tabular-nums text-ink sm:text-sm">{cell.value}</span>;
  }
  if (cell.included) {
    return (
      <span role="img" aria-label="Included" className="inline-flex">
        <Check aria-hidden className="h-5 w-5 text-grass" strokeWidth={2.25} />
      </span>
    );
  }
  return (
    <span role="img" aria-label="Not included" className="text-stone">
      —
    </span>
  );
}
