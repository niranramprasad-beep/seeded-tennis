import { Skeleton } from "@/components/ui/skeleton";

export default function RoadmapLoading() {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <Skeleton className="h-3 w-24 rounded-pill" />
      <Skeleton className="mt-4 h-10 w-96 max-w-full" />
      <Skeleton className="mt-3 h-4 w-72 max-w-full rounded-pill" />
      <Skeleton className="mt-8 h-80" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}
