"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { postJson } from "@/lib/api-client";

// The client half of the post-checkout safety net (server half:
// app/api/whop/sync). Mounted once in the app shell rather than on one page,
// because `?checkout=success` can land anywhere: the checkout redirect goes
// to /dashboard, which immediately redirects to /today under the Seeded
// design, and a bookmarked or shared return URL could be anything.
//
// It exists because the webhook has never delivered (see the header of
// app/api/whop/webhook/route.ts). Two people paid and stayed on the free
// tier. This closes that window from the other side: the moment someone
// returns from Whop, the server asks Whop directly.
//
// It renders a short status line and nothing else. Silence would be the
// wrong choice here — the person has just been charged, and "did that work?"
// deserves an answer on the page rather than in a log.

type SyncState = "idle" | "working" | "done" | "failed";

interface SyncResponse {
  synced?: boolean;
  reason?: string;
  tier?: string;
}

export function CheckoutSync() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthed, hydrated } = usePlayer();
  const { refresh } = useTier();
  const [state, setState] = useState<SyncState>("idle");
  // One attempt per arrival. Without this, React's development double-mount
  // and every re-render that changes `params` would fire another.
  const attempted = useRef(false);

  const isReturn = params.get("checkout") === "success";

  useEffect(() => {
    if (!isReturn || !hydrated || !isAuthed || attempted.current) return;
    attempted.current = true;

    let cancelled = false;
    (async () => {
      setState("working");
      try {
        const result = await postJson<SyncResponse>("/api/whop/sync", {});
        if (cancelled) return;
        // `synced: false` is not a failure on its own — "already-current"
        // means the webhook got there first, which is the good outcome.
        const ok = result.synced === true || result.reason === "already-current";
        setState(ok ? "done" : "failed");
        if (ok) await refresh();
      } catch {
        if (!cancelled) setState("failed");
      } finally {
        if (!cancelled) {
          // Drop the query param so a refresh or a shared link does not
          // re-run this, while keeping the rest of the URL intact.
          const next = new URLSearchParams(params.toString());
          next.delete("checkout");
          const qs = next.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isReturn, hydrated, isAuthed, refresh, router, pathname, params]);

  if (!isReturn && state === "idle") return null;
  if (state === "idle" || state === "working") {
    return (
      <Banner tone="neutral">Confirming your payment with Whop&hellip;</Banner>
    );
  }
  if (state === "done") {
    return <Banner tone="good">You&rsquo;re all set — your plan is active.</Banner>;
  }
  return (
    <Banner tone="bad">
      Payment received, but we couldn&rsquo;t switch your plan on automatically. It usually
      catches up within a few minutes. If it doesn&rsquo;t, email us and we&rsquo;ll fix it by
      hand — you will not be charged twice.
    </Banner>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "neutral" | "good" | "bad";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "good"
      ? "border-grass/40 bg-grass-50 text-ink"
      : tone === "bad"
        ? "border-error/40 bg-error-bg text-error"
        : "border-line bg-subtle text-stone";
  return (
    <div className="mx-auto max-w-content container-px pt-4">
      <p className={`rounded-xl border px-4 py-3 text-sm ${toneClass}`} role="status">
        {children}
      </p>
    </div>
  );
}
