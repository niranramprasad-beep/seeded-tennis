"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { FamilyRole, Gender, Player, SchoolLite } from "@/lib/types";
import { getCurrentGrade, getCurrentSchoolYear, getDefaultCommitDate } from "@/lib/time";
import { classifySchoolFit, countSchoolFits, schoolUtrRange, utrToPct, type FitCounts } from "@/lib/school-fit";
import { usePlayer } from "@/lib/context/player-context";
import { signUp, signInWithGoogle } from "@/lib/auth";
import { FitBadge, type FitBand } from "@/components/seeded/ui/fit-badge";
import { DataChip } from "@/components/seeded/ui/data-chip";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { SeededButton } from "@/components/seeded/ui/button";

// Pixel-exact to Onboarding.dc.html — the public, pre-auth "fit report
// before account creation" journey. Seeded-only: Legacy's /onboarding keeps
// its existing AuthGate-wrapped OnboardingFlow entirely unchanged (see
// app/onboarding/page.tsx). Under-13 handling and Google OAuth are real,
// not fabricated — see the phase report for what's genuinely wired vs. what
// needs external configuration (Google provider in Supabase) to finish.
export function SeededPreAuthOnboarding({ schools }: { schools: SchoolLite[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const { beginSession } = usePlayer();

  const [utr, setUtr] = useState(() => params.get("utr") ?? "7");
  const [gradYear, setGradYear] = useState(() => Number(params.get("gradYear")) || gradYearOptions()[1]);
  const [gender, setGender] = useState<Gender>(() => (params.get("gender") as Gender) || "women");
  const [gpa, setGpa] = useState(() => params.get("gpa") ?? "3.5");
  const [editing, setEditing] = useState(!params.get("utr"));

  const utrNum = parseFloat(utr) || 0;
  const filtered = useMemo(() => schools.filter((s) => s.gender === gender), [schools, gender]);
  const counts = useMemo(() => countSchoolFits(utrNum, filtered), [utrNum, filtered]);
  const total = counts.reach + counts.target + counts.likely;

  const [tab, setTab] = useState<FitBand>("target");
  const tabRows = useMemo(
    () =>
      filtered
        .filter((s) => classifySchoolFit(utrNum, s) === tab)
        .sort((a, b) => a.minCompetitiveUTR - b.minCompetitiveUTR),
    [filtered, utrNum, tab]
  );

  if (editing) {
    return (
      <LevelForm
        utr={utr}
        setUtr={setUtr}
        gradYear={gradYear}
        setGradYear={setGradYear}
        gender={gender}
        setGender={setGender}
        gpa={gpa}
        setGpa={setGpa}
        onContinue={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-57px)] bg-cream">
      <header className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-6 py-[18px]">
        <Link href="/" className="font-seeded text-xl font-bold text-ink">
          Seeded
        </Link>
        <ol aria-label="Progress" className="m-0 flex flex-1 flex-wrap justify-center gap-2 p-0 text-[13px] text-stone">
          <ProgressChip done>1 · Your level</ProgressChip>
          <ProgressChip active>2 · Your fit report</ProgressChip>
          <ProgressChip>3 · Save it</ProgressChip>
          <ProgressChip>4 · Your plan</ProgressChip>
        </ol>
      </header>

      <main className="mx-auto flex max-w-[1200px] flex-wrap items-start gap-6 px-6 pb-16 pt-4">
        <section className="min-w-0 flex-[999_1_640px]">
          <p className="m-0 text-sm text-stone">
            {GENDER_LABEL[gender]} · UTR {utrNum.toFixed(1)} · Class of {gradYear} · GPA {gpa}{" "}
            <button onClick={() => setEditing(true)} className="font-semibold text-grass hover:text-grass-700">
              Edit
            </button>
          </p>
          <h1 className="mt-2 font-seeded text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-ink">
            You&apos;re a realistic target for {counts.target} programs.
          </h1>
          <p className="mt-2 text-base text-stone">
            Sorted by how well your rating, graduating seniors and academics
            line up. Bands update every time you log a result.
          </p>

          <div role="tablist" aria-label="Fit bands" className="mt-6 flex flex-wrap gap-2">
            {(["reach", "target", "likely"] as const).map((band) => (
              <button
                key={band}
                role="tab"
                aria-selected={tab === band}
                onClick={() => setTab(band)}
                className={
                  tab === band
                    ? "min-h-11 rounded-lg border border-ink bg-ink px-4 font-sans text-[15px] font-semibold text-cream"
                    : "min-h-11 rounded-lg border border-line bg-card px-4 font-sans text-[15px] font-semibold text-ink"
                }
              >
                {BAND_LABEL[band]}  {counts[band]}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-card">
            <div className="grid grid-cols-[2.2fr_2fr_90px_90px] gap-4 border-b border-line px-5 py-3 text-[13px] font-medium text-stone">
              <span>Program</span>
              <span>Your UTR vs team range</span>
              <span>Openings</span>
              <span>Academics</span>
            </div>
            {tabRows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-stone">
                No {BAND_LABEL[tab].toLowerCase()} programs for this UTR and team yet.
              </p>
            ) : (
              tabRows.map((s) => {
                const range = schoolUtrRange(s);
                return (
                  <div
                    key={s.id}
                    className="grid grid-cols-[2.2fr_2fr_90px_90px] items-center gap-4 border-b border-line px-5 py-3.5 last:border-0"
                  >
                    <div>
                      <strong className="text-[15px] text-ink">{s.shortName}</strong>
                      <div className="text-[13px] text-stone">
                        {s.division} · {s.conference} · {s.state}
                      </div>
                    </div>
                    <RangeBar
                      rangeStartPct={utrToPct(range.min)}
                      rangeEndPct={utrToPct(range.max)}
                      medianPct={utrToPct((range.min + range.max) / 2)}
                      youPct={utrToPct(utrNum)}
                      caption={`You ${utrNum.toFixed(1)} · team ${range.min.toFixed(1)}–${range.max.toFixed(1)}`}
                    />
                    <DataChip status="missing">Not tracked</DataChip>
                    <DataChip status="missing">Not tracked</DataChip>
                  </div>
                );
              })
            )}
            <p className="m-0 px-5 py-3 text-[13px] text-stone">
              Every range shows its source and verification date once a
              school&apos;s roster is connected.
            </p>
          </div>
        </section>

        <SaveReportAside
          utr={utrNum}
          gradYear={gradYear}
          gender={gender}
          onSaved={(player) => {
            beginSession(player);
            router.replace("/onboarding");
          }}
        />
      </main>
      <p className="mx-auto max-w-[1200px] px-6 pb-4 text-xs text-stone">
        Fit bands shown here use your UTR and each program&apos;s roster
        range — {total} programs for {GENDER_LABEL[gender]} in the catalog.
      </p>
    </div>
  );
}

const BAND_LABEL: Record<FitBand, string> = {
  reach: "Reach",
  target: "Target",
  likely: "Likely",
  "out-of-range": "Out of range",
  unverified: "Unverified",
};
const GENDER_LABEL: Record<Gender, string> = { women: "Women's", men: "Men's" };

function ProgressChip({ children, done, active }: { children: React.ReactNode; done?: boolean; active?: boolean }) {
  return (
    <li
      className={
        done
          ? "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-grass-100 bg-grass-50 px-2.5 py-1 text-xs font-semibold text-grass"
          : active
            ? "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-ink bg-ink px-2.5 py-1 text-xs font-semibold text-cream"
            : "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-stone"
      }
    >
      {children}
    </li>
  );
}

function gradYearOptions(): number[] {
  const start = getCurrentSchoolYear();
  return Array.from({ length: 6 }, (_, i) => start + i);
}

/* ------------------------------------------------------------ STEP 1 */

function LevelForm({
  utr,
  setUtr,
  gradYear,
  setGradYear,
  gender,
  setGender,
  gpa,
  setGpa,
  onContinue,
}: {
  utr: string;
  setUtr: (v: string) => void;
  gradYear: number;
  setGradYear: (v: number) => void;
  gender: Gender;
  setGender: (v: Gender) => void;
  gpa: string;
  setGpa: (v: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md flex-col justify-center px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-grass">Your level</p>
      <h1 className="mt-2 font-seeded text-3xl font-bold text-ink">What&apos;s your level today?</h1>
      <p className="mt-2 text-stone">We&apos;ll compare you to real rosters right away — no account needed yet.</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
          Current UTR
          <input
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            className="h-11 rounded-md border border-input px-3 font-mono text-base tabular-nums text-ink"
            inputMode="decimal"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
          Grad year
          <select
            value={gradYear}
            onChange={(e) => setGradYear(Number(e.target.value))}
            className="h-11 rounded-md border border-input bg-card px-2.5 text-base text-ink"
          >
            {gradYearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
          Team
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender)}
            className="h-11 rounded-md border border-input bg-card px-2.5 text-base text-ink"
          >
            <option value="women">Women&apos;s</option>
            <option value="men">Men&apos;s</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
          Unweighted GPA
          <input
            value={gpa}
            onChange={(e) => setGpa(e.target.value)}
            className="h-11 rounded-md border border-input px-3 font-mono text-base tabular-nums text-ink"
            inputMode="decimal"
          />
        </label>
      </div>
      <SeededButton className="mt-6" onClick={onContinue}>
        See my fit report
      </SeededButton>
    </div>
  );
}

/* --------------------------------------------------------- SAVE STEP */

const MIN_SELF_SERVE_AGE = 13;

function SaveReportAside({
  utr,
  gradYear,
  gender,
  onSaved,
}: {
  utr: number;
  gradYear: number;
  gender: Gender;
  onSaved: (player: Player) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<FamilyRole>("player");
  const [birthYear, setBirthYear] = useState(() => new Date().getFullYear() - 16);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const age = new Date().getFullYear() - birthYear;
  const underAge = age < MIN_SELF_SERVE_AGE;

  const save = async () => {
    setError(null);
    if (!name.trim() || !/\S+@\S+\.\S+/.test(email) || password.length < 6) {
      setError("Enter your name, a valid email, and a password of 6+ characters.");
      return;
    }
    setSubmitting(true);
    const grade = Math.min(12, Math.max(8, getCurrentGrade(gradYear)));
    const result = await signUp(
      {
        name,
        email,
        password,
        country: "United States",
        gender: gender === "women" ? "female" : "male",
        grade,
        role,
      },
      { mode: "create" }
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    if (result.confirmationRequired) {
      setError("Check your inbox to confirm your email, then sign in to continue.");
      return;
    }
    onSaved({
      name,
      currentUTR: utr,
      graduationYear: gradYear,
      commitmentDate: getDefaultCommitDate(gradYear),
      gender: gender === "women" ? "female" : "male",
      country: "United States",
      role,
      familyCode: result.familyCode,
      targetSchoolSlugs: [],
      weaknesses: [],
      tournamentsPlayed: 0,
      tournamentsGoal: 12,
      onboarded: false,
    });
  };

  return (
    <aside className="min-w-0 flex-[1_1_340px] rounded-xl border border-line bg-card p-6">
      <h2 className="m-0 text-xl text-ink">Save your report</h2>
      <p className="mt-2 text-[15px] leading-[1.5] text-stone">
        Free account. We&apos;ll tell you when a school changes band, and
        turn this into a plan.
      </p>

      {underAge ? (
        <div className="mt-4.5 rounded-lg border border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] p-4 text-sm text-[rgb(var(--c-gold-tint-text))]">
          <p className="m-0 font-semibold">A parent creates the account and invites you.</p>
          <p className="mt-1.5">
            Players under 13 can&apos;t self-serve sign up here.
          </p>
          <Link href="/parent-signup" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-grass px-[18px] text-[15px] font-semibold text-on-primary">
            Go to parent sign-up
          </Link>
        </div>
      ) : (
        <>
          <button
            onClick={async () => {
              setGoogleLoading(true);
              const result = await signInWithGoogle();
              setGoogleLoading(false);
              if (!result.ok) setError(result.error ?? "Couldn't start Google sign-in.");
            }}
            disabled={googleLoading}
            className="mt-4.5 flex min-h-11 w-full items-center justify-center rounded-lg border border-input bg-card font-sans text-[15px] font-semibold text-ink hover:bg-subtle-hover disabled:opacity-60"
          >
            {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue with Google"}
          </button>
          <div className="my-4 flex items-center gap-3 text-[13px] text-stone">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
            Full name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-md border border-input px-3 text-base text-ink"
            />
          </label>
          <label className="mt-3 flex flex-col gap-1.5 text-[13px] font-medium text-stone">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="h-11 rounded-md border border-input px-3 text-base text-ink"
            />
          </label>
          <label className="mt-3 flex flex-col gap-1.5 text-[13px] font-medium text-stone">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6+ characters"
              className="h-11 rounded-md border border-input px-3 text-base text-ink"
            />
          </label>

          <fieldset className="m-0 mt-3.5 border-0 p-0">
            <legend className="mb-1.5 text-[13px] font-medium text-stone">I am the</legend>
            <div className="flex gap-2">
              {(["player", "parent"] as const).map((r) => (
                <label
                  key={r}
                  className={
                    role === r
                      ? "inline-flex min-h-9 cursor-pointer items-center rounded-pill border border-ink bg-ink px-3.5 text-sm text-cream"
                      : "inline-flex min-h-9 cursor-pointer items-center rounded-pill border border-line bg-card px-3.5 text-sm text-ink"
                  }
                >
                  <input
                    type="radio"
                    name="who"
                    checked={role === r}
                    onChange={() => setRole(r)}
                    className="sr-only"
                  />
                  {r === "player" ? "Player" : "Parent"}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mt-3.5 flex flex-col gap-1.5 text-[13px] font-medium text-stone">
            Birth year
            <select
              value={birthYear}
              onChange={(e) => setBirthYear(Number(e.target.value))}
              className="h-11 rounded-md border border-input bg-card px-2.5 text-base text-ink"
            >
              {Array.from({ length: 18 }, (_, i) => new Date().getFullYear() - 8 - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-stone">Under 13? A parent creates the account and invites you.</p>

          {error && <p className="mt-3 rounded-lg bg-error-bg px-3 py-2 text-sm text-error">{error}</p>}

          <SeededButton className="mt-4.5 w-full" onClick={save} disabled={submitting} loading={submitting}>
            Save and build my plan
          </SeededButton>
          <p className="mt-3 text-center text-xs text-stone">No card. We never sell player data.</p>
        </>
      )}
    </aside>
  );
}
