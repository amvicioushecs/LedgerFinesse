#!/usr/bin/env bash
# Neon dev branch + Stripe TEST mode, end to end: sign-up, password sign-in, a scan, a real Stripe Checkout payment
# (test card) and the unlock through the webhook. Webhooks reach the local app through `stripe listen` (a temporary
# CLI forwarding session; no webhook endpoint is registered). Needs the Neon env (NEON_BRANCH=dev-*) and a TEST
# STRIPE_SECRET_KEY in the environment. Never prints the key or the signing secret.
set -euo pipefail
[[ "${NEON_BRANCH:-}" == dev-* ]] || { echo "NEON_BRANCH must be a dev-* branch" >&2; exit 1; }
[[ "${STRIPE_SECRET_KEY:-}" =~ ^(sk|rk)_test_ ]] || { echo "STRIPE_SECRET_KEY must be a test-mode key (sk_test_/rk_test_)" >&2; exit 1; }
PORT="${E2E_PORT:-3500}"
export STRIPE_API_KEY="$STRIPE_SECRET_KEY" STRIPE_CLI_TELEMETRY_OPTOUT=1
STRIPE_WEBHOOK_SECRET="$(stripe listen --print-secret 2>/dev/null)"
[[ "$STRIPE_WEBHOOK_SECRET" == whsec_* ]] || { echo "stripe listen did not return a signing secret" >&2; exit 1; }
export STRIPE_WEBHOOK_SECRET
# The events src/lib/payments/webhook.ts handles. Output goes to a log with the signing secret redacted.
EVENTS=checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired
LOG="${STRIPE_LISTEN_LOG:-/tmp/lf-stripe-listen.log}"
stripe listen --events "$EVENTS" --forward-to "localhost:${PORT}/api/stripe/webhook" 2>&1 | sed -uE 's/whsec_[A-Za-z0-9]+/whsec_[REDACTED]/g' > "$LOG" &
LISTEN=$!
trap 'pkill -P $$ -f "stripe listen" 2>/dev/null || true; kill $LISTEN 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do grep -q "Ready!" "$LOG" 2>/dev/null && break; sleep 1; done
grep -q "Ready!" "$LOG" || { echo "stripe listen did not start (see $LOG)" >&2; exit 1; }
STRIPE_E2E=1 E2E_PORT="$PORT" npx playwright test -c playwright.neon.config.ts -g "Stripe TEST" "$@"
