import { Skeleton } from "@/components/ui/skeleton";

export default function OutreachLoading() {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <Skeleton className="h-3 w-24 rounded-pill" />
      <Skeleton className="mt-4 h-10 w-72 max-w-full" />
      <div className="mt-8 grid gap-4 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
