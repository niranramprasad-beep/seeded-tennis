import { notFound } from "next/navigation";
import { FamilyDashboardPreview } from "@/components/dev/family-dashboard-preview";

// Internal tool: Board 22's layout, the Family paywall and the skeleton,
// without a signed-in parent on a Family plan (local dev must not sign in
// through real auth). 404s in production, like every app/dev route.
export default async function DevFamilyDashboardPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view } = await searchParams;
  return <FamilyDashboardPreview view={view === "paywall" || view === "skeleton" ? view : "dashboard"} />;
}
