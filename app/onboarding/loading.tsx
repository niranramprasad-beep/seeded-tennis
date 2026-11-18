import { Skeleton } from "@/components/ui/skeleton";

// The diagnostic's own boxes (rule 6): the progress strip, the 560px
// question card and the 320px aside with its two cards — so swapping this
// for the real page moves nothing.
export default function OnboardingLoading() {
  return (
    <div className="bg-cream pb-16" aria-busy="true">
      <div className="mx-auto max-w-[1200px] px-4 pt-6 sm:px-6">
        <div className="mx-auto flex max-w-[420px] flex-col items-center">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-0.5 h-5 w-28" />
          <Skeleton className="mt-2.5 h-1.5 w-full rounded-pill" />
        </div>
      </div>
      <div className="mx-auto mt-6 grid max-w-[1200px] gap-5 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-h-[400px] rounded-[16px] border border-line bg-card p-6 sm:p-10 lg:min-h-[560px] lg:p-12">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="mt-3 h-6 w-1/2" />
          <Skeleton className="mt-6 h-16 w-full" />
          <Skeleton className="mt-3 h-16 w-full" />
        </div>
        <div className="flex flex-col gap-5">
          <div className="h-[322px] rounded-xl border border-line bg-card" />
          <div className="h-[168px] rounded-xl bg-[rgb(var(--c-night))]" />
        </div>
      </div>
    </div>
  );
}
