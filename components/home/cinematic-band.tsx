"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

// Full-bleed parallax photo band — the image drifts as you scroll, so this
// section reads like a slow camera move rather than a static block.
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
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1.08, 1, 1.08]);

  return (
    <section
      ref={ref}
      className="relative flex min-h-[420px] items-center justify-center overflow-hidden border-y-hairline border-line bg-card lg:min-h-[520px]"
    >
      <motion.div style={{ y, scale }} className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt=""
          className="h-full w-full object-cover"
          aria-hidden
        />
      </motion.div>
      <div className="absolute inset-0 bg-cream/82" />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(151,196,89,0.18),transparent_30%),linear-gradient(180deg,rgba(250,248,242,0.92),rgba(253,252,247,0.86))]"
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto max-w-2xl px-6 text-center text-ink"
      >
        <span className="eyebrow text-grass">{eyebrow}</span>
        <h2 className="display-serif mt-5 text-balance text-4xl text-ink sm:text-6xl">
          {title}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-relaxed text-stone">
          {body}
        </p>
      </motion.div>
    </section>
  );
}
