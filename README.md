# LedgerFinesse

Audits a renter's rent ledger against their lease. The free scan returns the number of disputed charges and the total. The itemized breakdown and the dispute letter unlock for a flat 15% of the money owed, charged through Stripe Checkout. LedgerFinesse is not a law firm and does not give legal advice.

Next.js 16 (App Router) built as an OpenNext worker (`npm run build:spacefast`) for Spacefast Functions, Supabase (Postgres, Auth, Storage), Stripe Checkout, Gemini for document extraction only.

## Requirements
- Node 24 (`nvm use` reads `.nvmrc`).

## Local setup (no accounts needed)
```bash
npm install
npm run build && npx next start   # or: npm run dev
```
With no env set, the app runs fully local (development only). It uses an in-memory store, a dev sign-in cookie, demo extraction, and a mock Stripe gateway. The mock gateway sends signed test events through the real webhook handler. Copy `.env.example` (names only) to `.env.local` or `.dev.vars` to switch backends. The memory store and mock Stripe sessions live in process memory on `globalThis`. They are development-only, and on Workers each isolate has its own copy.

| Variable | Values | Notes |
|---|---|---|
| `SITE_ENV` | `development` \| `preview` \| `production` | Required in any production build (`next start`, the worker): with it missing, every page answers 503 and API routes refuse to run. Only `next dev` and tests default to `development`. The memory store and mock Stripe are development-only. Production also refuses demo extraction. Anything but production refuses live Stripe keys. Non-production pages are `noindex` and robots disallows all. |
| `LF_BACKEND` | `memory` \| `supabase` | `supabase` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `STRIPE_MODE` | `mock` \| `stripe` | `stripe` needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `EXTRACTION_MODE` | `demo` \| `gemini` | `gemini` needs `GEMINI_API_KEY`; `GEMINI_MODEL` is optional |
| `NEXT_PUBLIC_APP_URL` | absolute origin | Used for Checkout return URLs, the magic-link redirect, canonical URLs and the sitemap |
| `LF_DAILY_AUDIT_LIMIT` | positive integer | Audits one user may start per rolling 24 hours (default 10) |
| `DEV_SESSION_SECRET` | string | Signs the dev sign-in cookie (memory backend, development only; ignored elsewhere) |

## Supabase
- Migration: `supabase/migrations/20261109000000_site_v1.sql` (tables, RLS, private `documents` bucket, `save_scan_result` and `apply_checkout_paid`). Apply it to a non-production project first: `supabase db push --db-url <staging url>`.
- RLS tests run on PGlite with a Supabase stub (`src/lib/db/rls.test.ts`), with no Supabase connection.
- Auth: email magic link and email + password (Confirm email ON). Add `{APP_URL}/auth/callback` to the allowed redirect URLs. Keep the default email templates (`{{ .ConfirmationURL }}`): magic link and sign-up confirmation must arrive as a PKCE `code`; `/auth/callback` refuses a `token_hash` for them (login CSRF). A recovery template may link `{APP_URL}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&locale=en` for cross-device resets; that session is held until the person confirms "Continue as <email>".

## Neon (LF_BACKEND=neon, draft)

Lakebase Postgres plus Neon Auth (Managed Better Auth), as an alternative to the Supabase backend.

- Schema: `neon/migrations/`, applied with `node scripts/neon-migrate.mjs` (needs `DATABASE_URL` and
  `NEON_BRANCH`; refuses `production` without `--production`). Every table and function is revoked from the Data
  API roles (`anonymous`, `authenticated`); only the app server (owner role) reads or writes.
- Auth runs server-side only: keep `NEON_AUTH_BASE_URL` out of `NEXT_PUBLIC_*` and don't mount an `/api/auth`
  proxy, or the app's rate limits (including 5 wrong passwords per email per 15 min) can be bypassed.
- Shared SMTP sends codes, not links: sign-in, email verification and password reset use a 6-digit code that only
  completes in the browser that asked for it (signed `lf_code_pending` cookie).
- Branch settings used: `require_email_verification` on, `revoke_sessions_on_password_reset` on, magic links off,
  no OAuth providers. Production needs custom SMTP and the app origin added as a trusted domain.
- Uploads: no storage backend yet. Files stay in memory for the upload request (the scan runs in the same request).
- Tests: `LF_NEON_TEST=1 npx vitest run src/lib/audits/neon-repository.integration.test.ts` and
  `npm run test:e2e:neon`, both against a `dev-*` branch only (env from `neon env pull --file <outside the repo>`).

## Stripe (test mode)
- Use a `sk_test_`/`rk_test_` key. A Stripe sandbox is recommended.
- Webhook endpoint: `{APP_URL}/api/stripe/webhook`. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
- The fee is computed on the server from the stored audit. An audit unlocks only on a verified webhook that reports `payment_status=paid` and an amount matching the stored fee. Returning to the success URL never unlocks anything.

## Rate limits
Fixed-window counters in Supabase Postgres (`public.rate_limits`, atomic `rate_limit_hit` RPC, service role only). Upload, sign-in (magic link, password, reset) and checkout each have a hard limit per user (or sign-in email). Defaults: upload 10/60s, sign-in 10/60s, checkout 20/60s; override with `LF_RATE_LIMIT_UPLOAD|SIGNIN|CHECKOUT=hits/seconds`. If the limiter can't be reached the request is refused, except in `SITE_ENV=development`. The memory backend (development only) counts in process. The daily audit cap (`LF_DAILY_AUDIT_LIMIT`) is enforced atomically at insert. Password sign-in also has a per-email wrong-password limit (`LF_PASSWORD_FAILURE_LIMIT`, default 5 per 15 minutes): a failure is reserved atomically before the attempt and forgiven unless the password was wrong (`rate_limit_forgive`). Anyone who can submit a password for an email can pause password sign-in for that address for 15 minutes; magic-link sign-in and password reset still work. Supabase's leaked-password protection is a dashboard setting for the project owner. Per-IP limits are off by default: no client-IP header is trusted, because a client can send any `cf-connecting-ip` or `x-forwarded-for`. Do not set `LF_TRUSTED_IP_HEADER` (or `LF_RATE_LIMIT_IP`, default 100/60s, loose) until a Spacefast preview header-echo test with forged values, from two networks, proves the platform overwrites a client-sent header. For `x-forwarded-for` only the rightmost hop is used, and that is only the platform's hop when exactly one proxy appends one.

## Scripts
| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm test` / `npm run test:coverage` | Vitest (rules engine branch coverage must stay >= 95%) |
| `npm run lint`, `npm run typecheck` | ESLint, `next typegen` + `tsc` |
| `npm run build` | Compiles blog MDX, then `next build` |
| `npm run build:spacefast` | The Spacefast build: compiles the blog, then the OpenNext adapter writes the prebuilt worker to `.open-next/` for `sf publish --prebuilt` |
| `npm run preview:worker` | `build:spacefast`, then run the worker locally in workerd |
| `npm run test:e2e` | Playwright (desktop + Pixel 7, EN + ES) against `next start` |
| `npm run test:e2e:worker` | Same suite against the worker in local workerd (`build:spacefast` first) |
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
`cacheComponents` is disabled in `next.config.ts`. With `@opennextjs/cloudflare` 1.20.13 and a `proxy.ts`, request-time renders hang in workerd. The upstream fix is opennextjs/opennextjs-cloudflare#1318, which has not been merged. Re-enable it once that fix ships, after `npm run test:e2e:worker` passes.

## Ground rules
- Money is integer cents everywhere.
- The audit engine is pure and deterministic. All math and legal conclusions come from it, never from the model.
- Only verified rules (citation, source URL, verified date) are applied or shown as law.
- No secrets in the repo. `.dev.vars*` and `.env*` (except `.env.example`) are git-ignored.
