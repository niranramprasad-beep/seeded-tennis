"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Search, UserCheck, UserPlus, Users } from "lucide-react";
import { AuthGate } from "@/components/shared/auth-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  loadFriendships,
  searchProfiles,
  sendFriendRequest,
  updateFriendship,
  updateProfileDiscovery,
  type FriendProfile,
  type Friendship,
} from "@/lib/supabase/features";
import { formatUTR } from "@/lib/utils";

export function FriendsView() {
  return (
    <AuthGate>
      <FriendsInner />
    </AuthGate>
  );
}

function FriendsInner() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [privacyLevel, setPrivacyLevel] = useState<FriendProfile["privacyLevel"]>("friends");
  const [status, setStatus] = useState("Search by name or email.");

  const refresh = () => loadFriendships().then(setFriendships);
  useEffect(() => {
    refresh();
  }, []);

  const accepted = useMemo(() => friendships.filter((f) => f.status === "accepted"), [friendships]);
  const pending = useMemo(() => friendships.filter((f) => f.status === "pending"), [friendships]);

  const search = async () => {
    const rows = await searchProfiles(query);
    setResults(rows);
    setStatus(rows.length ? `${rows.length} player${rows.length === 1 ? "" : "s"} found.` : "No matching players found.");
  };

  const request = async (id: string) => {
    await sendFriendRequest(id);
    setStatus("Friend request sent.");
    await refresh();
  };

  const saveDiscovery = async () => {
    await updateProfileDiscovery({ privacyLevel });
    setStatus("Privacy settings saved.");
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="eyebrow text-gold">Teammates</span>
          <h1 className="display-serif mt-3 text-4xl text-ink sm:text-5xl">
            Train around people who make you sharper.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone">
            Search Seeded users, request friends, and compare training momentum.
          </p>
        </div>
        <Badge variant="leaf" size="md">
          <Users className="h-4 w-4" />
          {accepted.length} friends
        </Badge>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-medium text-ink">Discovery settings</h2>
            <select
              value={privacyLevel}
              onChange={(e) => setPrivacyLevel(e.target.value as FriendProfile["privacyLevel"])}
              className="mt-4 h-11 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-grass/30"
            >
              <option value="public">Public</option>
              <option value="friends">Friends only</option>
              <option value="private">Private</option>
            </select>
            <Button className="mt-4 w-full" onClick={saveDiscovery}>
              Save settings
            </Button>
          </Card>

          <Card className="p-5">
            <h2 className="font-medium text-ink">Find players</h2>
            <div className="mt-4 flex gap-2">
              <input
                className="h-11 min-w-0 flex-1 rounded-xl border-[0.5px] border-line bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-grass/30"
                placeholder="Email or name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button size="sm" onClick={search}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-3 text-xs text-stone-light">{status}</p>
          </Card>
        </div>

        <div className="space-y-5">
          {results.length > 0 && (
            <Card className="p-5">
              <h2 className="font-medium text-ink">Search results</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {results.map((profile) => (
                  <FriendCard
                    key={profile.id}
                    profile={profile}
                    action={
                      <Button size="sm" variant="outline" onClick={() => request(profile.id)}>
                        <UserPlus className="h-4 w-4" />
                        Request
                      </Button>
                    }
                  />
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="font-medium text-ink">Requests</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {pending.length ? (
                pending.map((friendship) => (
                  <FriendCard
                    key={friendship.id}
                    profile={friendship.profile}
                    action={
                      <Button size="sm" onClick={async () => {
                        await updateFriendship(friendship.id, "accepted");
                        await refresh();
                      }}>
                        <UserCheck className="h-4 w-4" />
                        Accept
                      </Button>
                    }
                  />
                ))
              ) : (
                <p className="text-sm text-stone">No pending requests.</p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-medium text-ink">Friends comparison</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {accepted.length ? (
                accepted.map((friendship) => (
                  <FriendCard key={friendship.id} profile={friendship.profile} />
                ))
              ) : (
                <p className="text-sm text-stone">Add a teammate to compare current UTR and recent activity.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FriendCard({ profile, action }: { profile: FriendProfile; action?: ReactNode }) {
  return (
    <div className="rounded-[18px] border-[0.5px] border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{profile.name}</p>
          <p className="mt-1 text-xs text-stone-light">{profile.email}</p>
        </div>
        <Badge variant="outline">{formatUTR(profile.currentUtr)} UTR</Badge>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs capitalize text-stone">{profile.privacyLevel}</span>
        {action}
      </div>
    </div>
  );
}
