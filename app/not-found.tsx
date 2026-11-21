import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Its own title (QA sweep M7) instead of the home page's.
export const metadata: Metadata = {
  title: "Page not found — Seeded",
  description: "This page doesn't exist on Seeded. Try the home page, the school list or your Today page.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-28 text-center">
      <span className="font-serif text-6xl italic text-grass">404</span>
      <h1 className="mt-4 text-2xl font-light text-ink">
        We couldn't find that page.
      </h1>
      <p className="mt-2 text-stone">
        The link may be broken, or the page may have moved.
      </p>
      <div className="mt-7 flex gap-3">
        <Link href="/" className={buttonVariants({ variant: "primary", size: "md" })}>
          Back home
        </Link>
        <Link
          href="/schools"
          className={buttonVariants({ variant: "outline", size: "md" })}
        >
          Browse schools
        </Link>
      </div>
    </div>
  );
}
