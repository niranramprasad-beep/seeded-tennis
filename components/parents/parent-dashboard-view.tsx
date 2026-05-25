"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileText, Heart, MessageCircle, Shield, TrendingUp, Users } from "lucide-react";
import { AuthGate } from "@/components/shared/auth-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePlayer } from "@/lib/context/player-context";
import { getSupabase } from "@/lib/supabase/client";
import {
  loadDailyCheckins,
  loadEncouragementNotes,
  loadFamilyMembers,
  loadMatches,
  loadParentReports,
  saveEncouragementNote,
  type DailyCheckin,
  type EncouragementNote,
  type FamilyMember,
  type MatchRecord,
  type ParentReport,
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
  const [reports, setReports] = useState<ParentReport[]>([]);
  const [notes, setNotes] = useState<EncouragementNote[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  const refresh = async () => {
    const [c, m, r, n, family] = await Promise.all([
      loadDailyCheckins(),
      loadMatches(),
      loadParentReports(),
      loadEncouragementNotes(),
      loadFamilyMembers(),
    ]);
    setCheckins(c);
    setMatches(m);
    setReports(r);
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
    setStatus("Encouragement note saved.");
    await refresh();
  };

  const generateReport = async () => {
    const supabase = getSupabase();
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) {
      setStatus("Sign in again before generating a report.");
      return;
    }
    setStatus("Generating report...");
    const response = await fetch("/api/parent-reports/generate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setStatus(payload?.error ?? "Report failed. Check Supabase Storage bucket.");
      return;
    }
    setStatus("Report generated.");
    await refresh();
  };

  const completedMatches = matches.filter((m) => m.result).length;
  const upcomingMatches = matches.filter((m) => !m.result).slice(0, 3);
  const playerMember = members.find((member) => member.role === "player");

  return (
    <main className="mx-auto max-w-content container-px py-10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="font-serif text-lg italic text-leaf-accent">Family dashboard</p>
          <h1 className="mt-1 text-3xl font-light tracking-tight text-ink">
            Everything your family needs in one place.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone">
            Track your player, view family members, download reports, and leave encouragement notes.
          </p>
        </div>
        <Badge variant="leaf" size="md">
          Family code {player.familyCode ?? "not set"}
        </Badge>
      </div>

      <div className="mt-7 soft-band p-4 md:p-5">
        <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Player UTR" value={formatUTR(playerMember?.currentUtr ?? player.currentUTR)} />
        <Metric label="Check-ins" value={String(checkins.length)} />
        <Metric label="Matches logged" value={String(completedMatches)} />
        <Metric label="Family members" value={String(members.length || 1)} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card className="overflow-hidden border-grass/15 p-0">
            <div className="bg-grass p-6 text-cream">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-leaf-accent" />
              <h2 className="font-medium">Family members</h2>
            </div>
            <p className="mt-2 text-sm text-cream/75">
              Everyone connected to this family can see the same progress and notes.
            </p>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-2">
              {members.map((member) => (
                <div key={member.id} className="rounded-[22px] border-[0.5px] border-line bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{member.name}</p>
                      <p className="mt-1 text-xs text-stone-light">{member.email}</p>
                    </div>
                    <Badge variant={member.role === "player" ? "leaf" : "outline"}>{member.role}</Badge>
                  </div>
                  {member.role === "player" && (
                    <p className="mt-3 text-sm text-stone">
                      {formatUTR(member.currentUtr)} UTR · {member.grade}th grade
                    </p>
                  )}
                </div>
              ))}
              {!members.length && (
                <p className="text-sm text-stone">
                  No family members loaded yet. Make sure the family code was entered exactly.
                </p>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-grass" />
              <h2 className="font-medium text-ink">Recent training feel</h2>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {checkins.slice(-6).map((row) => (
                <div key={row.id} className="rounded-2xl border-[0.5px] border-line bg-card p-4">
                  <p className="text-xs text-stone-light">{row.date}</p>
                  <p className="mt-2 text-2xl font-light text-ink">{row.mood}/5</p>
                  <p className="mt-1 text-xs text-stone">{row.focusAreas.join(", ")}</p>
                </div>
              ))}
              {!checkins.length && <p className="text-sm text-stone">No check-ins yet.</p>}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="font-medium text-ink">Upcoming matches</h2>
            <div className="mt-4 space-y-3">
              {upcomingMatches.map((match) => (
                <div key={match.id} className="rounded-2xl border-[0.5px] border-line bg-card p-4">
                  <p className="font-medium text-ink">{match.tournamentName || "Match"}</p>
                  <p className="mt-1 text-xs text-stone">{match.matchDate} · {match.surface}</p>
                </div>
              ))}
              {!upcomingMatches.length && <p className="text-sm text-stone">No upcoming matches logged.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="bg-grass p-6 text-cream">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-leaf-accent" />
              <h2 className="font-medium">Parent access</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-cream/78">
              You are connected to family code {player.familyCode ?? "not set"}. This view is built
              for parents: quick progress, family members, reports, and notes.
            </p>
            <div className="mt-4 rounded-[22px] bg-cream/10 p-4">
              <p className="text-xs text-cream/60">What the player sees</p>
              <p className="mt-1 text-sm text-cream/90">
                Notes you leave here now appear in the player dashboard family hub.
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-grass" />
              <h2 className="font-medium text-ink">Monthly reports</h2>
            </div>
            <Button className="mt-4 w-full" onClick={generateReport}>
              Generate report
            </Button>
            <p className="mt-2 text-xs text-stone-light">{status}</p>
            <div className="mt-4 space-y-2">
              {reports.map((report) => (
                <Link
                  key={report.id}
                  href={report.publicUrl || "#"}
                  target="_blank"
                  className="flex items-center justify-between rounded-xl bg-cream px-4 py-3 text-sm text-stone transition hover:text-ink"
                >
                  <span>{report.title}</span>
                  <Download className="h-4 w-4" />
                </Link>
              ))}
              {!reports.length && <p className="text-sm text-stone">No reports yet.</p>}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-grass" />
              <h2 className="font-medium text-ink">Encouragement notes</h2>
            </div>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Leave a quick note after a tough week or big result..."
              className="mt-4 min-h-[92px] w-full rounded-xl border-[0.5px] border-line bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-grass/30"
            />
            <Button className="mt-3 w-full" onClick={saveNote}>
              <MessageCircle className="h-4 w-4" />
              Save note
            </Button>
            <div className="mt-4 space-y-2">
              {notes.slice(0, 4).map((n) => (
                <div key={n.id} className="rounded-[18px] bg-cream px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-ink">{n.authorName}</p>
                    <span className="text-[11px] capitalize text-stone-light">{n.authorRole}</span>
                  </div>
                  <p className="mt-1 text-sm text-stone">{n.body}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs text-stone-light">{label}</p>
      <p className="mt-2 text-2xl font-light text-ink">{value}</p>
    </Card>
  );
}
