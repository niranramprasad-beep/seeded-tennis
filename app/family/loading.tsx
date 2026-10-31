import { Skeleton } from "@/components/ui/skeleton";

export default function FamilyLoading() {
  return (
    <div className="mx-auto max-w-content container-px py-12">
      <Skeleton className="h-10 w-64 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="mt-4 h-48" />
    </div>
  );
}
