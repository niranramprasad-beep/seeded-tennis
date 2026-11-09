import { notFound } from "next/navigation";
import { EventsPreview } from "@/components/dev/events-preview";

export default function DevEventsPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <EventsPreview />;
}
