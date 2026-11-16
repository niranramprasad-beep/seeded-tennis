"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Check, Copy, LogOut } from "lucide-react";
import type { SubscriptionTier } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { requestPasswordReset } from "@/lib/auth";
import { loadMySignInInfo, type SignInInfo } from "@/lib/db/account";
import { loadFamilyMembers, type FamilyMember } from "@/lib/db/family";
import { loadMyFamilyCode } from "@/lib/db/family-join";
import { firstNameLastInitial, pickFamilyPlayer } from "@/lib/family-view";
import { getText, postJson } from "@/lib/api-client";
import { localDateKey } from "@/lib/time";
import { downloadTextFile } from "@/lib/data/export-csv";
import { slugify } from "@/lib/utils";
import { SeededButton } from "@/components/seeded/ui/button";
import { SeededSettingsShell, type SettingsTabId } from "./seeded-settings-shell";
import { AppearanceCard } from "./appearance-card";
import { PrivacyCard } from "./privacy-card";
import { FamilyMembersCard } from "@/components/seeded/family/family-members-card";
import { ParentScopeLine } from "@/components/seeded/family/parent-scope-line";

const TIER_LABEL: Record<SubscriptionTier, string> = {
  free: "Free",
  player: "Player plan",
  family: "Family plan",
};

const inputClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";

// /settings for a PARENT account.
//
// It used to be the player's Settings: a "Player profile" card with Team,
// UTR profile link, GPA and grad year, and a Save button — on an account
// whose sidebar said "Parent view · read-only". The fields were the parent's
// OWN profile columns, which nothing reads, so the form was both a
// contradiction and a way to write invented stats onto a parent's row (the
// player form round-trips gender and graduation_year, defaulted, on every
// save). A parent's Settings is about the parent.
//
// Server side, /api/profile now writes ONLY `name` for a parent account
// (it reads the role from the caller's own row, never the body), so this
// screen is not the only thing standing between a parent and those fields.
export function ParentSettingsView() {
  const { player, signOut } = usePlayer();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTabId>("profile");

  const [downloading, setDownloading] = useState<"everything" | "spreadsheet" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDownloadEverything = async () => {
    setDownloading("everything");
    setExportError(null);
    try {
      const json = await getText("/api/account/export");
      downloadTextFile(`seeded-everything-${slugify(player.name || "account")}-${localDateKey()}.json`, json);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not build your download.");
    } finally {
      setDownloading(null);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await postJson("/api/account/deletion", { action: "delete", confirm: "DELETE" });
      signOut();
      router.replace("/?deleted=1");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete your account. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  const privacy = (
    <PrivacyCard
      onDownloadEverything={handleDownloadEverything}
      downloading={downloading}
      onDelete={deleteAccount}
      deleting={deleting}
      deleteError={deleteError}
      exportError={exportError}
      audience="parent"
    />
  );

  return (
    <SeededSettingsShell active={activeTab} onTabChange={setActiveTab}>
      <ParentScopeLine />
      {activeTab === "profile" && (
        <>
          <ParentAccountCard
            onSignOut={() => {
              signOut();
              router.push("/");
            }}
          />
          <LinkedPlayersCard />
          <AppearanceCard />
        </>
      )}
      {activeTab === "family" && <ParentFamilyTab />}
      {activeTab === "privacy" && privacy}
    </SeededSettingsShell>
  );
}

/* ------------------------------------------------------------ your account */

function ParentAccountCard({ onSignOut }: { onSignOut: () => void }) {
  const { player, updatePlayer } = usePlayer();
  const { tier } = useTier();
  const router = useRouter();
  const { data: signIn } = useSWR<SignInInfo>("my-sign-in-info", () => loadMySignInInfo());

  const [name, setName] = useState(player.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [resetState, setResetState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resetError, setResetError] = useState<string | null>(null);

  const trimmed = name.trim();
  const dirty = trimmed !== player.name.trim();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) {
      setNameError("Enter your name.");
      return;
    }
    setNameError(null);
    setSaving(true);
    const ok = await updatePlayer({ name: trimmed });
    setSaving(false);
    if (!ok) {
      setNameError("Could not save your name. Try again.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const sendReset = async () => {
    if (!signIn?.email) return;
    setResetState("sending");
    setResetError(null);
    const result = await requestPasswordReset(signIn.email);
    if (result.ok) {
      setResetState("sent");
    } else {
      setResetState("error");
      setResetError("Could not send the reset link. Try again in a few minutes.");
    }
  };

  return (
    <section aria-labelledby="parent-account-heading" className="rounded-xl border border-line bg-card p-6">
      <h2 id="parent-account-heading" className="text-lg font-semibold text-ink">
        Your account
      </h2>
      <p className="mt-1 text-sm text-stone">This is about you, the parent — not your player.</p>

      <form onSubmit={save} noValidate className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="parent-name" className="mb-1.5 block text-sm font-medium text-stone">
            Your name
          </label>
          <input
            id="parent-name"
            className={inputClass}
            value={name}
            autoComplete="name"
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "parent-name-error" : undefined}
          />
          {nameError && (
            <p id="parent-name-error" role="alert" className="mt-1.5 text-sm text-error">
              {nameError}
            </p>
          )}
        </div>
        <div>
          <p className="mb-1.5 block text-sm font-medium text-stone">Email</p>
          <p className="flex h-11 items-center truncate rounded-md border border-line bg-cream/50 px-3 text-base text-ink">
            {signIn?.email ?? "…"}
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 sm:col-span-2">
          <span aria-live="polite" className="text-sm text-grass">
            {saved && (
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" aria-hidden /> Saved
              </span>
            )}
          </span>
          <SeededButton type="submit" loading={saving} disabled={!dirty}>
            Save name
          </SeededButton>
        </div>
      </form>

      <div className="mt-5 border-t border-line pt-5">
        <h3 className="text-[15px] font-semibold text-ink">Signing in</h3>
        {signIn?.method === "google" ? (
          <p className="mt-1 text-sm text-stone">
            Your account uses Google sign-in, so there is no Seeded password to change. Your Google account manages it.
          </p>
        ) : signIn?.method === "email" ? (
          <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-stone">
              You sign in with your email and a password. To change the password, request a reset link by email.
            </p>
            <SeededButton
              type="button"
              variant="secondary"
              loading={resetState === "sending"}
              disabled={resetState === "sent"}
              onClick={sendReset}
              className="shrink-0"
            >
              {resetState === "sent" ? "Link sent" : "Email me a reset link"}
            </SeededButton>
          </div>
        ) : (
          <p className="mt-1 text-sm text-stone">Loading how you sign in…</p>
        )}
        <p aria-live="polite" className="mt-2 text-sm">
          {resetState === "sent" && signIn?.email && (
            <span className="text-grass">Check {signIn.email} for a link to set a new password.</span>
          )}
          {resetState === "error" && resetError && <span className="text-error">{resetError}</span>}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <div>
          <p className="text-sm text-stone">Plan</p>
          <p className="mt-1 font-medium text-ink">{TIER_LABEL[tier]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SeededButton type="button" variant="secondary" onClick={() => router.push("/settings/billing")}>
            Billing
          </SeededButton>
          <SeededButton type="button" variant="secondary" onClick={onSignOut}>
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </SeededButton>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- linked players */

function LinkedPlayersCard() {
  const { data: members, error } = useSWR<FamilyMember[]>("family-members", () => loadFamilyMembers());
  const players = (members ?? []).filter((m) => m.role === "player");
  const shown = pickFamilyPlayer(members ?? []);

  return (
    <section aria-labelledby="linked-players-heading" className="rounded-xl border border-line bg-card p-6">
      <h2 id="linked-players-heading" className="text-lg font-semibold text-ink">
        Your {players.length === 1 ? "player" : "players"}
      </h2>
      <p className="mt-1 text-sm text-stone">
        You can follow a player&apos;s progress here. Only the player can change their own profile,
        results, plan and outreach.
      </p>

      {members === undefined && !error ? (
        <div className="mt-4 h-[76px] animate-pulse rounded-lg bg-line/50 motion-reduce:animate-none" aria-hidden />
      ) : error ? (
        <p role="alert" className="mt-4 text-sm text-error">
          Could not load your family. Refresh the page to try again.
        </p>
      ) : players.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-line p-4">
          <p className="font-medium text-ink">No player has joined your family yet.</p>
          <p className="mt-1 text-sm text-stone">
            Share your family code from the Family tab. Once your player signs up with it and you
            approve them, they appear here.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {players.map((p) => {
            const short = firstNameLastInitial(p.name);
            const first = short.split(" ")[0];
            return (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-lg border border-line bg-cream/50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{short}</p>
                  <p className="text-sm text-stone">
                    {p.graduationYear != null ? `Class of ${p.graduationYear}` : "Class year not set"}
                    {players.length > 1 && p.id === shown?.id ? " · shown on your Overview" : ""}
                  </p>
                </div>
                {p.id === shown?.id ? (
                  <Link
                    href="/family/weekly-reports"
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-input bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover"
                  >
                    View {first}&apos;s report
                  </Link>
                ) : (
                  <p className="text-sm text-stone">
                    Reports show one player for now.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ family */

function ParentFamilyTab() {
  const { data: familyCode } = useSWR<string | null>("my-family-code", () => loadMyFamilyCode());
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!familyCode) return;
    void navigator.clipboard?.writeText(familyCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <section aria-labelledby="family-code-heading" className="rounded-xl border border-line bg-card p-6">
        <h2 id="family-code-heading" className="text-lg font-semibold text-ink">
          Family code
        </h2>
        <p className="mt-1 text-sm text-stone">
          Your player (or another parent) enters this when they sign up. Anyone who uses it waits
          until someone already in the family approves them.
        </p>
        <div className="mt-4 flex w-fit items-center gap-3 rounded-lg border border-line bg-cream/50 px-4 py-3">
          <span className="font-mono text-xl tracking-wider text-grass">
            {familyCode === undefined ? "…" : familyCode ?? "No family yet"}
          </span>
          {familyCode && (
            <button
              type="button"
              onClick={copy}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-grass-50 text-grass transition-colors hover:bg-grass-100"
              aria-label={copied ? "Family code copied" : "Copy family code"}
            >
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            </button>
          )}
        </div>
      </section>
      <FamilyMembersCard familyCode={familyCode ?? undefined} />
    </>
  );
}
