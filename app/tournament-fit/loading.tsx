import { Skeleton } from "@/components/ui/skeleton";

export default function TournamentFitLoading() {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <Skeleton className="h-3 w-24 rounded-pill" />
      <Skeleton className="mt-4 h-10 w-80 max-w-full" />
      <Skeleton className="mt-3 h-4 w-64 max-w-full rounded-pill" />
      <Skeleton className="mt-8 h-64" />
    </div>
  );
}
