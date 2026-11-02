import { notFound } from "next/navigation";
import { DesignSystemPreview } from "@/components/dev/design-system-preview";

// Internal tool only — same pattern as /dev/phone: evaluates once at build
// time, so this route bakes in as a plain 404 in a production build.
export default function DevDesignPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <DesignSystemPreview />;
}
