import { Reveal } from "@/components/shared/reveal";
import { Parallax } from "@/components/shared/parallax";

// A full-bleed photo band with a short caption. The image now drifts at a
// shallow scroll-linked parallax (see Parallax) — a deliberate upgrade from
// this component's earlier fully-static treatment, in service of a more
// "alive," scroll-reactive page. Oversized (h-[130%]) so the ±offset travel
// never reveals an edge. The caption keeps the same view-triggered rise as
// every other section — a one-time reveal, independent of the image's
// continuous scroll motion.
export function CinematicBand({
  image,
  eyebrow,
  title,
  body,
}: {
  image: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <section className="relative flex min-h-[420px] items-center justify-center overflow-hidden border-y-hairline border-line bg-card lg:min-h-[520px]">
      <Parallax offset={36} className="absolute inset-x-0 -top-[15%] h-[130%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="h-full w-full object-cover" aria-hidden />
      </Parallax>
      <div className="absolute inset-0 bg-cream/45" />

      <Reveal className="relative z-10 mx-auto max-w-2xl px-6 text-center text-ink">
        <span className="eyebrow text-grass">{eyebrow}</span>
        <h2 className="display-serif mt-5 text-balance text-4xl text-ink sm:text-6xl lg:text-7xl">
          {title}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-relaxed text-stone">
          {body}
        </p>
      </Reveal>
    </section>
  );
}
