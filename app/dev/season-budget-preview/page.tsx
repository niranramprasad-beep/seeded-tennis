import { notFound } from "next/navigation";
import { SeasonBudgetPreview } from "@/components/dev/season-budget-preview";

export default function DevSeasonBudgetPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <SeasonBudgetPreview />;
}
