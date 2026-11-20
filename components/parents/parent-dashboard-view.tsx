"use client";

import { useState } from "react";
import useSWR from "swr";
import { subjectKey } from "@/lib/db/family-scope";
import {
  CalendarDays,
  GraduationCap,
  Heart,
  MessageCircle,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import type { SchoolLite } from "@/lib/types";
import { pickFamilyPlayer, resolveFamilyPlayerFacts } from "@/lib/family-view";
import { AuthGate } from "@/components/shared/auth-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePlayer } from "@/lib/context/player-context";
import { loadDailyCheckins, type DailyCheckin } from "@/lib/db/plan";
import {
  loadEncouragementNotes,
  loadFamilyMembers,
  saveEncouragementNote,
  type EncouragementNote,
  type FamilyMember,
} from "@/lib/db/family";
import { loadMatches, loadTournamentEntries, type MatchRecord, type TournamentEntry } from "@/lib/db/events";
import {
  TOURNAMENTS_PLANNED_LABEL,
  TOURNAMENTS_PLANNED_NOT_SET,
  countPlayedThisSeason,
} from "@/lib/tournaments-planned";
import Link from "next/link";
import { useDesign } from "@/lib/context/design-context";
import { getCurrentGrade } from "@/lib/time";
import { formatUTR } from "@/lib/utils";
import { SeededFamilyOverview } from "@/components/seeded/family/seeded-family-overview";
import { FamilyDashboardSkeleton } from "@/components/seeded/family/dashboard/dashboard-skeleton";
import { FamilyPlanPaywall } from "@/components/seeded/family/dashboard/family-plan-paywall";
import { loadFamilyPlanStatus, type FamilyPlanStatus } from "@/lib/db/family-plan";

export function ParentDashboardView({ schools }: { schools: SchoolLite[] }) {
  const { design } = useDesign();
  // Seeded: the session wait shows the dashboard's own skeleton — the same
  // boxes app/family/loading.tsx and the overview's data wait show.
  return (
    <AuthGate fallback={design === "seeded" ? <FamilyDashboardSkeleton /> : undefined}>
      <ParentDashboardInner schools={schools} />
    </AuthGate>
  );
}

// Seeded's real parent nav (sidebar's PARENT_NAV_LINKS) now routes Budget
// and Weekly reports to their own /family/budget and /family/weekly-reports
// pages, so /family itself is just the Overview — no more in-page tab
// state here. Legacy has no equivalent mockup for any of this; its branch
// below is untouched from before this rebuild.
function ParentDashboardInner({ schools }: { schools: SchoolLite[] }) {
  const { design } = useDesign();
  if (design === "seeded") {
    return <SeededFamilyOverview schools={schools} />;
  }
  return <LegacyFamilyPlanGate />;
}

// Legacy is slated for deletion but still reachable from Settings →
// Appearance. It gets the same plan check: a locked family sees the paywall,
// and the legacy dashboard (whose notes loader would come back empty) never
// mounts.
function LegacyFamilyPlanGate() {
  const { data: plan } = useSWR<FamilyPlanStatus>("family-plan-status", () => loadFamilyPlanStatus());
  const { data: members } = useSWR<FamilyMember[]>("family-members", () => loadFamilyMembers());
  if (!plan || !members) return <FamilyDashboardSkeleton />;
  if (!plan.unlocked) {
    const child = (pickFamilyPlayer(members)?.name ?? "").trim().split(/\s+/)[0] || null;
    return <FamilyPlanPaywall page="overview" childFirst={child} />;
  }
  return <LegacyParentDashboard />;
}

function LegacyParentDashboard() {
  const { player } = usePlayer();
  // Same keys as /dashboard's check-in card, the matches views, and the
  // family hub card — each resource loads once and is shared across every
  // page that shows it, instead of every page fetching its own copy.
  const { data: members = [] } = useSWR<FamilyMember[]>("family-members", () => loadFamilyMembers());
  // The PLAYER's check-ins and matches, by id. These used the parent-pooling
  // default, which counted every approved member's rows as the player's.
  const subjectId = pickFamilyPlayer(members)?.id ?? null;
  const { data: checkins = [] } = useSWR<DailyCheckin[]>(
    subjectId ? ["daily-checkins", subjectKey({ userId: subjectId })] : null,
    () => loadDailyCheckins({ userId: subjectId! })
  );
  const { data: matches = [] } = useSWR<MatchRecord[]>(
    subjectId ? ["matches", subjectKey({ userId: subjectId })] : null,
    () => loadMatches({ userId: subjectId! })
  );
  // "Played this season" is counted from the player's own tournament
  // entries marked Played (047) — never from profiles.tournaments_played,
  // a column default no screen ever wrote (049). The player's entries when
  // there is a linked player; the viewer's own only when the viewer IS the
  // player.
  const entriesSubject = subjectId
    ? { userId: subjectId }
    : player.role === "player"
    ? ("self" as const)
    : null;
  const { data: tournamentEntries = [] } = useSWR<TournamentEntry[]>(
    entriesSubject ? ["tournament-entries", subjectKey(entriesSubject)] : null,
    () => loadTournamentEntries(entriesSubject!)
  );
  const { data: notes = [], mutate: mutateNotes } = useSWR<EncouragementNote[]>(
    "encouragement-notes",
    () => loadEncouragementNotes()
  );
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  const saveNote = async () => {
    if (!note.trim()) return;
    await saveEncouragementNote(note.trim());
    setNote("");
    setStatus("Note shared with the player.");
    await mutateNotes();
  };

  const playerMember = pickFamilyPlayer(members);
  const playerName = playerMember?.name ?? "your player";
  const firstName = playerName.split(" ")[0];
  // See seeded-family-overview.tsx for the full note: the `??` fell through
  // to the signed-in parent's own placeholder UTR. The legacy design is
  // still reachable (footer + Settings → Appearance), so it gets the same
  // honest "Not tracked".
  // A verification pass caught this file half-fixed: the UTR used the shared
  // rule while the line below still fell through to the signed-in PARENT's
  // own graduation_year — the exact symptom the original bug report named.
  // Five further fields in the "Player snapshot" card below read `player.`
  // directly for the player's data and were the parent's own row too.
  const playerFacts = resolveFamilyPlayerFacts(playerMember, player);
  const currentUTR = playerFacts.currentUtr;
  const graduationYear = playerFacts.graduationYear;
  const grade = graduationYear == null ? null : getCurrentGrade(graduationYear);
  const completedMatches = matches.filter((m) => m.result).length;
  const upcomingMatches = matches.filter((m) => !m.result).slice(0, 3);
  // The viewer is the player only when no player row came back and their
  // own role is player (resolveFamilyPlayerFacts' rule). Then their own
  // planned count is theirs to show. A parent can't read it: family_members()
  // does not return it (037's enumerated list), so it is "Not tracked" here,
  // never a default and never a progress bar against one (049).
  const viewerIsPlayer = !playerMember && player.role === "player";
  const playedThisSeason = playerFacts.hasLinkedPlayer ? countPlayedThisSeason(tournamentEntries) : null;

  return (
    <div className="mx-auto max-w-content container-px py-12">
      {/* header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="eyebrow text-gold">Family dashboard</span>
          <h1 className="mt-3 text-4xl sm:text-5xl display-serif text-ink">
            Follow {firstName}&rsquo;s climb.
          </h1>
          <p className="mt-3 max-w-xl text-pretty leading-relaxed text-stone">
            A clear, read-only window into your player&rsquo;s progress — UTR,
            training, matches, and the path ahead.
          </p>
        </div>
        <Badge variant="outline" size="md" className="shrink-0">
          Family code · {player.familyCode ?? "not set"}
        </Badge>
      </div>

      <div className="rule-gold mt-8 max-w-[140px]" />

      {/* stat tiles */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={TrendingUp}
          label="Current UTR"
          value={currentUTR == null ? "Not tracked" : formatUTR(currentUTR)}
        />
        <StatTile icon={GraduationCap} label="Grade" value={grade == null ? "Not tracked" : `${grade}th`} />
        <StatTile icon={CalendarDays} label="Check-ins" value={String(checkins.length)} />
        <StatTile icon={Trophy} label="Matches logged" value={String(completedMatches)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* player snapshot */}
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">Player snapshot</h2>
            </div>
            {playerFacts.hasLinkedPlayer ? (
              <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                <Field
                  label="Class of"
                  value={graduationYear == null ? "Not tracked" : String(graduationYear)}
                />
                <Field
                  label="Target schools"
                  value={String(playerMember?.targetSchoolSlugs?.length ?? player.targetSchoolSlugs.length)}
                />
                <Field label="Country" value={playerMember ? "Not tracked" : player.country} />
              </dl>
            ) : (
              <p className="mt-5 text-sm text-stone">
                No player has been linked to this family yet, so there is
                nothing to show here. Seeded won&rsquo;t fill these in from
                your own account.
              </p>
            )}
            <div className="mt-5 space-y-2 border-t-hairline border-line pt-5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-stone">Tournaments played this season</span>
                <span className="font-medium text-ink">
                  {playedThisSeason == null ? "Not tracked" : playedThisSeason}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-stone">{TOURNAMENTS_PLANNED_LABEL}</span>
                <span className="font-medium text-ink">
                  {viewerIsPlayer ? (
                    player.tournamentsPlanned == null ? (
                      <>
                        {TOURNAMENTS_PLANNED_NOT_SET} ·{" "}
                        <Link href="/settings/profile" className="text-grass underline-offset-2 hover:underline">
                          Set it
                        </Link>
                      </>
                    ) : (
                      player.tournamentsPlanned
                    )
                  ) : (
                    "Not tracked"
                  )}
                </span>
              </div>
              {playerMember && (
                <p className="text-xs text-stone-light">
                  {firstName} sets the planned count in Settings. It isn&rsquo;t shared to the family view.
                </p>
              )}
            </div>
          </Card>

          {/* training feel */}
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">Recent training feel</h2>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {checkins.slice(-6).reverse().map((row) => (
                <div
                  key={row.id}
                  className="rounded-card border-hairline border-line bg-cream/50 p-4"
                >
                  <p className="text-xs text-stone-light">{row.date}</p>
                  <p className="mt-2 font-serif text-3xl text-grass">{row.mood}/5</p>
                  <p className="mt-1 truncate text-xs text-stone">
                    {row.focusAreas.join(", ") || "—"}
                  </p>
                </div>
              ))}
              {!checkins.length && (
                <p className="text-sm text-stone">No check-ins logged yet.</p>
              )}
            </div>
          </Card>

          {/* upcoming matches */}
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">Upcoming matches</h2>
            </div>
            <div className="mt-4 space-y-2">
              {upcomingMatches.map((match) => (
                <div
                  key={match.id}
                  className="flex items-center justify-between rounded-card border-hairline border-line bg-cream/50 px-4 py-3"
                >
                  <p className="font-medium text-ink">
                    {match.tournamentName || "Match"}
                  </p>
                  <p className="text-xs text-stone-light">
                    {match.matchDate} · {match.surface}
                  </p>
                </div>
              ))}
              {!upcomingMatches.length && (
                <p className="text-sm text-stone">No upcoming matches scheduled.</p>
              )}
            </div>
          </Card>
        </div>

        {/* right column */}
        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">Family</h2>
            </div>
            <div className="mt-4 space-y-2.5">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-card border-hairline border-line bg-cream/50 p-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {member.name}
                    </p>
                    <p className="truncate text-xs text-stone-light">{member.email}</p>
                  </div>
                  <Badge
                    variant={member.role === "player" ? "leaf" : "outline"}
                    size="sm"
                    className="capitalize"
                  >
                    {member.role}
                  </Badge>
                </div>
              ))}
              {!members.length && (
                <p className="text-sm text-stone">
                  No members yet. Check the family code was entered exactly.
                </p>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-grass" />
              <h2 className="text-lg font-medium text-ink">Encouragement</h2>
            </div>
            <p className="mt-1 text-sm text-stone">
              Notes you leave appear on {firstName}&rsquo;s dashboard.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="After a tough week or a big result…"
              className="mt-4 min-h-[88px] w-full rounded-card border-hairline border-line bg-cream/50 px-4 py-3 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/25"
            />
            <Button variant="primary" size="md" className="mt-3 w-full" onClick={saveNote}>
              <MessageCircle className="h-4 w-4" />
              Share note
            </Button>
            {status && <p className="mt-2 text-xs text-grass">{status}</p>}
            <div className="mt-4 space-y-2">
              {notes.slice(0, 4).map((n) => (
                <div key={n.id} className="rounded-card bg-cream/60 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-ink">{n.authorName}</p>
                    <span className="text-xs capitalize text-stone-light">
                      {n.authorRole}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone">{n.body}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <Card interactive className="p-5">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <Icon className="h-4 w-4 text-gold" />
      </div>
      <p className="mt-3 text-4xl text-ink font-serif">{value}</p>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1.5 text-lg font-medium text-ink">{value}</dd>
    </div>
  );
}
