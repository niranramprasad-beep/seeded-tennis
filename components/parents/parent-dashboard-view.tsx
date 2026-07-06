"use client";

import { useEffect, useState } from "react";
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
import { AuthGate } from "@/components/shared/auth-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { usePlayer } from "@/lib/context/player-context";
import {
  loadDailyCheckins,
  loadEncouragementNotes,
  loadFamilyMembers,
  loadMatches,
  saveEncouragementNote,
  type DailyCheckin,
  type EncouragementNote,
  type FamilyMember,
  type MatchRecord,
} from "@/lib/supabase/features";
import { formatUTR } from "@/lib/utils";

export function ParentDashboardView() {
  return (
    <AuthGate>
      <ParentDashboardInner />
    </AuthGate>
  );
}

function ParentDashboardInner() {
  const { player } = usePlayer();
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [notes, setNotes] = useState<EncouragementNote[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  const refresh = async () => {
    const [c, m, n, family] = await Promise.all([
      loadDailyCheckins(),
      loadMatches(),
      loadEncouragementNotes(),
      loadFamilyMembers(),
    ]);
    setCheckins(c);
    setMatches(m);
    setNotes(n);
    setMembers(family);
  };

  useEffect(() => {
    refresh();
  }, []);

  const saveNote = async () => {
    if (!note.trim()) return;
    await saveEncouragementNote(note.trim());
    setNote("");
    setStatus("Note shared with the player.");
    await refresh();
  };

  const playerMember = members.find((m) => m.role === "player");
  const playerName = playerMember?.name ?? player.name ?? "your player";
  const firstName = playerName.split(" ")[0];
  const currentUTR = playerMember?.currentUtr ?? player.currentUTR;
  const grade = playerMember?.grade ?? player.grade;
  const completedMatches = matches.filter((m) => m.result).length;
  const upcomingMatches = matches.filter((m) => !m.result).slice(0, 3);
  const tournamentPct = Math.round(
    (player.tournamentsPlayed / Math.max(1, player.tournamentsGoal)) * 100
  );

  return (
    <div className="mx-auto max-w-content container-px py-12">
      {/* header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="eyebrow text-gold">Family dashboard</span>
          <h1 className="display-serif mt-3 text-4xl text-ink sm:text-5xl">
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
        <StatTile icon={TrendingUp} label="Current UTR" value={formatUTR(currentUTR)} />
        <StatTile icon={GraduationCap} label="Grade" value={`${grade}th`} />
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
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <Field label="Class of" value={String(player.graduationYear)} />
              <Field label="Target schools" value={String(player.targetSchoolSlugs.length)} />
              <Field label="Country" value={player.country} />
            </dl>
            <div className="mt-5 border-t-hairline border-line pt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone">Tournament season</span>
                <span className="font-medium text-ink">
                  {player.tournamentsPlayed}
                  <span className="text-stone-light">/{player.tournamentsGoal}</span>
                </span>
              </div>
              <Progress value={tournamentPct} className="mt-3" />
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
                    <span className="text-[11px] capitalize text-stone-light">
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
      <p className="mt-3 font-serif text-4xl text-ink">{value}</p>
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
