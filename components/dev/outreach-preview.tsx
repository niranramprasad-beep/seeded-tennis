"use client";

import { useState } from "react";
import type { School } from "@/lib/types";
import { REMIND_ME_AFTER_DAYS, type OutreachStatusMapDated } from "@/lib/supabase/features";
import { SeededOutreachLayout } from "@/components/seeded/outreach/seeded-outreach-layout";

// Internal tool only — pixel-checks /outreach's real 6-column board without
// signing in through real auth (local dev shares production's Supabase
// project) or needing the (not-yet-applied) 011_outreach_stages.sql
// migration live. See app/dev/outreach-preview/page.tsx (404s in prod).
export function OutreachPreview({ targetSchools }: { targetSchools: School[] }) {
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  const [statuses, setStatuses] = useState<OutreachStatusMapDated>(() => {
    const bySlug = Object.fromEntries(targetSchools.map((s) => [s.slug, s]));
    const map: OutreachStatusMapDated = {};
    // remind_at already arrived — exercises the "Reminder due" chip on load.
    if (bySlug["north-carolina-w"])
      map["north-carolina-w"] = { status: "researching", updatedAt: daysAgo(1), remindAt: daysAgo(1) };
    if (bySlug["nc-state-w"]) map["nc-state-w"] = { status: "emailed", updatedAt: daysAgo(14) }; // overdue follow-up
    if (bySlug["texas-w"]) map["texas-w"] = { status: "emailed", updatedAt: daysAgo(2) }; // not yet due
    if (bySlug["florida-w"]) map["florida-w"] = { status: "replied", updatedAt: daysAgo(5) };
    // middlebury-w intentionally has no row — exercises the "New email" picker.
    return map;
  });

  const [selectedSlug, setSelectedSlug] = useState<string | null>("nc-state-w");
  const [subject, setSubject] = useState("Maya Chen, Class of 2028: fall results update");
  const [body, setBody] = useState(
    "Coach, I wanted to follow up on my interest in the program. Since my last note, I won two matches at the L3 Richmond and my UTR is now 9.42. Thank you, Maya"
  );
  const [copied, setCopied] = useState(false);
  const [replyNote, setReplyNote] = useState("Asked for a fall highlight video.");

  const setStatus: React.ComponentProps<typeof SeededOutreachLayout>["setStatus"] = (slug, status) => {
    setStatuses((prev) => {
      const next = { ...prev };
      if (status === null) delete next[slug];
      else next[slug] = { status, updatedAt: new Date().toISOString() };
      return next;
    });
  };

  const setReminder: React.ComponentProps<typeof SeededOutreachLayout>["setReminder"] = (slug) => {
    setStatuses((prev) => {
      if (!prev[slug]) return prev;
      const remindAt = new Date(Date.now() + REMIND_ME_AFTER_DAYS * 86_400_000).toISOString();
      return { ...prev, [slug]: { ...prev[slug], remindAt } };
    });
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <SeededOutreachLayout
        targetSchools={targetSchools}
        statuses={statuses}
        selectedSlug={selectedSlug}
        setSelectedSlug={setSelectedSlug}
        subject={subject}
        setSubject={setSubject}
        body={body}
        setBody={setBody}
        copied={copied}
        copyAll={() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        setStatus={setStatus}
        setReminder={setReminder}
        outreachError=""
        playerUtr={9.42}
        replyNote={replyNote}
        setReplyNote={setReplyNote}
        saveReplyNote={() => {}}
      />
    </div>
  );
}
