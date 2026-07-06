"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  Dumbbell,
  Activity,
  Zap,
  ArrowUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Player, PlayerGender, School, Weakness } from "@/lib/types";
import { programGenderFor } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { SchoolBadge } from "@/components/shared/school-badge";
import { GenderToggle } from "@/components/shared/gender-toggle";
import { FloatingDots } from "@/components/shared/floating-dots";
import { formatUTR, cn } from "@/lib/utils";

const GRADES = [8, 9, 10, 11, 12];
const MAX_SCHOOLS = 5;

const WEAKNESS_OPTIONS: {
  value: Weakness;
  label: string;
  desc: string;
  icon: LucideIcon;
}[] = [
  { value: "forehand", label: "Forehand", desc: "Turn it into a weapon", icon: Zap },
  { value: "backhand", label: "Backhand", desc: "Depth & variation", icon: Activity },
  { value: "serve", label: "Serve", desc: "Power & placement", icon: ArrowUp },
  { value: "fitness", label: "Fitness", desc: "Endurance & speed", icon: Dumbbell },
  { value: "mental", label: "Mental game", desc: "Compete under pressure", icon: Brain },
];

function utrBand(utr: number): string {
  if (utr < 6) return "Developing";
  if (utr < 8) return "Competitive";
  if (utr < 10.5) return "High performance";
  if (utr < 13) return "College-ready";
  return "Elite college level";
}

function graduationYearForGrade(grade: number): number {
  const now = new Date();
  // School year flips in August.
  const schoolYearEnd = now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
  return schoolYearEnd + (12 - grade);
}

const STEPS = ["Current UTR", "Grade", "Target schools", "Focus areas"];

export function OnboardingFlow({ schools }: { schools: School[] }) {
  const router = useRouter();
  const { player, completeOnboarding } = usePlayer();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  // Seed from the session player when arriving from sign-up.
  const [utr, setUtr] = useState(player.currentUTR || 7);
  const [grade, setGrade] = useState(player.grade || 10);
  const [gender, setGender] = useState<PlayerGender>(player.gender || "male");
  const [selected, setSelected] = useState<string[]>([]);
  const [weaknesses, setWeaknesses] = useState<Weakness[]>([]);

  const genderSchools = schools.filter(
    (s) => s.gender === programGenderFor(gender)
  );

  const progress = ((step + 1) / STEPS.length) * 100;

  const canContinue =
    step === 2 ? selected.length > 0 : true; // schools required, others optional

  const go = (dir: number) => {
    setDirection(dir);
    setStep((s) => Math.min(Math.max(s + dir, 0), STEPS.length - 1));
  };

  const toggleSchool = (slug: string) => {
    setSelected((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length < MAX_SCHOOLS
          ? [...prev, slug]
          : prev
    );
  };

  const toggleWeakness = (w: Weakness) => {
    setWeaknesses((prev) =>
      prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]
    );
  };

  const finish = () => {
    const graduationYear = graduationYearForGrade(grade);
    const next: Player = {
      ...player,
      currentUTR: utr,
      grade,
      graduationYear,
      commitmentDate: `${graduationYear - 1}-09-01`,
      gender,
      targetSchoolSlugs: selected,
      weaknesses,
      onboarded: true,
    };
    completeOnboarding(next);
    router.push("/dashboard");
  };

  const variants = {
    enter: (dir: number) => ({ x: dir * 64, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir * -64, opacity: 0 }),
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <FloatingDots />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col container-px py-10">
        {/* progress */}
        <div className="mb-10">
          <div className="mb-2 flex items-center justify-between text-xs text-stone">
            <span className="font-medium text-grass">
              Step {step + 1} of {STEPS.length}
            </span>
            <span>{STEPS[step]}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-pill bg-grass-50">
            <motion.div
              className="h-full rounded-pill bg-gradient-to-r from-leaf-accent to-grass"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* steps */}
        <div className="relative flex-1">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 0 && (
                <StepShell
                  eyebrow="Where you are today"
                  title="What's your current UTR?"
                  subtitle="Your Universal Tennis Rating anchors everything we build for you. Drag to your number."
                >
                  <div className="mt-10 text-center">
                    <div className="font-light tracking-tight text-grass">
                      <span className="text-7xl">{formatUTR(utr)}</span>
                    </div>
                    <Badge variant="leaf" size="md" className="mt-3">
                      {utrBand(utr)}
                    </Badge>
                  </div>
                  <div className="mt-10 px-1">
                    <Slider
                      value={utr}
                      min={1}
                      max={16.5}
                      step={0.25}
                      onChange={setUtr}
                      aria-label="Current UTR"
                    />
                    <div className="mt-2 flex justify-between text-xs text-stone-light">
                      <span>1.0</span>
                      <span>8.75</span>
                      <span>16.5</span>
                    </div>
                  </div>
                </StepShell>
              )}

              {step === 1 && (
                <StepShell
                  eyebrow="Your timeline"
                  title="What grade are you in?"
                  subtitle="This sets your recruiting window and how many seasons we have to work with."
                >
                  <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {GRADES.map((g) => {
                      const active = grade === g;
                      return (
                        <button
                          key={g}
                          onClick={() => setGrade(g)}
                          className={cn(
                            "flex flex-col items-center rounded-card border-[0.5px] px-3 py-5 transition-all",
                            active
                              ? "border-grass bg-grass text-cream shadow-soft"
                              : "border-line bg-card text-ink hover:-translate-y-0.5 hover:shadow-soft"
                          )}
                        >
                          <span className="text-2xl font-light">{g}th</span>
                          <span
                            className={cn(
                              "mt-1 text-[11px]",
                              active ? "text-cream/75" : "text-stone-light"
                            )}
                          >
                            grade
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-6 text-center text-sm text-stone">
                    You'd graduate in{" "}
                    <span className="font-medium text-grass">
                      {graduationYearForGrade(grade)}
                    </span>
                    .
                  </p>
                </StepShell>
              )}

              {step === 2 && (
                <StepShell
                  eyebrow="Your dream list"
                  title="Which schools are you targeting?"
                  subtitle={`Pick up to ${MAX_SCHOOLS}. You can always change these later.`}
                >
                  <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3">
                    <GenderToggle
                      value={programGenderFor(gender)}
                      onChange={(g) => {
                        setGender(g === "women" ? "female" : "male");
                        setSelected([]);
                      }}
                    />
                    <span className="text-sm text-stone">
                      {selected.length}/{MAX_SCHOOLS} selected
                    </span>
                  </div>
                  <div className="grid max-h-[42vh] gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
                    {genderSchools.map((s) => {
                      const active = selected.includes(s.slug);
                      const disabled = !active && selected.length >= MAX_SCHOOLS;
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggleSchool(s.slug)}
                          disabled={disabled}
                          className={cn(
                            "flex items-center gap-3 rounded-card border-[0.5px] p-3 text-left transition-all",
                            active
                              ? "border-grass bg-grass-50 shadow-soft"
                              : "border-line bg-card hover:shadow-soft",
                            disabled && "opacity-40"
                          )}
                        >
                          <SchoolBadge school={s} size={38} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">
                              {s.shortName}
                            </p>
                            <p className="truncate text-xs text-stone-light">
                              {s.conference} · min UTR {s.minCompetitiveUTR}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                              active
                                ? "border-grass bg-grass text-cream"
                                : "border-line"
                            )}
                          >
                            {active && <Check className="h-3 w-3" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </StepShell>
              )}

              {step === 3 && (
                <StepShell
                  eyebrow="Your game"
                  title="What do you want to improve?"
                  subtitle="We'll weight your training plan toward these. Choose as many as you like."
                >
                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    {WEAKNESS_OPTIONS.map((w) => {
                      const active = weaknesses.includes(w.value);
                      return (
                        <button
                          key={w.value}
                          onClick={() => toggleWeakness(w.value)}
                          className={cn(
                            "flex items-center gap-4 rounded-card border-[0.5px] p-4 text-left transition-all",
                            active
                              ? "border-grass bg-grass-50 shadow-soft"
                              : "border-line bg-card hover:-translate-y-0.5 hover:shadow-soft"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-11 w-11 items-center justify-center rounded-2xl transition-colors",
                              active
                                ? "bg-grass text-cream"
                                : "bg-grass-50 text-grass"
                            )}
                          >
                            <w.icon className="h-5 w-5" />
                          </span>
                          <div className="flex-1">
                            <p className="font-medium text-ink">{w.label}</p>
                            <p className="text-xs text-stone-light">{w.desc}</p>
                          </div>
                          {active && (
                            <Check className="h-4 w-4 shrink-0 text-grass" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </StepShell>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* nav */}
        <div className="mt-10 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="md"
            onClick={() => go(-1)}
            className={cn(step === 0 && "pointer-events-none opacity-0")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              variant="primary"
              size="lg"
              onClick={() => go(1)}
              disabled={!canContinue}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={finish}>
              See my roadmap
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-serif text-base italic text-leaf-accent">{eyebrow}</p>
      <h1 className="mt-1 text-balance text-3xl font-light tracking-tight text-ink sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-pretty leading-relaxed text-stone">{subtitle}</p>
      {children}
    </div>
  );
}
