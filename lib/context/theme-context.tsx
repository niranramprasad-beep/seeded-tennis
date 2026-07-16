"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeId = "grass" | "clay" | "night" | "hard" | "utr" | "championship";

export const THEMES: {
  id: ThemeId;
  name: string;
  description: string;
  swatch: string[];
  dark?: boolean;
}[] = [
  {
    id: "grass",
    name: "Grass Court",
    description: "Clean white & confident emerald",
    swatch: ["#FAFAFA", "#15803D", "#22C55E"],
  },
  {
    id: "clay",
    name: "Clay",
    description: "Terracotta & warm sand",
    swatch: ["#FBF4EE", "#A0432A", "#F2A03D"],
  },
  {
    id: "night",
    name: "Night Match",
    description: "Deep navy, green accents",
    swatch: ["#0E1726", "#7CC45A", "#16223A"],
    dark: true,
  },
  {
    id: "hard",
    name: "Hard Court",
    description: "Cool off-white, electric blue",
    swatch: ["#F4F6F8", "#1F6FEB", "#22D3EE"],
  },
  {
    id: "utr",
    name: "UTR Pulse",
    description: "Clean white, black ink, electric rating green",
    swatch: ["#F8FAF7", "#141610", "#B7FF3C"],
  },
  {
    id: "championship",
    name: "Championship",
    description: "Ivory, navy graphite, trophy gold",
    swatch: ["#FAF7EF", "#162033", "#C8A84E"],
  },
];

export const THEME_STORAGE_KEY = "seeded.theme";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("grass");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
      if (stored && THEMES.some((t) => t.id === stored)) {
        setThemeState(stored);
        document.documentElement.setAttribute("data-theme", stored);
      }
    } catch {
      // ignore
    }
  }, []);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

export interface ThemeColors {
  primary: string;
  leaf: string;
  lime: string;
  tennis: string;
  ink: string;
  stone: string;
  stoneLight: string;
  line: string;
  card: string;
  bg: string;
}

const FALLBACK: ThemeColors = {
  primary: "#15803D",
  leaf: "#22C55E",
  lime: "#D9F99D",
  tennis: "#BEF264",
  ink: "#111827",
  stone: "#4B5563",
  stoneLight: "#9CA3AF",
  line: "#E5E7EB",
  card: "#FFFFFF",
  bg: "#FAFAFA",
};

// Reads resolved theme colors from CSS variables so charts (which need concrete
// color strings) stay in sync with the active theme.
export function useThemeColors(): ThemeColors {
  const { theme } = useTheme();
  const [colors, setColors] = useState<ThemeColors>(FALLBACK);

  useEffect(() => {
    const root = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => {
      const v = root.getPropertyValue(name).trim();
      return v ? `rgb(${v})` : fallback;
    };
    setColors({
      primary: read("--c-primary", FALLBACK.primary),
      leaf: read("--c-leaf", FALLBACK.leaf),
      lime: read("--c-lime", FALLBACK.lime),
      tennis: read("--c-tennis", FALLBACK.tennis),
      ink: read("--c-ink", FALLBACK.ink),
      stone: read("--c-stone", FALLBACK.stone),
      stoneLight: read("--c-stone-light", FALLBACK.stoneLight),
      line: read("--c-line", FALLBACK.line),
      card: read("--c-card", FALLBACK.card),
      bg: read("--c-bg", FALLBACK.bg),
    });
  }, [theme]);

  return colors;
}
