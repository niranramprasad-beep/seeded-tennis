import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl container-px py-10">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="mt-8 h-36" />
      <Skeleton className="mt-4 h-28" />
      <Skeleton className="mt-4 h-28" />
    </div>
  );
}
