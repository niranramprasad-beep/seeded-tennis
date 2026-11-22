// The fit engine's source files, for the guard tests. Nothing in the app
// imports this.
//
// lib/fit.ts is the engine's public entry point: a barrel that re-exports
// lib/fit/*.ts, and the only path any importer uses ("@/lib/fit"). The code
// was one file until 2026-11-21. A guard that used to read or allow-list
// "lib/fit.ts" now reads or allow-lists this whole set, so a rule that held
// for lib/fit.ts holds for the engine wherever its code sits — and nowhere
// else. lib/fit-split-purity.test.ts fails if a .ts file appears in lib/fit/
// without being listed here, so the allow-list cannot grow by accident.
export const FIT_ENTRY_FILE = "lib/fit.ts";

export const FIT_ENGINE_FILES: readonly string[] = [
  FIT_ENTRY_FILE,
  "lib/fit/pace.ts",
  "lib/fit/projection.ts",
  "lib/fit/goal.ts",
  "lib/fit/bands.ts",
  "lib/fit/diagnostic.ts",
];
