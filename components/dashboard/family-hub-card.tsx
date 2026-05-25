"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Heart, MessageCircle, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  loadEncouragementNotes,
  loadFamilyMembers,
  saveEncouragementNote,
  type EncouragementNote,
  type FamilyMember,
} from "@/lib/supabase/features";
import { formatUTR } from "@/lib/utils";

export function FamilyHubCard() {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [notes, setNotes] = useState<EncouragementNote[]>([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  const refresh = async () => {
    const [familyRows, noteRows] = await Promise.all([
      loadFamilyMembers(),
      loadEncouragementNotes(),
    ]);
    setMembers(familyRows);
    setNotes(noteRows);
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    if (!note.trim()) return;
    await saveEncouragementNote(note.trim());
    setNote("");
    setStatus("Shared with your family.");
    await refresh();
  };

  const parents = members.filter((member) => member.role === "parent");
  const player = members.find((member) => member.role === "player");

  return (
    <Card className="overflow-hidden border-grass/15">
      <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="bg-grass p-6 text-cream">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-serif text-lg italic text-leaf-accent">Family hub</p>
              <h2 className="mt-1 text-2xl font-light">Everyone sees the same path.</h2>
              <p className="mt-2 text-sm leading-relaxed text-cream/78">
                Parent notes, family members, and player progress stay connected here.
              </p>
            </div>
            <Link
              href="/family"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream/12 text-cream transition hover:bg-cream/20"
              aria-label="Open family dashboard"
            >
              <ArrowUpRight className="h-5 w-5" />
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] bg-cream/10 p-4">
              <p className="text-xs text-cream/60">Connected parents</p>
              <p className="mt-1 text-3xl font-light">{parents.length}</p>
            </div>
            <div className="rounded-[22px] bg-cream/10 p-4">
              <p className="text-xs text-cream/60">Player UTR</p>
              <p className="mt-1 text-3xl font-light">
                {formatUTR(player?.currentUtr ?? 0)}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {members.slice(0, 5).map((member) => (
              <span
                key={member.id}
                className="inline-flex items-center gap-2 rounded-full bg-cream/12 px-3 py-2 text-xs text-cream/85"
              >
                <Users className="h-3.5 w-3.5 text-leaf-accent" />
                {member.name} · {member.role}
              </span>
            ))}
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-medium text-ink">
                <Heart className="h-4 w-4 text-grass" />
                Family notes
              </p>
              <p className="mt-1 text-xs text-stone">
                Parents and players can leave quick updates for each other.
              </p>
            </div>
            <Badge variant="lime" size="sm">{notes.length} notes</Badge>
          </div>

          <div className="mt-4 space-y-2">
            {notes.slice(0, 3).map((item) => (
              <p key={item.id} className="rounded-[18px] bg-cream/80 px-4 py-3 text-sm text-stone">
                {item.body}
              </p>
            ))}
            {!notes.length && (
              <p className="rounded-[18px] bg-cream/80 px-4 py-3 text-sm text-stone">
                No notes yet. This is where encouragement and quick family updates will show up.
              </p>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Write a quick family note..."
              className="h-11 min-w-0 flex-1 rounded-full border-[0.5px] border-line bg-card px-4 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30"
            />
            <Button size="sm" onClick={save}>
              <MessageCircle className="h-4 w-4" />
              Send
            </Button>
          </div>
          {status && <p className="mt-2 text-xs text-stone-light">{status}</p>}
        </div>
      </div>
    </Card>
  );
}
