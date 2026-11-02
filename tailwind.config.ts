import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // All theme-aware tokens resolve to CSS variables (RGB triplets) so the
        // four themes in theme-context.tsx restyle the whole UI at once.
        cream: "rgb(var(--c-bg) / <alpha-value>)",
        card: "rgb(var(--c-card) / <alpha-value>)",
        grass: {
          DEFAULT: "rgb(var(--c-primary) / <alpha-value>)",
          50: "rgb(var(--c-primary-50) / <alpha-value>)",
          100: "rgb(var(--c-primary-100) / <alpha-value>)",
          600: "rgb(var(--c-primary-600) / <alpha-value>)",
          700: "rgb(var(--c-primary-700) / <alpha-value>)",
          800: "rgb(var(--c-primary-800) / <alpha-value>)",
          900: "rgb(var(--c-primary-900) / <alpha-value>)",
        },
        lime: {
          accent: "rgb(var(--c-lime) / <alpha-value>)",
        },
        leaf: {
          accent: "rgb(var(--c-leaf) / <alpha-value>)",
        },
        tennis: "rgb(var(--c-tennis) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        stone: {
          DEFAULT: "rgb(var(--c-stone) / <alpha-value>)",
          light: "rgb(var(--c-stone-light) / <alpha-value>)",
        },
        line: "rgb(var(--c-line) / <alpha-value>)",
        gold: "rgb(var(--c-gold) / <alpha-value>)",
        "on-primary": "rgb(var(--c-on-primary) / <alpha-value>)",
        "error-bg": "rgb(var(--c-error-bg) / <alpha-value>)",
        error: "rgb(var(--c-error) / <alpha-value>)",
        "error-strong": "rgb(var(--c-error-strong) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Restored to the real display serif (Cormorant Garamond, already
        // loaded) rather than faking italics with Inter — this is the font
        // the "Seeded" wordmark, italic accent words, and numbered section
        // markers all render in across the site.
        serif: ["var(--font-cormorant)", "Georgia", "serif"],
        // Seeded design system only (components/seeded/*) — Legacy never
        // references these. --font-geist-sans comes from the `geist`
        // package (GeistSans), not a next/font/google call — see layout.tsx.
        seeded: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "14px",
        pill: "999px",
      },
      borderWidth: {
        hairline: "0.5px",
      },
      maxWidth: {
        content: "1180px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "draw-in": {
          "0%": { strokeDashoffset: "1000" },
          "100%": { strokeDashoffset: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.15s ease-out both",
        float: "float 5s cubic-bezier(0.45, 0, 0.55, 1) infinite",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(17, 24, 39, 0.04), 0 8px 24px rgba(17, 24, 39, 0.05)",
        lift: "0 12px 32px rgba(17, 24, 39, 0.10)",
        glow: "0 10px 32px rgb(var(--c-primary) / 0.22), 0 2px 10px rgb(var(--c-primary) / 0.14)",
        // Seeded design system only — full shadow values live in --s-elevation-*
        // (app/globals.css) since dark/light need very different recipes.
        "seeded-1": "var(--s-elevation-1)",
        "seeded-2": "var(--s-elevation-2)",
        "seeded-3": "var(--s-elevation-3)",
      },
    },
  },
  plugins: [],
};

export default config;
