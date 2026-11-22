import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  // tsconfig says "jsx": "preserve" (Next compiles JSX itself); a *.test.tsx
  // that renders a component with react-dom/server needs it compiled here,
  // with the same automatic runtime Next uses (no `import React`).
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // Agent/parallel worktrees live under .claude/worktrees with their own
    // copy of every test — never part of this checkout's suite.
    exclude: ["**/node_modules/**", "**/.claude/**", "**/.next/**"],
  },
});
