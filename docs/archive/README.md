# docs/archive — dated documents

Reports, prompts, audits, logs and superseded plans. They are kept, with
their git history (`git log --follow`), because later documents and
migration comments cite them. They are **not** kept current: read each as
"what was true on that date". For how things are now, start at
[../README.md](../README.md). Any to-do list inside these files is as of its
date; open work lives only in [../TODO.md](../TODO.md).

Two files here are still appended to: `ROADMAP_HISTORY.md` (a dated entry
for each change you ship) and `TODO_DONE.md` (each TODO item you close).

| File | Date | What it is | Why it is kept |
|---|---|---|---|
| [ROADMAP_HISTORY.md](ROADMAP_HISTORY.md) | 2026-11-10 → | The dated status log, newest first, and the 2026-11-10 audit's P0–P3 task lists; `MASTER_ROADMAP.md` as it stood on 2026-11-22, verbatim | Append-only record of how V1 was made safe; new dated entries go at its top |
| [CLAUDE_INVARIANT_HISTORY.md](CLAUDE_INVARIANT_HISTORY.md) | 2026-11-26 | The long incident history that used to sit in `CLAUDE.md` (parents' writes, the UTR placeholder, every enforced invariant), moved verbatim | CLAUDE.md now carries the short rules; tests and migration headers still cite the reasons |
| [MASTER_ROADMAP_2026-11-24.md](MASTER_ROADMAP_2026-11-24.md) | 2026-11-24 | The long-form roadmap before it was shortened, verbatim | Cited PR-by-PR detail (#37–#61) |
| [TODO_DONE.md](TODO_DONE.md) | 2026-11-22 → | Done and obsolete `TODO.md` items, verbatim, each with why it moved | Append-only; nothing leaves `TODO.md` without landing here |
| [GO-SEQUENCE.md](GO-SEQUENCE.md) | 2026-11-16 → 11-22 | The launch-day production order, one row per migration 022–052 | Migration headers and HANDOFF §J cite its rows; the procedure is now HANDOFF §J |
| [CHANGELOG.md](CHANGELOG.md) | 2026-11-10 → 11-14 | Notable incidents and fixes of the first audit week | The billing incident and launch-blocker write-ups; later entries are in `ROADMAP_HISTORY.md` |
| [DESIGN_MOCKUP_SPEC.md](DESIGN_MOCKUP_SPEC.md) | pre-launch | The v1 mockup spec (tokens, /pricing, /login, /family) | Superseded by `../DESIGN_MOCKUP_SPEC_V2.md`; still the source of the type scale and the /family card |
| [SUPABASE_SETUP.md](SUPABASE_SETUP.md) | 2026-05-25 | The first Supabase setup guide (OpenAI key, run 001–005 in the SQL editor) | History only. Superseded by the root README's setup and HANDOFF §J; most of its steps are now wrong |
| [UI_AUDIT.md](UI_AUDIT.md) | 2026-10-22 | Pre-launch UI audit of the old design | Baseline for the redesign; cited by the roadmap |
| [REVAMP_REPORT.md](REVAMP_REPORT.md) | 2026-11-03 | Final report of the first UI revamp | Record of what that revamp changed |
| [CLAUDE_CODE_PROMPT.md](CLAUDE_CODE_PROMPT.md) | 2026-11-10 | The prompt that produced the 2026-11-10 audit and roadmap | Explains where the roadmap's task IDs came from |
| [v1-roadmap-dependencies.md](v1-roadmap-dependencies.md) | 2026-11-10 | Dependency graph of the V1 launch tasks (P0/P1) | Every node is done; kept as the plan of record |
| [OVERNIGHT_REPORT.md](OVERNIGHT_REPORT.md) | 2026-11-14 | Report of the first overnight run (staging, migrations 022–031) | Evidence trail for the migrations it rehearsed |
| [SECURITY_REVIEW_INDEPENDENT.md](SECURITY_REVIEW_INDEPENDENT.md) | 2026-11-15 | Independent security review of `v1` against staging | Findings and their fixes are referenced by migration comments |
| [VERIFICATION.md](VERIFICATION.md) | 2026-11-15 | Independent verification of the overnight run | Evidence for 032–035 |
| [FINAL_PASS_REPORT.md](FINAL_PASS_REPORT.md) | 2026-11-15 | The "every pixel" final pass before launch | Launch-day checklist results |
| [PR-v1-to-main.md](PR-v1-to-main.md) | 2026-11-16 | Description of the v1 → main launch PR (#4) | The launch PR's own record |
| [audit-2-perf.md](audit-2-perf.md) | 2026-11-19 | Performance audit for PR D (signed-in skeleton time) | Before/after numbers; `scripts/perf-lighthouse.mjs` points here |
| [HANDOFF_HISTORY.md](HANDOFF_HISTORY.md) | 2026-11-10 → 2026-11-16 | The pure-history sections A–I moved out of `HANDOFF.md` | `HANDOFF.md` and `DECISIONS.md` link to it |
