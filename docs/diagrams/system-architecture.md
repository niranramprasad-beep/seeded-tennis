# System architecture (as built, 2026-11-10)

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js client pages<br/>AuthGate / PaidGate = cosmetic]
    LS[(localStorage<br/>session + theme + design)]
  end
  subgraph Vercel
    API[app/api/* route handlers<br/>zod + request-scoped client]
    WH[/api/whop/webhook<br/>service role/]
    CP[/api/training/copilot<br/>Gemini - remove for V1/]
    ST[/api/stripe/* - dead/]
  end
  subgraph Supabase["Supabase tfpjssmhiptbwigarxpx<br/>SHARED by local + preview + prod"]
    AUTH[Auth]
    DB[(Postgres + RLS)]
  end
  CAT[[lib/db/schools-data-*.ts<br/>static catalog - unsourced]]
  UI -->|anon key + JWT reads| DB
  UI -->|Bearer token| API --> DB
  UI --> AUTH
  UI -.imports.-> CAT
  Whop[Whop] -->|signed webhook| WH --> DB
  API --> Whop
  CP --> Gemini[Google Gemini]
  UI -->|compose URL only| Gmail[Gmail]
```

**Red flags in this picture:** one database for every environment; the catalog lives in code with no source; the browser can PATCH privileged profile columns directly (S-1).
