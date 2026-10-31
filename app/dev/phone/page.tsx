import { notFound } from "next/navigation";
import { PhonePreview } from "@/components/dev/phone-preview";

// Internal tool only — never render this on the live site. In a production
// build this evaluates once at build time (next build always runs with
// NODE_ENV=production), so the route bakes in as a plain 404 rather than
// doing this check per-request.
export default function DevPhonePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <PhonePreview />;
}
