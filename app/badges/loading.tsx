import { Skeleton } from "@/components/ui/skeleton";

export default function BadgesLoading() {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-8 w-28 rounded-pill" />
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
