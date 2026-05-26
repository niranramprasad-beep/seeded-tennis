"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  Copy,
  Inbox,
  Mail,
  MailCheck,
  RefreshCw,
  Reply,
  Send,
} from "lucide-react";
import type { School, Tournament } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { buildCoachEmail, type CoachEmailResult } from "@/lib/data";
import { AuthGate } from "@/components/shared/auth-gate";
import { PaidGate } from "@/components/shared/paid-gate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { SchoolBadge } from "@/components/shared/school-badge";
import { cn } from "@/lib/utils";

const OUTREACH_KEY = "seeded.outreach";

type OutreachStatus = "contacted" | "replied";
type StatusMap = Record<string, OutreachStatus>;

export function CoachesView({
  schools,
  tournaments,
}: {
  schools: School[];
  tournaments: Tournament[];
}) {
  return (
    <AuthGate>
      <PaidGate
        required="family"
        feature="Coach outreach"
        blurb="Generate personalized recruiting emails from your real results, edit them to sound like you, and track every coach from first contact to reply."
        perks={[
          "Researched, non-generic emails per program",
          "Editable, copy-ready drafts",
          "Track contacted vs. replied for every coach",
          "Organized by your target schools",
        ]}
      >
        <CoachesInner schools={schools} tournaments={tournaments} />
      </PaidGate>
    </AuthGate>
  );
}

function CoachesInner({
  schools,
  tournaments,
}: {
  schools: School[];
  tournaments: Tournament[];
}) {
  const { player } = usePlayer();

  const targetSchools = useMemo(
    () => schools.filter((s) => player.targetSchoolSlugs.includes(s.slug)),
    [schools, player.targetSchoolSlugs]
  );

  // Best real results (lowest level number = most competitive), for the email.
  const results = useMemo<CoachEmailResult[]>(() => {
    return tournaments
      .filter((t) => t.status === "completed" && t.result)
      .sort((a, b) => {
        const rank = (r?: string) =>
          (r || "").toLowerCase().includes("champ")
            ? 0
            : (r || "").toLowerCase().includes("final")
              ? 1
              : 2;
        const lvl = (l: string) => Number(l.replace("L", "")) || 9;
        return lvl(a.level) - lvl(b.level) || rank(a.result) - rank(b.result);
      })
      .map((t) => ({ name: t.name, level: t.level, result: t.result as string }));
  }, [tournaments]);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    targetSchools[0]?.slug ?? null
  );
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(OUTREACH_KEY);
      if (stored) setStatuses(JSON.parse(stored));
    } catch {
      // ignore
    }
    const qs = new URLSearchParams(window.location.search).get("school");
    if (qs && player.targetSchoolSlugs.includes(qs)) setSelectedSlug(qs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSchool = useMemo(
    () => targetSchools.find((s) => s.slug === selectedSlug) ?? targetSchools[0],
    [targetSchools, selectedSlug]
  );

  useEffect(() => {
    if (!selectedSchool) return;
    const email = buildCoachEmail(player, selectedSchool, results);
    setSubject(email.subject);
    setBody(email.body);
    setCopied(false);
  }, [selectedSchool, player, results]);

  const persist = (next: StatusMap) => {
    setStatuses(next);
    try {
      window.localStorage.setItem(OUTREACH_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const setStatus = (slug: string, status: OutreachStatus | null) => {
    const next = { ...statuses };
    if (status === null) delete next[slug];
    else next[slug] = status;
    persist(next);
  };

  const regenerate = () => {
    if (!selectedSchool) return;
    const email = buildCoachEmail(player, selectedSchool, results);
    setSubject(email.subject);
    setBody(email.body);
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const targetSlugs = targetSchools.map((s) => s.slug);
  const contactedCount = targetSlugs.filter((s) => statuses[s]).length;
  const repliedCount = targetSlugs.filter((s) => statuses[s] === "replied").length;

  if (targetSchools.length === 0) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-grass-50 text-grass">
          <Mail className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-light text-ink">
          Pick your target schools first
        </h1>
        <p className="mt-2 text-stone">
          Choose the programs you're targeting and we'll draft personalized
          emails to each coach.
        </p>
        <Link
          href="/onboarding"
          className={cn(buttonVariants({ variant: "primary", size: "md" }), "mt-6")}
        >
          Choose schools
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <span className="eyebrow text-gold">Coach outreach</span>
          <h1 className="display-serif mt-3 text-4xl text-ink sm:text-5xl">
            Emails that sound like{" "}
            <span className="serif-accent text-grass">you</span>.
          </h1>
          <p className="mt-3 text-pretty leading-relaxed text-stone">
            Built from your real results and each program's specifics. Edit
            anything, copy it, and track every coach from sent to replied.
          </p>
        </div>
        {/* pipeline summary */}
        <div className="flex gap-3">
          <Stat icon={Send} label="Contacted" value={`${contactedCount}/${targetSchools.length}`} />
          <Stat icon={Reply} label="Replied" value={String(repliedCount)} />
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[330px_1fr]">
        {/* school list */}
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-ink">Your target schools</span>
          {targetSchools.map((s) => {
            const active = selectedSchool?.slug === s.slug;
            const status = statuses[s.slug];
            return (
              <button
                key={s.id}
                onClick={() => setSelectedSlug(s.slug)}
                className={cn(
                  "flex items-center gap-3 rounded-card border-[0.5px] p-3 text-left transition-all",
                  active
                    ? "border-grass bg-grass-50 shadow-soft"
                    : "border-line bg-card hover:shadow-soft"
                )}
              >
                <SchoolBadge school={s} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {s.shortName}
                  </p>
                  <p className="truncate text-xs text-stone-light">
                    {s.coachName}
                  </p>
                </div>
                {status === "replied" ? (
                  <Badge variant="leaf" size="sm">
                    <MailCheck className="h-3 w-3" />
                    Replied
                  </Badge>
                ) : status === "contacted" ? (
                  <Badge variant="default" size="sm">
                    <Check className="h-3 w-3" />
                    Sent
                  </Badge>
                ) : (
                  <Badge variant="muted" size="sm">
                    <Inbox className="h-3 w-3" />
                    To do
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        {/* composer */}
        {selectedSchool && (
          <motion.div
            key={selectedSchool.slug}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b-[0.5px] border-line bg-cream/50 p-5">
                <div className="flex items-center gap-3">
                  <SchoolBadge school={selectedSchool} size={42} />
                  <div>
                    <p className="font-medium text-ink">
                      {selectedSchool.shortName}
                    </p>
                    <p className="text-xs text-stone">
                      To: {selectedSchool.coachName} · {selectedSchool.coachEmail}
                    </p>
                  </div>
                </div>
                <button
                  onClick={regenerate}
                  className="flex items-center gap-1.5 text-sm text-stone transition-colors hover:text-grass"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline">Regenerate</span>
                </button>
              </div>

              <div className="border-b-[0.5px] border-line p-5">
                <label className="mb-1.5 block text-xs text-stone-light">
                  Subject
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-ink focus:outline-none"
                />
              </div>

              <div className="p-5">
                <label className="mb-1.5 block text-xs text-stone-light">
                  Message
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={18}
                  className="w-full resize-none rounded-card border-[0.5px] border-line bg-cream/40 p-4 text-sm leading-relaxed text-ink focus:outline-none focus:ring-2 focus:ring-grass/20"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t-[0.5px] border-line bg-cream/50 p-5">
                <Button variant="primary" size="md" onClick={copyAll}>
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy email
                    </>
                  )}
                </Button>
                {statuses[selectedSchool.slug] ? (
                  <Button
                    variant="subtle"
                    size="md"
                    onClick={() => setStatus(selectedSchool.slug, null)}
                  >
                    <Check className="h-4 w-4" />
                    Contacted
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => setStatus(selectedSchool.slug, "contacted")}
                  >
                    <Send className="h-4 w-4" />
                    Mark as contacted
                  </Button>
                )}
                <Button
                  variant={
                    statuses[selectedSchool.slug] === "replied" ? "leaf" : "ghost"
                  }
                  size="md"
                  onClick={() =>
                    setStatus(
                      selectedSchool.slug,
                      statuses[selectedSchool.slug] === "replied"
                        ? "contacted"
                        : "replied"
                    )
                  }
                >
                  <Reply className="h-4 w-4" />
                  {statuses[selectedSchool.slug] === "replied"
                    ? "Coach replied"
                    : "Mark replied"}
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Send;
  label: string;
  value: string;
}) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-grass-50 text-grass">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-lg font-medium leading-none text-ink">{value}</p>
        <p className="mt-1 text-xs text-stone-light">{label}</p>
      </div>
    </Card>
  );
}
