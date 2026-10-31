import { Skeleton } from "@/components/ui/skeleton";

export default function MatchesLoading() {
  return (
    <div className="mx-auto max-w-content container-px py-12">
      <Skeleton className="h-3 w-24 rounded-pill" />
      <Skeleton className="mt-4 h-10 w-72 max-w-full" />
      <div className="mt-6 flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-pill" />
        ))}
      </div>
      <div className="mt-6 grid gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}
