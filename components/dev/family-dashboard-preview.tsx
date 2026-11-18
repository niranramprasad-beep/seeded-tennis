"use client";

import { DashboardBody } from "@/components/seeded/family/dashboard/dashboard-body";
import { FamilyDashboardSkeleton } from "@/components/seeded/family/dashboard/dashboard-skeleton";
import { FamilyPlanPaywall } from "@/components/seeded/family/dashboard/family-plan-paywall";
import { sampleParentDashboard } from "@/components/seeded/family/dashboard/sample-model";
import * as L from "@/components/seeded/family/dashboard/layout";

// Internal tool only (app/dev/family-dashboard-preview 404s in production).
// "dashboard" draws the real, interactive body from the paywall's SAMPLE
// model — layout checking, not data. Never linked from the app.
export function FamilyDashboardPreview({ view }: { view: "dashboard" | "paywall" | "skeleton" }) {
  if (view === "skeleton") return <FamilyDashboardSkeleton />;
  if (view === "paywall") return <FamilyPlanPaywall page="overview" childFirst="Alex" />;
  return (
    <div className={L.PAGE}>
      <DashboardBody
        model={sampleParentDashboard()}
        eyebrow="Wednesday, November 18"
        canEditBudget
        seasonLabel="Fall 2026"
        onSendNote={() => {}}
        onEditBudget={() => {}}
      />
    </div>
  );
}
