# LedgerFinesse

Web app that audits a renter's rent ledger against their lease. Next.js (App Router), deployed on [Spacefast](https://spacefast.com). Not legal advice.

## Requirements
- Node 24 (`nvm use` reads `.nvmrc`). Vitest 5 needs Node >= 22.12.

## Setup
```bash
npm install
cp .env.example .env.local  # variable names only; fill in locally, never commit
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

## Folder map
```
src/app/                    Next.js App Router: landing page and /audit workspace
src/components/             Workspace UI (client components)
src/lib/audit-input/        CSV import, form validation, finding copy, dispute letter
src/lib/money.ts            Integer-cents helpers
src/lib/pricing.ts          Unlock fee
src/lib/rules-engine/       Deterministic audit engine (see its README)
public/                     Static files (robots.txt, llms.txt, llms-full.txt)
reference/prototype/        Original Vite prototype, reference only (not built, linted or tested)
```

## Deploy
Spacefast builds Next.js 16.3.x natively (it runs OpenNext itself, so the repo has no Wrangler or OpenNext config). Stay on 16.3.x until Spacefast lists a newer line.
```bash
sf build      # local build, same as the cloud build
sf publish    # publish the linked Space
```
The renter's lease and ledger are kept in the browser (localStorage); nothing is sent to a server.

## Ground rules
- Money is integer cents everywhere.
- The audit engine is pure and deterministic; all math and legal conclusions come from it.
- Only `verified` rules (citation, source URL, verifier, date) are applied. Citations come from rule data, never from code.
- Test fixtures use the fictional jurisdiction `ZZ` / `Testville`. Don't add real statute text or citations without verification.
- Production applies only rules in `src/lib/rules-engine/verified-rules.ts` (empty until real rules are verified). No sample or demo data ships in the app.
- No secrets in the repo. `.env*` (except `.env.example`) is git-ignored.
