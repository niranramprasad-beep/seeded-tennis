// A full-bleed photo band with a short caption — no parallax, no
// scroll-driven motion, no decorative glow overlay, just a static image
// with a flat tint for text contrast.
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden />
      <div className="absolute inset-0 bg-cream/45" />

      <div className="relative z-10 mx-auto max-w-2xl px-6 text-center text-ink">
        <span className="eyebrow text-grass">{eyebrow}</span>
        <h2 className="display-serif mt-5 text-balance text-4xl text-ink sm:text-6xl">
          {title}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-relaxed text-stone">
          {body}
        </p>
      </div>
    </section>
  );
}
