import { Skeleton } from "@/components/ui/skeleton";

export default function CostCalculatorLoading() {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-8 w-28 rounded-pill" />
      </div>
      <div className="mt-7 grid gap-5 lg:grid-cols-[390px_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
