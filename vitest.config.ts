import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Agent/parallel worktrees live under .claude/worktrees with their own
    // copy of every test — never part of this checkout's suite.
    exclude: ["**/node_modules/**", "**/.claude/**", "**/.next/**"],
  },
});
