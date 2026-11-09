import { Skeleton } from "@/components/ui/skeleton";

export default function FamilyBudgetLoading() {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <Skeleton className="h-10 w-64 max-w-full" />
      <Skeleton className="mt-6 h-72" />
      <Skeleton className="mt-8 h-56" />
    </div>
  );
}
