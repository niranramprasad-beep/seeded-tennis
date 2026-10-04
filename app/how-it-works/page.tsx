import Link from "next/link";
import { ArrowRight, ClipboardList, Mail, Route, School } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Footer } from "@/components/layout/footer";
import { FadeIn } from "@/components/shared/fade-in";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: ClipboardList,
    title: "Build the player profile",
    body: "Seeded starts with grade, gender, UTR, goals, target schools, weaknesses, and training availability.",
  },
  {
    icon: School,
    title: "Match schools honestly",
    body: "Programs are compared by roster level, minimum competitive UTR, academics, conference, and location.",
  },
  {
    icon: Route,
    title: "Set senior-summer targets",
    body: "The roadmap works backward from the UTR needed by the summer before senior year.",
  },
  {
    icon: Mail,
    title: "Organize outreach",
    body: "Coach emails, contacted status, replies, and follow-ups stay attached to the target-school list.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <div className="mx-auto max-w-content container-px py-16">
        <FadeIn>
          <Badge variant="leaf" size="md">How it works</Badge>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-light tracking-tight text-ink sm:text-6xl">
            Recruiting clarity from the first profile to the first coach reply.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone">
            Seeded connects the pieces families usually manage separately: schools,
            UTR targets, training weeks, tournaments, and outreach.
          </p>
        </FadeIn>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {steps.map((step, index) => (
            <FadeIn key={step.title} delay={index * 0.08}>
              <Card interactive className="h-full p-7">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-grass text-on-primary">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <span className="font-serif text-3xl italic text-leaf-accent">0{index + 1}</span>
                </div>
                <h2 className="mt-5 text-xl font-medium text-ink">{step.title}</h2>
                <p className="mt-2 leading-relaxed text-stone">{step.body}</p>
              </Card>
            </FadeIn>
          ))}
        </div>
        <FadeIn delay={0.2} className="mt-10">
          <Link href="/signup" className={cn(buttonVariants({ variant: "primary", size: "lg" }), "group")}>
            Build my roadmap
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </FadeIn>
      </div>
      <Footer />
    </>
  );
}
