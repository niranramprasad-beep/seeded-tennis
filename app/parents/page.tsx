import Link from "next/link";
import { CalendarCheck, MailCheck, ShieldCheck, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Footer } from "@/components/layout/footer";

const items = [
  {
    icon: ShieldCheck,
    title: "Know what is realistic",
    body: "See which programs fit the player's current UTR, academic goals, gender, and timeline before spending another weekend chasing the wrong event.",
  },
  {
    icon: CalendarCheck,
    title: "Plan the week",
    body: "Turn recruiting goals into a training schedule that balances court work, match play, strength, recovery, and school.",
  },
  {
    icon: TrendingUp,
    title: "Track progress",
    body: "Log UTR updates and tournament volume so the family can see whether the plan is working.",
  },
  {
    icon: MailCheck,
    title: "Keep outreach organized",
    body: "Draft specific coach emails, track replies, and keep the recruiting conversation in one place.",
  },
];

export default function ParentsPage() {
  return (
    <>
      <div className="mx-auto max-w-content container-px py-16">
        <div className="max-w-3xl">
          <Badge variant="leaf" size="md">For parents</Badge>
          <h1 className="mt-5 text-balance text-4xl font-light tracking-tight text-ink sm:text-6xl">
            A calmer way to manage{" "}
            <span className="serif-accent text-grass">college tennis</span> recruiting.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone">
            Seeded gives families a shared recruiting plan: school fit, UTR targets,
            training load, tournaments, and coach outreach without the spreadsheet spiral.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Start a family account
            </Link>
            <Link href="/pricing" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See plans
            </Link>
          </div>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.title} interactive className="p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-grass text-cream">
                <item.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-xl font-medium text-ink">{item.title}</h2>
              <p className="mt-2 leading-relaxed text-stone">{item.body}</p>
            </Card>
          ))}
        </div>
      </div>
      <Footer />
    </>
  );
}
