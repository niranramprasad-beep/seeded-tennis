// ESLint flat config (ESLint 9). Replaces .eslintrc.json and `next lint`,
// which Next 15.5 deprecates and Next 16 removes. Same rules as before:
// next/core-web-vitals (through FlatCompat, the shape Next's own codemod
// writes) with react/no-unescaped-entities off. `npm run lint` runs
// `eslint . --max-warnings=0`, so any warning still fails CI.
//
// A flat config is found by walking up from the working directory and the
// first one wins, so a git worktree nested inside this repo cannot pick up
// the parent checkout's config (that is what `root: true` did before).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      ".vercel/**",
      ".claude/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
];

export default config;
