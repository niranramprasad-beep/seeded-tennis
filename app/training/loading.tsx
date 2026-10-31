import { Skeleton } from "@/components/ui/skeleton";

export default function TrainingLoading() {
  return (
    <div className="mx-auto max-w-content container-px py-12">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-3 w-24 rounded-pill" />
          <Skeleton className="mt-4 h-10 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="mt-8 grid grid-cols-7 gap-2">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    </div>
  );
}
