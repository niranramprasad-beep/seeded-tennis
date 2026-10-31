import { Skeleton } from "@/components/ui/skeleton";

export default function BadgesLoading() {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-8 w-28 rounded-pill" />
      </div>
      {/* Badges render as several labeled category groups (UTR, Tournament,
          Match, Training, Recruiting) — repeat the label+grid shape so the
          skeleton's height is in the same ballpark as the real page. */}
      {[0, 1, 2, 3, 4].map((group) => (
        <div key={group} className="mt-8">
          <Skeleton className="h-5 w-32" />
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
