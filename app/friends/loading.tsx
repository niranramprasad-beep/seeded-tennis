import { Skeleton } from "@/components/ui/skeleton";

export default function FriendsLoading() {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <Skeleton className="h-3 w-24 rounded-pill" />
      <Skeleton className="mt-4 h-10 w-64 max-w-full" />
      <Skeleton className="mt-6 h-12 w-full max-w-md" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
