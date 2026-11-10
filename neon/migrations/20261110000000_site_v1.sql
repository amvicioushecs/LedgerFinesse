-- Neon port of supabase/migrations/20261109000000_site_v1.sql (same tables, checks and functions).
-- Differences: no auth.users trigger (profiles are upserted on the first audit), no RLS policies, no Storage
-- bucket. The Data API on this project grants `authenticated` access to new public objects by default, so every
-- table and function below is revoked from anonymous/authenticated/public, RLS is on with no policies, and the
-- default privileges are removed for objects created later. Only the owner role (the app server) reads or writes.

-- LedgerFinesse site v1: audits, paywalled findings and letters, Stripe payments.
-- Neon port: the app server is the only client (owner role over the HTTP driver); every query is scoped to the user id. The paywall is enforced here:
-- findings and letters are invisible until the audit is unlocked by a verified Stripe webhook.
-- All money is integer cents. Forward-only: never edit after it runs on a shared project.

create type public.audit_status as enum ('draft', 'processing', 'preview_ready', 'clean', 'unlocked', 'failed');
create type public.doc_kind as enum ('lease', 'ledger');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'expired', 'refunded');

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  -- neon_auth."user".id. No foreign key into the Neon-managed neon_auth schema; insert_audit_within_cap upserts the row.
  user_id    uuid primary key,
  email      text not null check (char_length(email) <= 320),
  locale     text not null default 'en' check (locale in ('en', 'es')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- audits
create table public.audits (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (user_id) on delete cascade,
  status             public.audit_status not null default 'draft',
  locale             text not null default 'en' check (locale in ('en', 'es')),
  jurisdiction_key   text not null check (jurisdiction_key in ('san-diego-ca', 'los-angeles-ca', 'austin-tx', 'new-york-ny')),
  tenant_name        text check (char_length(tenant_name) <= 200),
  landlord_name      text check (char_length(landlord_name) <= 200),
  property_address   text check (char_length(property_address) <= 500),
  -- Free-scan summary: the only result columns a locked audit exposes.
  total_owed_cents   bigint check (total_owed_cents >= 0),
  item_count         integer check (item_count >= 0),
  lines_scanned      integer check (lines_scanned >= 0),
  -- max(15% of the verified total rounded half up, 50 cents), fixed when the scan finishes.
  -- 0 = clean ($0 owed) or a free unlock (1-49 cents owed). Mirrors src/lib/pricing.ts.
  fee_cents          bigint check (fee_cents >= 0),
  engine_version     text,
  unlocked_at        timestamptz,
  -- Set when a scan claims the audit; a scan still processing 10 minutes later is failed on the next read.
  scan_started_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Unlocked with no charge because under 50 cents was owed: kept on the record so these can be found.
  free_unlock_below_minimum boolean generated always as (
    coalesce(status = 'unlocked' and fee_cents = 0 and total_owed_cents > 0, false)
  ) stored,
  constraint audits_fee_matches_policy check (
    fee_cents is null or total_owed_cents is null
    or fee_cents = case when total_owed_cents < 50 then 0 else greatest((total_owed_cents * 15 + 50) / 100, 50) end
  ),
  constraint audits_clean_is_zero check (status <> 'clean' or total_owed_cents = 0),
  constraint audits_scanned_has_summary check (
    status not in ('preview_ready', 'clean', 'unlocked')
    or (total_owed_cents is not null and item_count is not null and fee_cents is not null)
  ),
  constraint audits_unlocked_has_time check (status <> 'unlocked' or unlocked_at is not null),
  constraint audits_processing_has_start check (status <> 'processing' or scan_started_at is not null)
);
create index audits_free_unlock_below_minimum_idx on public.audits (created_at) where free_unlock_below_minimum;
create trigger audits_updated_at before update on public.audits
  for each row execute function public.set_updated_at();
create index audits_user_created_idx on public.audits (user_id, created_at desc);

-- ---------------------------------------------------------------- documents (files live in Storage)
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  audit_id     uuid not null references public.audits (id) on delete cascade,
  user_id      uuid not null references public.profiles (user_id) on delete cascade,
  kind         public.doc_kind not null,
  storage_path text not null unique,  -- {user_id}/{audit_id}/{document_id}.{ext}
  mime_type    text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size    bigint not null check (byte_size > 0 and byte_size <= 15728640),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  constraint documents_path_is_owned check (storage_path like user_id::text || '/' || audit_id::text || '/%')
);
create index documents_audit_idx on public.documents (audit_id);

-- ---------------------------------------------------------------- extractions (server only)
create table public.extractions (
  id         uuid primary key default gen_random_uuid(),
  audit_id   uuid not null references public.audits (id) on delete cascade,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  source     text not null check (source in ('model', 'demo')),
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create index extractions_audit_idx on public.extractions (audit_id, created_at desc);

-- ---------------------------------------------------------------- findings (paywalled)
create table public.findings (
  id            uuid primary key default gen_random_uuid(),
  audit_id      uuid not null references public.audits (id) on delete cascade,
  user_id       uuid not null references public.profiles (user_id) on delete cascade,
  position      integer not null check (position >= 0),
  category      text not null check (category in ('unauthorized_fee', 'late_fee_timing', 'late_fee_amount', 'unauthorized_rent_increase', 'math_balance_error')),
  description   text not null check (char_length(description) <= 300),
  first_date    date not null,
  last_date     date not null,
  line_numbers  integer[] not null,
  charged_cents bigint not null check (charged_cents >= 0),
  allowed_cents bigint not null check (allowed_cents >= 0),
  owed_cents    bigint not null check (owed_cents > 0),
  basis         text not null check (basis in ('lease', 'rule', 'math')),
  citation      text,
  source_url    text check (source_url is null or source_url like 'https://%'),
  lease_ref     text,
  law_notes     jsonb not null default '[]',
  created_at    timestamptz not null default now(),
  unique (audit_id, position),
  constraint findings_owed_adds_up check (charged_cents - allowed_cents = owed_cents)
);

-- ---------------------------------------------------------------- letters (paywalled)
create table public.letters (
  id                        uuid primary key default gen_random_uuid(),
  audit_id                  uuid not null references public.audits (id) on delete cascade,
  user_id                   uuid not null references public.profiles (user_id) on delete cascade,
  locale                    text not null check (locale in ('en', 'es')),
  template_version          text not null,
  body                      text not null,
  attorney_review_required  boolean not null default true,
  created_at                timestamptz not null default now(),
  unique (audit_id, locale, template_version)
);

-- ---------------------------------------------------------------- payments (Stripe Checkout; no card data)
create table public.payments (
  id                          uuid primary key default gen_random_uuid(),
  audit_id                    uuid references public.audits (id) on delete set null,
  user_id                     uuid references public.profiles (user_id) on delete set null,
  stripe_checkout_session_id  text not null unique check (stripe_checkout_session_id like 'cs_%'),
  stripe_payment_intent_id    text unique,
  amount_cents                bigint not null check (amount_cents >= 50),
  currency                    text not null default 'usd' check (currency = 'usd'),
  status                      public.payment_status not null default 'pending',
  paid_at                     timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create index payments_audit_idx on public.payments (audit_id);

-- ---------------------------------------------------------------- stripe_events (server only, dedupe)
create table public.stripe_events (
  event_id     text primary key check (event_id like 'evt_%'),
  type         text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  outcome      text
);

-- ---------------------------------------------------------------- payment_reviews (server only)
-- A paid Checkout Session that did not unlock its audit. Refund policy (Hector, 2026-11-10): amount_mismatch,
-- not_unlockable and duplicate_payment are refunded in full automatically (webhook, Stripe idempotency key
-- refund-<payment intent>); unknown_session waits for a person. Open rows (resolved_at null) are the admin queue.
create table public.payment_reviews (
  id                   uuid primary key default gen_random_uuid(),
  event_id             text not null unique references public.stripe_events (event_id),
  reason               text not null check (reason in ('amount_mismatch', 'duplicate_payment', 'not_unlockable', 'unknown_session')),
  audit_id             uuid references public.audits (id) on delete set null,
  checkout_session_id  text not null,
  payment_intent_id    text,
  amount_cents         bigint,
  currency             text,
  refund_id            text,
  refund_amount_cents  bigint check (refund_amount_cents > 0),
  refunded_at          timestamptz,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now()
);
create index payment_reviews_open_idx on public.payment_reviews (created_at) where resolved_at is null;

-- ---------------------------------------------------------------- unlock (service role only)
-- One transaction: dedupe the event, record the payment as paid, check the amount against the stored fee, unlock.
-- Returns 'unlocked' | 'duplicate' | 'already_unlocked' | 'already_recorded' | 'duplicate_payment' | 'amount_mismatch'
--       | 'unknown_session' | 'not_unlockable'. The last four write a payment_reviews row (once per session).
create or replace function public.apply_checkout_paid(
  p_event_id text, p_event_type text, p_session_id text, p_audit_id uuid,
  p_amount_cents bigint, p_currency text, p_payment_intent_id text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments%rowtype;
  v_audit   public.audits%rowtype;
  v_outcome text;
begin
  insert into public.stripe_events (event_id, type) values (p_event_id, p_event_type)
  on conflict (event_id) do nothing;
  if not found then
    perform 1 from public.stripe_events where event_id = p_event_id and processed_at is not null;
    if found then return 'duplicate'; end if;
  end if;

  select * into v_payment from public.payments where stripe_checkout_session_id = p_session_id for update;
  select * into v_audit from public.audits where id = p_audit_id for update;

  if v_payment.id is null or v_audit.id is null or v_payment.audit_id is distinct from v_audit.id then
    v_outcome := 'unknown_session';
  elsif v_payment.status in ('paid', 'refunded') then
    -- This session was already recorded (e.g. completed, then async_payment_succeeded). Its first event owns
    -- any review and refund, so a later event never adds a second one.
    v_outcome := case when v_audit.status = 'unlocked' and v_payment.status = 'paid' then 'already_unlocked' else 'already_recorded' end;
    update public.stripe_events set processed_at = now(), outcome = v_outcome where event_id = p_event_id;
    return v_outcome;
  else
    -- Stripe took the money: record it whatever happens next.
    update public.payments
      set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent_id
      where id = v_payment.id;
    if v_audit.status = 'unlocked' then
      v_outcome := 'duplicate_payment';
    elsif v_audit.status <> 'preview_ready' then
      v_outcome := 'not_unlockable';
    elsif p_currency is distinct from 'usd' or p_amount_cents is distinct from v_audit.fee_cents
          or p_amount_cents is distinct from v_payment.amount_cents then
      v_outcome := 'amount_mismatch';
    else
      update public.audits set status = 'unlocked', unlocked_at = now() where id = v_audit.id;
      v_outcome := 'unlocked';
    end if;
  end if;

  if v_outcome <> 'unlocked' then
    insert into public.payment_reviews
      (event_id, reason, audit_id, checkout_session_id, payment_intent_id, amount_cents, currency)
      values (p_event_id, v_outcome, v_audit.id, p_session_id, p_payment_intent_id, p_amount_cents, p_currency)
      on conflict (event_id) do nothing;
  end if;
  update public.stripe_events set processed_at = now(), outcome = v_outcome where event_id = p_event_id;
  return v_outcome;
end $$;
revoke all on function public.apply_checkout_paid(text, text, text, uuid, bigint, text, text) from public, anonymous, authenticated;

-- Records the automatic refund for a refundable review (amount_mismatch, not_unlockable, duplicate_payment).
-- True when the review was open; false if it was already refunded or is not refundable (never refunds twice).
-- The payment becomes 'refunded', so it no longer counts as paid; the audit itself is left as it was.
create or replace function public.record_refund(p_event_id text, p_refund_id text, p_amount_cents bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_review public.payment_reviews%rowtype;
begin
  update public.payment_reviews
    set refund_id = p_refund_id, refund_amount_cents = p_amount_cents, refunded_at = now(), resolved_at = now()
    where event_id = p_event_id and reason in ('amount_mismatch', 'not_unlockable', 'duplicate_payment') and refund_id is null
    returning * into v_review;
  if v_review.id is null then return false; end if;
  update public.payments set status = 'refunded' where stripe_checkout_session_id = v_review.checkout_session_id;
  return true;
end $$;
revoke all on function public.record_refund(text, text, bigint) from public, anonymous, authenticated;

-- ---------------------------------------------------------------- rate limits (server only)
-- Fixed-window request counters (src/lib/rate-limit.ts): one row per key ("signin:ip:1.2.3.4",
-- "upload:subject:<user id>") per window. Replaces the Cloudflare rate-limit bindings (Spacefast has none).
create table public.rate_limits (
  bucket        text not null check (char_length(bucket) <= 400),
  window_start  timestamptz not null,
  hits          integer not null default 1,
  primary key (bucket, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

-- Counts one hit for every key in the current window with an atomic upsert-increment and returns true when any
-- key is now over p_limit. p_now is for tests; callers pass now(). Old windows are swept about once per 100 calls.
create or replace function public.rate_limit_hit(p_keys text[], p_limit integer, p_window_seconds integer, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds);
  v_max integer;
begin
  with counted as (
    insert into public.rate_limits as r (bucket, window_start)
    select distinct k, v_window from unnest(p_keys) as k
    on conflict (bucket, window_start) do update set hits = r.hits + 1
    returning r.hits
  )
  select max(hits) into v_max from counted;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < p_now - interval '1 day';
  end if;
  return coalesce(v_max, 0) > p_limit;
end $$;
revoke all on function public.rate_limit_hit(text[], integer, integer, timestamptz) from public, anonymous, authenticated;

-- Takes one hit back (used to count only wrong passwords: reserve before the attempt, forgive unless it failed).
create or replace function public.rate_limit_forgive(p_keys text[], p_window_seconds integer, p_now timestamptz default now())
returns void language sql security definer set search_path = '' as $$
  update public.rate_limits
     set hits = hits - 1
   where bucket = any (p_keys)
     and window_start = to_timestamp(floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds)
     and hits > 0;
$$;
revoke all on function public.rate_limit_forgive(text[], integer, timestamptz) from public, anonymous, authenticated;

-- ---------------------------------------------------------------- new audit within the daily cap (service role only)
-- Count and insert under a per-user transaction advisory lock, so concurrent uploads can't overshoot the cap.
create or replace function public.insert_audit_within_cap(
  p_id uuid, p_user_id uuid, p_locale text, p_jurisdiction_key text,
  p_tenant_name text, p_landlord_name text, p_property_address text, p_since timestamptz, p_limit integer, p_email text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('lf_daily_audit_cap:' || p_user_id::text, 0));
  insert into public.profiles (user_id, email, locale) values (p_user_id, coalesce(p_email, ''), p_locale)
  on conflict (user_id) do nothing;
  if (select count(*) from public.audits where user_id = p_user_id and created_at >= p_since) >= p_limit then
    return false;
  end if;
  insert into public.audits (id, user_id, status, locale, jurisdiction_key, tenant_name, landlord_name, property_address)
  values (p_id, p_user_id, 'draft', p_locale, p_jurisdiction_key, p_tenant_name, p_landlord_name, p_property_address);
  return true;
end $$;
revoke all on function public.insert_audit_within_cap(uuid, uuid, text, text, text, text, text, timestamptz, integer, text) from public, anonymous, authenticated;

-- ---------------------------------------------------------------- save scan (service role only)
-- Stores the engine output in one transaction. Only a 'processing' audit can be completed, and only as
-- preview_ready (a fee to pay), clean, or unlocked free when 1-49 cents is owed. Paid unlocks go through apply_checkout_paid.
create or replace function public.save_scan_result(p_audit_id uuid, p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid;
  v_status text := p_result ->> 'status';
  v_fee    bigint := (p_result ->> 'feeCents')::bigint;
  v_total  bigint := (p_result ->> 'totalOwedCents')::bigint;
begin
  select user_id into v_user from public.audits where id = p_audit_id and status = 'processing' for update;
  if v_user is null then raise exception 'audit % is not processing', p_audit_id; end if;
  if v_status is null
     or v_status not in ('preview_ready', 'clean', 'unlocked')
     or (v_status = 'unlocked' and (v_fee is distinct from 0 or v_total is null or v_total < 1 or v_total >= 50))
     or (v_status = 'preview_ready' and (v_fee is null or v_fee < 50)) then
    raise exception 'scan may not finish as % with fee %', coalesce(v_status, 'null'), coalesce(v_fee::text, 'null');
  end if;

  insert into public.extractions (audit_id, user_id, source, data)
  values (p_audit_id, v_user, p_result #>> '{extraction,source}', p_result #> '{extraction,data}');

  insert into public.findings (audit_id, user_id, position, category, description, first_date, last_date,
    line_numbers, charged_cents, allowed_cents, owed_cents, basis, citation, source_url, lease_ref, law_notes)
  select p_audit_id, v_user, (f ->> 'position')::int, f ->> 'category', f ->> 'description',
    (f ->> 'firstDate')::date, (f ->> 'lastDate')::date,
    array(select jsonb_array_elements_text(f -> 'lineNumbers')::int),
    (f ->> 'chargedCents')::bigint, (f ->> 'allowedCents')::bigint, (f ->> 'owedCents')::bigint,
    f ->> 'basis', f ->> 'citation', f ->> 'sourceUrl', f ->> 'leaseRef', coalesce(f -> 'lawNotes', '[]'::jsonb)
  from jsonb_array_elements(p_result -> 'findings') as f;

  insert into public.letters (audit_id, user_id, locale, template_version, body)
  select p_audit_id, v_user, l ->> 'locale', l ->> 'templateVersion', l ->> 'body'
  from jsonb_array_elements(p_result -> 'letters') as l;

  update public.audits set
    status = (p_result ->> 'status')::public.audit_status,
    total_owed_cents = (p_result ->> 'totalOwedCents')::bigint,
    item_count = (p_result ->> 'itemCount')::int,
    lines_scanned = (p_result ->> 'linesScanned')::int,
    fee_cents = (p_result ->> 'feeCents')::bigint,
    unlocked_at = (p_result ->> 'unlockedAt')::timestamptz,
    engine_version = p_result ->> 'engineVersion'
  where id = p_audit_id;

  if (select coalesce(sum(owed_cents), 0) from public.findings where audit_id = p_audit_id)
     <> (p_result ->> 'totalOwedCents')::bigint then
    raise exception 'findings do not add up to the audit total';
  end if;
end $$;
revoke all on function public.save_scan_result(uuid, jsonb) from public, anonymous, authenticated;

-- ---------------------------------------------------------------- lock out every role but the owner
alter table public.profiles        enable row level security;
alter table public.audits          enable row level security;
alter table public.documents       enable row level security;
alter table public.extractions     enable row level security;
alter table public.findings        enable row level security;
alter table public.letters         enable row level security;
alter table public.payments        enable row level security;
alter table public.stripe_events   enable row level security;
alter table public.payment_reviews enable row level security;
alter table public.rate_limits     enable row level security;

revoke all on public.profiles, public.audits, public.documents, public.extractions, public.findings, public.letters,
  public.payments, public.stripe_events, public.payment_reviews, public.rate_limits from public, anonymous, authenticated;
revoke all on function public.set_updated_at() from public, anonymous, authenticated;
revoke all on type public.audit_status, public.doc_kind, public.payment_status from public, anonymous, authenticated;

alter default privileges in schema public revoke all on tables from authenticated, anonymous;
alter default privileges in schema public revoke all on sequences from authenticated, anonymous;
alter default privileges in schema public revoke all on functions from public, authenticated, anonymous;
