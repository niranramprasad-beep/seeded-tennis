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
      className="relative flex min-h-[460px] items-center justify-center overflow-hidden lg:min-h-[560px]"
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
      <div className="absolute inset-0 bg-grass-900/65" />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-grass-900/80 via-transparent to-grass-900/40"
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto max-w-2xl px-6 text-center text-cream"
      >
        <span className="eyebrow text-gold">{eyebrow}</span>
        <h2 className="display-serif mt-5 text-balance text-4xl text-cream sm:text-6xl">
          {title}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-relaxed text-cream/80">
          {body}
        </p>
      </motion.div>
    </section>
  );
}
