# docs/ — map

Living documents, kept current. Dated one-session reports live in
[archive/](archive/README.md). Start with the first two.

| Doc | What it is | Read it when |
|---|---|---|
| [REVIEWER_GUIDE.md](REVIEWER_GUIDE.md) | Ten-minute tour: architecture, security model, fit engine, tests, known debt | First, if you are new |
| [../README.md](../README.md) | Setup, scripts, env vars, deploy flow | Before running anything |
| [../CLAUDE.md](../CLAUDE.md) | The rulebook (Always / Never / Non-negotiable) plus the history behind each rule | Before changing code |
| [MASTER_ROADMAP.md](MASTER_ROADMAP.md) | Status log (newest first) and the NEXT 10 tasks | To see what is done and what is next |
| [TODO.md](TODO.md) | Open items with reasoning, including known gaps | Before starting work in an area |
| [DECISIONS.md](DECISIONS.md) | Every call made without the owner, with why and how to undo it | When something looks deliberate and odd |
| [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) | RLS, RPC grants, headers, what cannot be fixed in code | Before touching auth, RLS, family, billing or an API route |
| [DATABASE_SPEC.md](DATABASE_SPEC.md) | Tables, purpose, access, migration quirks | Before a schema change |
| [GO-SEQUENCE.md](GO-SEQUENCE.md) | The production rollout order, one row per migration, with stops | Before applying anything to production |
| [HANDOFF.md](HANDOFF.md) | §J: per-migration verify and pasteable rollback; §K: the billing incident | During a rollout or an incident |
| [DATA_QUALITY.md](DATA_QUALITY.md) | Where school/roster/UTR numbers come from and how they are labelled | Before touching schools, rosters, UTR or fit math |
| [CATALOG_EXPANSION.md](CATALOG_EXPANSION.md) | Plan for the sourced school catalog (PR E) | Before touching the catalog |
| [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) | How it is built, with diagrams in [diagrams/](diagrams/) | For depth beyond the reviewer guide |
| [API_INTEGRATIONS.md](API_INTEGRATIONS.md) | Every API route and external integration | Before adding a route |
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | What V1 is, for whom | Before a product change |
| [DESIGN_MOCKUP_SPEC.md](DESIGN_MOCKUP_SPEC.md), [DESIGN_MOCKUP_SPEC_V2.md](DESIGN_MOCKUP_SPEC_V2.md) | The UI source of truth (mockups) | Before a UI change |
| [QA_CHECKLIST.md](QA_CHECKLIST.md) | Test strategy and the manual pass | Before shipping |
| [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) | Vercel/Supabase setup and branch protection | Before changing deploy settings |
| [SEO_CHECKLIST.md](SEO_CHECKLIST.md) | Titles, sitemap, robots, structured data | Before adding a public page |
| [STAGING_PERSONAS.md](STAGING_PERSONAS.md) | The fake staging accounts and how to act as one | Before testing on staging |
| [CHANGELOG.md](CHANGELOG.md) | Notable incidents and fixes | For the story behind a fix |
| [../scripts/README.md](../scripts/README.md) | The browser/audit scripts | Before running the harness |
