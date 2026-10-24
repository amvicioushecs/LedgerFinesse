# LedgerFinesse

Web app that audits a renter's rent ledger against their lease. Next.js (App Router) on Cloudflare Workers via OpenNext. Not legal advice.

## Requirements
- Node 24 (`nvm use` reads `.nvmrc`). Vitest 5 and Wrangler 4 need Node >= 22.12.

## Setup
```bash
npm install
cp .env.example .dev.vars   # variable names only; fill in locally, never commit
npm run dev                 # http://localhost:3000
```

## Scripts
| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm test` | Vitest unit tests |
| `npm run test:coverage` | Tests with coverage; rules-engine branch coverage must stay >= 95% |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run build` | Next.js production build |
| `npm run build:cf` | OpenNext build for Cloudflare Workers |
| `npm run preview:cf` | OpenNext build, then run it locally in the Workers runtime |

## Folder map
```
src/app/                    Next.js App Router (scaffold only for now)
src/lib/money.ts            Integer-cents helpers
src/lib/pricing.ts          Unlock fee
src/lib/rules-engine/       Deterministic audit engine (see its README)
public/                     Static files (robots.txt, llms.txt, llms-full.txt)
reference/prototype/        Original Vite prototype, reference only (not built, linted or tested)
open-next.config.ts         OpenNext config
wrangler.jsonc              Cloudflare Worker config (minimal stub)
```

## Ground rules
- Money is integer cents everywhere.
- The audit engine is pure and deterministic; all math and legal conclusions come from it.
- Only `verified` rules (citation, source URL, verifier, date) are applied. Citations come from rule data, never from code.
- Test fixtures use the fictional jurisdiction `ZZ` / `Testville`. Don't add real statute text or citations without verification.
- No secrets in the repo. `.dev.vars*` and `.env*` (except `.env.example`) are git-ignored.
