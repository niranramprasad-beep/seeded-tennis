import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl container-px py-10">
      <Skeleton className="h-10 w-48" />
      {/* Appearance card — matches the real 6-option, 2-column theme grid
          shape instead of one flat block, so swapping in the real content
          doesn't suddenly grow the page by several hundred pixels. */}
      <div className="mt-8 rounded-card border-[0.5px] border-line p-6">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-2 h-4 w-56" />
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[76px]" />
          ))}
        </div>
      </div>
      <Skeleton className="mt-4 h-28" />
      <Skeleton className="mt-4 h-28" />
    </div>
  );
}
