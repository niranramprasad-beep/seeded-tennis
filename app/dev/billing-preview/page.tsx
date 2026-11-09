import { notFound } from "next/navigation";
import { BillingPreview } from "@/components/dev/billing-preview";

export default function DevBillingPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <BillingPreview />;
}
