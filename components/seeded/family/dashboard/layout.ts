// The boxes of Board 22, shared by the real dashboard, the paywall's Example
// preview and the loading skeleton. Rule 6: a skeleton has the final
// layout's exact boxes. Keeping the classes in one place is what makes that
// true by construction rather than by eye.

export const PAGE = "mx-auto max-w-content container-px py-10";

/** Eyebrow, H1 and the pill row on the left; the header button on the right. */
export const HEADER = "flex flex-wrap items-end justify-between gap-4";
export const EYEBROW = "seeded-eyebrow h-4 leading-4";
export const H1 = "font-seeded text-[28px] font-bold leading-[36px] tracking-tight text-ink sm:text-[32px] sm:leading-[40px]";
export const PILL_ROW = "mt-3 flex min-h-8 flex-wrap items-center gap-2";

/** 40px heading -> content (rule 7). */
export const KPI_ROW = "mt-10 grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4";
export const KPI_CARD = "flex min-h-[120px] flex-col sm:min-h-[148px] rounded-xl border border-line bg-card p-5";

export const CHART_CARD = "mt-5 rounded-xl border border-line bg-card p-5 sm:p-6";
/** Title + legend row, the 240px plot, caption and note. */
export const CHART_HEAD = "flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-2";
export const CHART_PLOT = "mt-4 h-[240px]";
export const CHART_FOOT = "mt-4 min-h-[56px]";

/** Four equal cards: two rows of two at desktop, every row the same height. */
export const GRID = "mt-5 grid grid-cols-1 items-stretch gap-5 lg:auto-rows-fr lg:grid-cols-2";
export const GRID_CARD = "flex min-h-[240px] min-w-0 flex-col lg:min-h-[340px] rounded-xl border border-line bg-card p-5 sm:p-6";
