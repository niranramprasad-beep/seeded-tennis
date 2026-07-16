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
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Repointed at the sans stack: every `font-serif` / `.display-serif`
        // usage across the app now renders as confident sans type instead of
        // the old italic serif, without having to touch each component.
        serif: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
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
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-14px)" },
        },
        "draw-in": {
          "0%": { strokeDashoffset: "1000" },
          "100%": { strokeDashoffset: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        float: "float 7s ease-in-out infinite",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(17, 24, 39, 0.04), 0 8px 24px rgba(17, 24, 39, 0.05)",
        lift: "0 12px 32px rgba(17, 24, 39, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
