"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Compass,
  DollarSign,
  Gauge,
  Lightbulb,
  MapPin,
  MinusCircle,
  Sparkles,
  Swords,
  XCircle,
} from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  evaluateTournamentFit,
  LEVELS,
  UTR_MAX,
  UTR_MIN,
  type FitLevel,
  type FitResult,
} from "@/lib/tournament-fit";

const inputClass =
  "h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";

const VERDICT_META = {
  good: {
    label: "GOOD FIT",
    icon: CheckCircle2,
    blurb: "This event checks out — the field, cost, and travel all pull in your favor.",
    card: "border-grass/40 bg-grass text-cream",
    chip: "bg-cream/15 text-cream",
    bar: "bg-tennis",
  },
  decent: {
    label: "DECENT FIT",
    icon: MinusCircle,
    blurb: "Playable, with trade-offs. Worth entering if the calendar has room — see what's dragging it down below.",
    card: "border-gold/50 bg-[#8A6D2F] text-cream",
    chip: "bg-cream/15 text-cream",
    bar: "bg-[#E9C566]",
  },
  bad: {
    label: "BAD FIT",
    icon: XCircle,
    blurb: "Hard pass for now — this event won't give you results, value, or both.",
    card: "border-[#9C3B22]/50 bg-[#8F3A24] text-cream",
    chip: "bg-cream/15 text-cream",
    bar: "bg-[#F0A98F]",
  },
} as const;

export function TournamentFitView() {
  const { player, isAuthed, hydrated } = usePlayer();

  const [name, setName] = useState("");
  const [level, setLevel] = useState<FitLevel>("L4");
  const [location, setLocation] = useState("");
  const [travelMode, setTravelMode] = useState<"hours" | "miles">("hours");
  const [travelValue, setTravelValue] = useState("");
  const [drawKnown, setDrawKnown] = useState(false);
  const [drawUtr, setDrawUtr] = useState("");
  const [entryCost, setEntryCost] = useState("");
  const [travelCost, setTravelCost] = useState("");
  const [utr, setUtr] = useState("");
  const [goalUtr, setGoalUtr] = useState("");
  const [utrTouched, setUtrTouched] = useState(false);

  const [error, setError] = useState("");
  const [result, setResult] = useState<(FitResult & { name: string }) | null>(null);

  // Prefill the player's UTR from their profile once the session hydrates.
  const effectiveUtr =
    utrTouched || !hydrated || !isAuthed || player.currentUTR <= 0
      ? utr
      : utr || player.currentUTR.toFixed(1);

  const levelInfo = useMemo(() => LEVELS.find((l) => l.value === level), [level]);

  const run = () => {
    setError("");
    const playerUtr = Number(effectiveUtr);
    if (!Number.isFinite(playerUtr) || playerUtr < UTR_MIN || playerUtr > UTR_MAX) {
      setError("Enter your UTR — any rating from 1.00 to 16.50.");
      return;
    }
    const draw = drawKnown && drawUtr !== "" ? Number(drawUtr) : null;
    if (draw !== null && (!Number.isFinite(draw) || draw < UTR_MIN || draw > UTR_MAX)) {
      setError("Draw strength must be a UTR between 1.00 and 16.50.");
      return;
    }
    const goal = goalUtr !== "" ? Number(goalUtr) : null;
    if (goal !== null && (!Number.isFinite(goal) || goal < UTR_MIN || goal > UTR_MAX)) {
      setError("Goal UTR must be between 1.00 and 16.50.");
      return;
    }
    const travel = travelValue !== "" ? Number(travelValue) : null;
    if (travel !== null && (!Number.isFinite(travel) || travel < 0)) {
      setError(`Enter the travel ${travelMode === "hours" ? "time in hours" : "distance in miles"} (or leave it blank).`);
      return;
    }

    const fit = evaluateTournamentFit({
      name: name.trim() || "This tournament",
      level,
      playerUtr,
      goalUtr: goal,
      drawUtr: draw,
      travelHours: travelMode === "hours" ? travel : null,
      distanceMiles: travelMode === "miles" ? travel : null,
      entryCost: Number(entryCost) || 0,
      travelCost: Number(travelCost) || 0,
    });
    setResult({ ...fit, name: name.trim() || "This tournament" });
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="max-w-2xl">
        <span className="eyebrow text-gold">Tournament fit finder</span>
        <h1 className="display-serif mt-3 text-4xl text-ink sm:text-5xl">
          Is this tournament <span className="serif-accent text-grass">worth it</span>?
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-stone">
          Weigh the draw, the cost, and the drive before you enter. UTR moves on
          results against opponents near your rating — this tool tells you
          whether an event can actually give you those results.
        </p>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[440px_1fr]">
        {/* ------------------------------------------------------------ form */}
        <Card className="h-fit p-6">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-grass" />
            <h2 className="text-lg font-medium text-ink">The tournament</h2>
          </div>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-stone-light">
                Tournament name
              </span>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="USTA L4 Bethesda Spring Open"
              />
            </label>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-stone-light">
                Level
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setLevel(l.value)}
                    className={cn(
                      "rounded-xl border-[0.5px] px-2 py-2 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-grass/30",
                      level === l.value
                        ? "border-grass bg-grass text-cream"
                        : "border-line bg-card text-stone hover:text-ink"
                    )}
                  >
                    {l.value === "utr" ? "UTR" : l.value}
                  </button>
                ))}
              </div>
              {levelInfo && (
                <p className="mt-2 text-xs leading-relaxed text-stone">
                  <span className="font-medium text-ink">{levelInfo.label}.</span>{" "}
                  {levelInfo.description}
                </p>
              )}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-stone-light">
                Location <span className="font-normal">(optional)</span>
              </span>
              <input
                className={inputClass}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="College Park, MD"
              />
            </label>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-stone-light">
                  Travel from home
                </span>
                <div className="flex gap-1">
                  {(["hours", "miles"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setTravelMode(mode)}
                      className={cn(
                        "rounded-pill px-2.5 py-1 text-[11px] font-medium transition-colors",
                        travelMode === mode
                          ? "bg-grass text-cream"
                          : "bg-grass-50 text-stone hover:text-ink"
                      )}
                    >
                      {mode === "hours" ? "Time (hrs)" : "Distance (mi)"}
                    </button>
                  ))}
                </div>
              </div>
              <input
                className={inputClass}
                type="number"
                min={0}
                step={travelMode === "hours" ? 0.5 : 5}
                value={travelValue}
                onChange={(e) => setTravelValue(e.target.value)}
                placeholder={travelMode === "hours" ? "2.5" : "140"}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-stone-light">
                  Draw strength
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setDrawKnown(true)}
                    className={cn(
                      "rounded-pill px-2.5 py-1 text-[11px] font-medium transition-colors",
                      drawKnown ? "bg-grass text-cream" : "bg-grass-50 text-stone hover:text-ink"
                    )}
                  >
                    I can estimate it
                  </button>
                  <button
                    onClick={() => setDrawKnown(false)}
                    className={cn(
                      "rounded-pill px-2.5 py-1 text-[11px] font-medium transition-colors",
                      !drawKnown ? "bg-grass text-cream" : "bg-grass-50 text-stone hover:text-ink"
                    )}
                  >
                    Not sure
                  </button>
                </div>
              </div>
              {drawKnown ? (
                <>
                  <input
                    className={inputClass}
                    type="number"
                    min={UTR_MIN}
                    max={UTR_MAX}
                    step={0.1}
                    value={drawUtr}
                    onChange={(e) => setDrawUtr(e.target.value)}
                    placeholder="Average UTR of entrants, e.g. 8.5"
                  />
                  <p className="mt-1.5 text-[11px] leading-relaxed text-stone-light">
                    Check the entry list or last year's draw for typical entrant ratings.
                  </p>
                </>
              ) : (
                <p className="rounded-xl bg-cream/70 px-3.5 py-2.5 text-xs leading-relaxed text-stone">
                  We'll estimate the field from the level — a real draw average is
                  always more accurate if you can find one.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-stone-light">
                  Entry fee ($)
                </span>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={entryCost}
                  onChange={(e) => setEntryCost(e.target.value)}
                  placeholder="95"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-stone-light">
                  Travel cost est. ($)
                </span>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={travelCost}
                  onChange={(e) => setTravelCost(e.target.value)}
                  placeholder="250"
                />
              </label>
            </div>

            <div className="border-t-[0.5px] border-line pt-4">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-grass" />
                <h3 className="text-sm font-medium text-ink">You</h3>
                {hydrated && isAuthed && !utrTouched && player.currentUTR > 0 && (
                  <Badge variant="lime" size="sm">From your profile</Badge>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-stone-light">
                    Your UTR (1–16.5)
                  </span>
                  <input
                    className={inputClass}
                    type="number"
                    min={UTR_MIN}
                    max={UTR_MAX}
                    step={0.01}
                    value={effectiveUtr}
                    onChange={(e) => {
                      setUtrTouched(true);
                      setUtr(e.target.value);
                    }}
                    placeholder="8.2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-stone-light">
                    Goal UTR <span className="font-normal">(optional)</span>
                  </span>
                  <input
                    className={inputClass}
                    type="number"
                    min={UTR_MIN}
                    max={UTR_MAX}
                    step={0.1}
                    value={goalUtr}
                    onChange={(e) => setGoalUtr(e.target.value)}
                    placeholder="9.5"
                  />
                </label>
              </div>
            </div>

            {error && (
              <p className="rounded-xl bg-[#FBEAE5] px-4 py-3 text-sm text-[#9C3B22]">
                {error}
              </p>
            )}

            <Button className="w-full" size="lg" onClick={run}>
              <Sparkles className="h-4 w-4" />
              Get the verdict
            </Button>
          </div>
        </Card>

        {/* ---------------------------------------------------------- result */}
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key={`${result.name}-${result.score}-${result.verdict}`}
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ type: "spring", stiffness: 220, damping: 24 }}
              >
                <VerdictCard result={result} location={location} />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Card className="flex min-h-[420px] items-center justify-center p-10 text-center">
                  <div className="max-w-sm">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-grass-50 text-grass">
                      <Swords className="h-6 w-6" />
                    </span>
                    <h2 className="mt-4 text-xl font-medium text-ink">
                      Size up an event before you enter
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-stone">
                      Fill in the tournament on the left and Seeded will weigh the
                      draw against your rating, the cost per match, and the travel —
                      then call it: good fit, decent fit, or bad fit.
                    </p>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function VerdictCard({
  result,
  location,
}: {
  result: FitResult & { name: string };
  location: string;
}) {
  const meta = VERDICT_META[result.verdict];
  const Icon = meta.icon;

  return (
    <div className="space-y-4">
      {/* verdict banner */}
      <Card className={cn("overflow-hidden border-2 p-0", meta.card)}>
        <div className="p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
                className="flex items-center gap-2.5"
              >
                <Icon className="h-7 w-7" />
                <span className="text-2xl font-semibold tracking-wide sm:text-3xl">
                  {meta.label}
                </span>
              </motion.div>
              <p className="mt-2 truncate font-serif text-lg italic opacity-90">
                {result.name}
                {location ? ` · ${location}` : ""}
              </p>
              <p className="mt-3 max-w-md text-sm leading-relaxed opacity-85">
                {meta.blurb}
              </p>
            </div>
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 240, damping: 16, delay: 0.25 }}
              className={cn(
                "flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full",
                meta.chip
              )}
            >
              <span className="text-3xl font-light">{result.score}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
                fit score
              </span>
            </motion.div>
          </div>

          {/* breakdown bars */}
          <div className="mt-6 space-y-3">
            <ScoreBar
              icon={Swords}
              label={result.drawEstimated ? "Competition (est. from level)" : "Competition"}
              value={result.competitionScore}
              barClass={meta.bar}
              delay={0.35}
            />
            <ScoreBar
              icon={DollarSign}
              label={`Cost value · ~$${Math.round(result.costPerMatch)}/match`}
              value={result.costScore}
              barClass={meta.bar}
              delay={0.45}
            />
            <ScoreBar
              icon={MapPin}
              label="Travel burden"
              value={result.travelScore}
              barClass={meta.bar}
              delay={0.55}
            />
          </div>
        </div>
      </Card>

      {/* reasons */}
      <Card className="p-6">
        <h3 className="text-lg font-medium text-ink">Why</h3>
        <ul className="mt-3 space-y-2.5">
          {result.reasons.map((reason, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
              className="flex items-start gap-2.5 text-sm leading-relaxed text-stone"
            >
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  reason.tone === "positive" && "bg-grass",
                  reason.tone === "neutral" && "bg-gold",
                  reason.tone === "negative" && "bg-[#C0563A]"
                )}
              />
              {reason.text}
            </motion.li>
          ))}
        </ul>
      </Card>

      {/* suggestions */}
      {result.suggestions.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-gold" />
            <h3 className="text-lg font-medium text-ink">Make it a better call</h3>
          </div>
          <ul className="mt-3 space-y-2">
            {result.suggestions.map((tip, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-stone">
                <span className="mt-0.5 font-serif italic text-grass">{i + 1}.</span>
                {tip}
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t-[0.5px] border-line pt-3 text-xs leading-relaxed text-stone-light">
            Directional guidance, not a guarantee — draw strength varies year to
            year, so always check the actual entry list. Total estimated spend for
            this event: ${Math.round(result.totalCost)}.
          </p>
        </Card>
      )}
    </div>
  );
}

function ScoreBar({
  icon: Icon,
  label,
  value,
  barClass,
  delay,
}: {
  icon: typeof MapPin;
  label: string;
  value: number;
  barClass: string;
  delay: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium opacity-90">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <span>{value}/100</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-cream/20">
        <motion.div
          className={cn("h-full rounded-pill", barClass)}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
        />
      </div>
    </div>
  );
}
