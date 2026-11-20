# docs/archive — dated documents

Reports, prompts and audits written for **one session**. They are kept,
with their git history (`git log --follow`), because later documents cite
them as evidence. They are **not** kept current: read them as "what was true
on that date". For how things are now, start at [../README.md](../README.md).

| File | Date | What it was | Why it is kept |
|---|---|---|---|
| [SUPABASE_SETUP.md](SUPABASE_SETUP.md) | 2026-05-25 | The first Supabase setup guide (OpenAI key, run 001–005 in the SQL editor) | History only. Superseded by the root README's setup and `docs/GO-SEQUENCE.md`; most of its steps are now wrong |
| [UI_AUDIT.md](UI_AUDIT.md) | 2026-10-22 | Pre-launch UI audit of the old design | Baseline for the redesign; cited by the roadmap |
| [REVAMP_REPORT.md](REVAMP_REPORT.md) | 2026-11-03 | Final report of the first UI revamp | Record of what that revamp changed |
| [CLAUDE_CODE_PROMPT.md](CLAUDE_CODE_PROMPT.md) | 2026-11-10 | The prompt that produced the 2026-11-10 audit and roadmap | Explains where `MASTER_ROADMAP.md`'s task IDs came from |
| [v1-roadmap-dependencies.md](v1-roadmap-dependencies.md) | 2026-11-10 | Dependency graph of the V1 launch tasks (P0/P1) | Every node is done; kept as the plan of record |
| [OVERNIGHT_REPORT.md](OVERNIGHT_REPORT.md) | 2026-11-14 | Report of the first overnight run (staging, migrations 022–031) | Evidence trail for the migrations it rehearsed |
| [SECURITY_REVIEW_INDEPENDENT.md](SECURITY_REVIEW_INDEPENDENT.md) | 2026-11-15 | Independent security review of `v1` against staging | Findings and their fixes are referenced by migration comments |
| [VERIFICATION.md](VERIFICATION.md) | 2026-11-15 | Independent verification of the overnight run | Evidence for 032–035 |
| [FINAL_PASS_REPORT.md](FINAL_PASS_REPORT.md) | 2026-11-15 | The "every pixel" final pass before launch | Launch-day checklist results |
| [PR-v1-to-main.md](PR-v1-to-main.md) | 2026-11-16 | Description of the v1 → main launch PR (#4) | The launch PR's own record |
| [audit-2-perf.md](audit-2-perf.md) | 2026-11-19 | Performance audit for PR D (signed-in skeleton time) | Before/after numbers for PR D |
| [HANDOFF_HISTORY.md](HANDOFF_HISTORY.md) | 2026-11-10 → 2026-11-16 | The pure-history sections moved out of `HANDOFF.md` | `HANDOFF.md` and `GO-SEQUENCE.md` link into it |
