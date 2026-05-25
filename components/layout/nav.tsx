"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, LogOut, Settings, ChevronRight } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { TierSwitcher } from "./tier-switcher";
import { cn } from "@/lib/utils";

const MARKETING_LINKS = [
  { href: "/#roadmap-preview", label: "Roadmap" },
  { href: "/schools", label: "Schools" },
  { href: "/#training-preview", label: "Training" },
  { href: "/#trust", label: "For parents" },
  { href: "/pricing", label: "Pricing" },
];

const APP_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/schools", label: "Schools" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/training", label: "Training" },
  { href: "/coaches", label: "Coaches" },
  { href: "/pricing", label: "Pricing" },
];

export function Nav() {
  const { isAuthed, hydrated, signOut } = usePlayer();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const showApp = hydrated && isAuthed;
  const links = showApp ? APP_LINKS : MARKETING_LINKS;

  const handleSignOut = () => {
    signOut();
    router.push("/");
  };

  const isActive = (href: string) =>
    href.startsWith("/#") ? false : pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-50 border-b-[0.5px] border-line bg-cream/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-content items-center justify-between container-px">
        <Link
          href={showApp ? "/dashboard" : "/"}
          className="flex items-center gap-2"
          onClick={() => setOpen(false)}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-tennis ring-1 ring-grass/15" />
          <span className="font-serif text-[26px] italic leading-none text-grass">
            Seeded
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-5 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "text-sm transition-colors hover:text-ink",
                isActive(l.href) ? "font-medium text-ink" : "text-stone"
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-4 lg:flex">
          {showApp ? (
            <>
              <TierSwitcher showLabel={false} />
              <Link
                href="/settings"
                aria-label="Settings"
                className="flex h-9 w-9 items-center justify-center rounded-full text-stone transition-colors hover:bg-grass-50 hover:text-ink"
              >
                <Settings className="h-4 w-4" />
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 text-sm text-stone transition-colors hover:text-ink"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-stone transition-colors hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className={buttonVariants({ variant: "primary", size: "sm" })}
              >
                Build roadmap
                <ChevronRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t-[0.5px] border-line bg-cream lg:hidden"
          >
            <div className="flex flex-col gap-1 container-px py-4">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-xl px-3 py-2.5 text-sm",
                    isActive(l.href)
                      ? "bg-grass-50 font-medium text-ink"
                      : "text-stone"
                  )}
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-3 border-t-[0.5px] border-line pt-4">
                {showApp ? (
                  <div className="flex flex-col gap-4">
                    <TierSwitcher />
                    <Link
                      href="/settings"
                      onClick={() => setOpen(false)}
                      className="rounded-xl px-3 py-2.5 text-sm text-stone"
                    >
                      Settings
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        handleSignOut();
                        setOpen(false);
                      }}
                    >
                      Sign out
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      className={buttonVariants({ variant: "outline", size: "md" })}
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/signup"
                      onClick={() => setOpen(false)}
                      className={buttonVariants({ variant: "primary", size: "md" })}
                    >
                      Get started
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
