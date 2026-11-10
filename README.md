# LedgerFinesse

Audits a renter's rent ledger against their lease. The free scan returns the number of disputed charges and the total. The itemized breakdown and the dispute letter unlock for a flat 15% of the money owed, charged through Stripe Checkout. LedgerFinesse is not a law firm and does not give legal advice.

Next.js 16 (App Router) on Cloudflare Workers via OpenNext, Supabase (Postgres, Auth, Storage), Stripe Checkout, Gemini for document extraction only.

## Requirements
- Node 24 (`nvm use` reads `.nvmrc`).

## Local setup (no accounts needed)
```bash
npm install
npm run build && npx next start   # or: npm run dev
```
With no env set, the app runs fully local. It uses an in-memory store, a dev sign-in cookie, demo extraction, and a mock Stripe gateway. The mock gateway sends signed test events through the real webhook handler. Copy `.env.example` (names only) to `.env.local` or `.dev.vars` to switch backends.

| Variable | Values | Notes |
|---|---|---|
| `SITE_ENV` | `development` \| `preview` \| `production` | The memory store and mock Stripe are development-only. Production also refuses demo extraction. Anything but production refuses live Stripe keys. Non-production pages are `noindex` and robots disallows all. |
| `LF_BACKEND` | `memory` \| `supabase` | `supabase` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `STRIPE_MODE` | `mock` \| `stripe` | `stripe` needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `EXTRACTION_MODE` | `demo` \| `gemini` | `gemini` needs `GEMINI_API_KEY`; `GEMINI_MODEL` is optional |
| `NEXT_PUBLIC_APP_URL` | absolute origin | Used for Checkout return URLs, the magic-link redirect, canonical URLs and the sitemap |
| `LF_DAILY_AUDIT_LIMIT` | positive integer | Audits one user may start per rolling 24 hours (default 10) |
| `DEV_SESSION_SECRET` | string | Signs the dev sign-in cookie (memory backend, development only; ignored elsewhere) |

## Supabase
- Migration: `supabase/migrations/20261109000000_site_v1.sql` (tables, RLS, private `documents` bucket, `save_scan_result` and `apply_checkout_paid`). Apply it to a non-production project first: `supabase db push --db-url <staging url>`.
- RLS tests run on PGlite with a Supabase stub (`src/lib/db/rls.test.ts`), with no Supabase connection.
- Auth: email magic link only. Add `{APP_URL}/auth/callback` to the allowed redirect URLs.

## Stripe (test mode)
- Use a `sk_test_`/`rk_test_` key. A Stripe sandbox is recommended.
- Webhook endpoint: `{APP_URL}/api/stripe/webhook`. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
- The fee is computed on the server from the stored audit. An audit unlocks only on a verified webhook that reports `payment_status=paid` and an amount matching the stored fee. Returning to the success URL never unlocks anything.

## Rate limits
Workers rate-limit bindings in `wrangler.jsonc` (`UPLOAD_RATE_LIMITER`, `SIGNIN_RATE_LIMITER`, `CHECKOUT_RATE_LIMITER`). Each one counts per IP and per user (or sign-in email). Change `simple.limit` to tune them. Under `next start` there are no bindings, so nothing is limited. The daily audit cap applies everywhere.

## Scripts
| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm test` / `npm run test:coverage` | Vitest (rules engine branch coverage must stay >= 95%) |
| `npm run lint`, `npm run typecheck` | ESLint, `next typegen` + `tsc` |
| `npm run build` | Compiles blog MDX, then `next build` |
| `npm run build:cf` | OpenNext build for Workers |
| `npm run preview:cf` | `build:cf`, then run the worker locally in workerd |
| `npm run test:e2e` | Playwright (desktop + Pixel 7, EN + ES) against `next start` |
| `npm run test:e2e:cf` | Same suite against the worker in local workerd (`build:cf` first) |
| `npm run blog:build` | Compiles `content/blog/{en,es}/*.mdx` into `src/content/blog.generated.ts` |

## Folder map
```
src/app/[locale]/        Pages (EN/ES). Root layout lives here.
src/app/api/, auth/      Route handlers (audits, checkout, Stripe webhook, magic link)
src/proxy.ts             Locale redirect + Supabase session refresh
src/lib/rules-engine/    Deterministic audit engine (see its README)
src/lib/jurisdictions/   Statute data with sources; unverified entries are never applied
src/lib/audits/          AuditRepository (memory, Supabase) and the audit service
src/lib/payments/        Checkout, Stripe gateway, webhook, mock gateway
src/lib/extraction/      Demo and Gemini extractors (extraction only, zod-validated)
src/lib/letters/         Dispute letter templates (pending attorney review)
content/blog/            Blog posts (MDX); drafts are hidden in production
supabase/migrations/     Schema, RLS, storage
e2e/                     Playwright suite and fixtures
reference/prototype/     Original Vite prototype, reference only
```

## Known limitation: Cache Components are off
`cacheComponents` is disabled in `next.config.ts`. With `@opennextjs/cloudflare` 1.20.13 and a `proxy.ts`, request-time renders hang in workerd. The upstream fix is opennextjs/opennextjs-cloudflare#1318, which has not been merged. Re-enable it once that fix ships, after `npm run test:e2e:cf` passes.

## Ground rules
- Money is integer cents everywhere.
- The audit engine is pure and deterministic. All math and legal conclusions come from it, never from the model.
- Only verified rules (citation, source URL, verified date) are applied or shown as law.
- No secrets in the repo. `.dev.vars*` and `.env*` (except `.env.example`) are git-ignored.
