import { Skeleton } from "@/components/ui/skeleton";

export default function FamilyWeeklyReportsLoading() {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <Skeleton className="h-10 w-64 max-w-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
