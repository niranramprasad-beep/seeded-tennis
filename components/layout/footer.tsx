import Link from "next/link";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { href: "/schools", label: "Browse schools" },
      { href: "/roadmap", label: "Roadmap" },
      { href: "/training", label: "Training plans" },
      { href: "/coaches", label: "Coach outreach" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/#testimonials", label: "Stories" },
      { href: "/signup", label: "Get started" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "#", label: "Help center" },
      { href: "/contact", label: "Contact" },
      { href: "#", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t-[0.5px] border-cream/10 bg-[#06111F] text-cream">
      <div className="mx-auto max-w-content container-px py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-tennis ring-1 ring-tennis/35" />
              <span className="font-serif text-[26px] italic leading-none text-cream">
                Seeded
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-cream/58">
              A clear, realistic path to college tennis — built for junior
              players and the families guiding them.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-medium uppercase tracking-[0.12em] text-cream/38">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-cream/58 transition-colors hover:text-leaf-accent"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t-[0.5px] border-cream/10 pt-6 text-xs text-cream/42 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Seeded. Built for tennis families.</p>
          <p className="font-serif italic text-cream/55">
            Your path to college tennis, mapped match by match.
          </p>
        </div>
      </div>
    </footer>
  );
}
