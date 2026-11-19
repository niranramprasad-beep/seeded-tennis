import type { DailyCheckin } from "@/lib/db/plan";
import { localDateKey, parseLocalDate } from "@/lib/time";
import { cn, plural } from "@/lib/utils";

// Mood 1–5 as five steps of the primary colour (tokens only). No check-in
// is an outlined empty square, so "nothing logged" never reads as "low".
export const MOOD_CLASS: Record<number, string> = {
  1: "bg-grass-50",
  2: "bg-grass-100",
  3: "bg-grass/40",
  4: "bg-grass/70",
  5: "bg-grass",
};

/** The last `days` days as a grid of squares that always fits its
 * container: the columns are fractions, not fixed pixels, so it fills a
 * 272px drawer at 320px and a wide page alike. (It used to be fixed-size
 * squares beside a fixed 220px column, and the legend fell off the right.) */
export function CheckinHeatmap({
  checkins,
  days = 30,
  columns = 10,
  className,
}: {
  checkins: DailyCheckin[];
  days?: number;
  columns?: number;
  className?: string;
}) {
  const byDate = new Map(checkins.map((c) => [c.date, c]));
  const today = new Date();
  const cells = Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i));
    const key = localDateKey(d);
    return { key, checkin: byDate.get(key) };
  });
  const logged = cells.filter((c) => c.checkin).length;

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`${plural(logged, "check-in", "check-ins")} in the last ${plural(days, "day", "days")}`}
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {cells.map(({ key, checkin }) => (
          <span
            key={key}
            title={`${parseLocalDate(key).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${
              checkin ? `mood ${checkin.mood} of 5` : "no check-in"
            }`}
            className={cn(
              "aspect-square rounded-[4px]",
              checkin ? MOOD_CLASS[checkin.mood] ?? "bg-grass/40" : "border border-line bg-card"
            )}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone" aria-hidden>
        <span>Mood 1</span>
        <span className="flex gap-1">
          {[1, 2, 3, 4, 5].map((m) => (
            <span key={m} className={cn("h-3 w-3 rounded-[3px]", MOOD_CLASS[m])} />
          ))}
        </span>
        <span>5</span>
        <span className="ml-auto flex items-center gap-1">
          <span className="h-3 w-3 rounded-[3px] border border-line bg-card" />
          No check-in
        </span>
      </div>
    </div>
  );
}
