import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col container-px py-10">
      <Skeleton className="h-2 w-full rounded-pill" />
      <Skeleton className="mt-8 h-8 w-64 max-w-full" />
      <Skeleton className="mt-6 h-48" />
    </div>
  );
}
