# System architecture (as built, 2026-11-20)

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js 15 client pages<br/>AuthGate / PaidGate = cosmetic]
    LS[(localStorage<br/>session + theme + design)]
  end
  subgraph Vercel
    API[app/api/* route handlers<br/>zod + request-scoped client]
    WH[/api/whop/webhook, /sync, /membership<br/>service role/]
  end
  subgraph Prod["Supabase production tfpjssmhiptbwigarxpx<br/>(Vercel Production)"]
    AUTH[Auth]
    DB[(Postgres + RLS on all 26 tables<br/>privileged-column trigger, DB rate limits)]
  end
  STG[(Supabase staging gnlcpnsweqbtwpaqhqqg<br/>Vercel Preview + Development + local)]
  CAT[[lib/db/schools-data-*.ts<br/>static catalog, 68 programs<br/>UTR ranges = unverified estimates]]
  UI -->|anon key + JWT reads| DB
  UI -->|Bearer token| API --> DB
  UI --> AUTH
  UI -.imports.-> CAT
  Whop[Whop] -->|signed webhook| WH --> DB
  API --> Whop
  UI -->|compose URL only| Gmail[Gmail]
  WH -->|purchase event| GA4[GA4]
```

Production and staging are separate projects with the same schema (staging
also has migration 048). No AI provider, no Stripe, no email sender.

**Weak points still in this picture:** route protection is client-side (RLS
is the real gate); the catalog lives in code with no per-number source (PR E
/ migration 048 is the fix, staging only).
