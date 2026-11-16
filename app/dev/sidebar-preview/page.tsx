import { notFound } from "next/navigation";
import { SidebarPreview } from "@/components/dev/sidebar-preview";

export default function DevSidebarPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <SidebarPreview />;
}
