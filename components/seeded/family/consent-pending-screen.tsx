"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

// P0-8. What an under-13 account sees until an adult in their family says yes.
//
// This screen is NOT the gate. The gate is RLS: migration 030 adds a
// restrictive policy to every table, so an account whose consent_status is
// 'pending' reads and writes nothing in those tables but its own profile
// row. Two things it CAN still reach, verified 2026-11-16: the public school
// catalog, and family_members() — a SECURITY DEFINER roster that returns the
// family's members (names, emails, ratings) to any approved member, consent
// pending or not. So this screen never says "reads nothing". Switching this
// component off, or navigating around it, changes nothing about what the
// account can reach — which is the point of the CLAUDE.md rule that
// AuthGate is cosmetic.
//
// What this screen is for is telling a 12-year-old why the app is empty,
// instead of showing them a working-looking product full of zeroes. It says
// what is waiting on whom, and it does not pretend a notification went out:
// Seeded sends no email and no push, so the parent finds the request the
// next time they open the app.
export function ConsentPendingScreen({ firstName }: { firstName?: string }) {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="mx-auto max-w-md rounded-card border border-line bg-card p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-grass" aria-hidden />
          <h1 className="text-lg font-semibold text-ink">
            A parent needs to say yes first
          </h1>
        </div>

        <p className="mt-2.5 text-sm text-stone">
          {firstName ? `${firstName}, you're` : "You're"} under 13, so Seeded needs a parent or
          guardian to agree before your account starts working. Until they do, you can&rsquo;t save
          anything — no results, no plan, no target schools. That&rsquo;s deliberate, not a bug.
        </p>

        <div className="mt-4 rounded-[14px] border border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] p-4">
          <p className="text-sm font-semibold text-ink">What they need to do</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-sm text-stone">
            <li>Open Seeded on their own account.</li>
            <li>Find your request on their Overview page (Family).</li>
            <li>Tap Approve.</li>
          </ol>
          <p className="mt-2.5 text-sm text-stone">
            Seeded doesn&rsquo;t email or text them — they&rsquo;ll see it next time they open
            the app, so it&rsquo;s worth telling them yourself.
          </p>
        </div>

        {/* Pointed at /family, which AuthGate blocks for every player
            account (isPlayerBlockedPath) — so this link bounced an under-13
            to /today and then straight back to this screen. /settings is
            where their own profile lives and is reachable for a pending
            account by design. */}
        <p className="mt-4 text-sm text-stone">
          Entered the wrong family code?{" "}
          <Link href="/settings/family" className="text-grass underline underline-offset-2">
            Check it in Settings
          </Link>
          .
        </p>

        <p className="mt-2 text-sm text-stone">
          You can still{" "}
          <Link href="/settings/privacy" className="text-grass underline underline-offset-2">
            download or delete your account
          </Link>{" "}
          at any time, with or without their approval.
        </p>
      </div>
    </div>
  );
}
