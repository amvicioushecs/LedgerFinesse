-- LedgerFinesse site v1: audits, paywalled findings and letters, Stripe payments.
-- Renters read their own rows; the server (service role) writes. The paywall is enforced here:
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
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null check (char_length(email) <= 320),
  locale     text not null default 'en' check (locale in ('en', 'es')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email) values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

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
  -- Flat 15% of the verified total, rounded half up, fixed when the scan finishes. 0 = clean or waived.
  fee_cents          bigint check (fee_cents >= 0),
  engine_version     text,
  unlocked_at        timestamptz,
  -- Set when a scan claims the audit; a scan still processing 10 minutes later is failed on the next read.
  scan_started_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint audits_fee_is_15_percent check (
    fee_cents is null or total_owed_cents is null
    or fee_cents = (total_owed_cents * 15 + 50) / 100
    or (fee_cents = 0 and (total_owed_cents * 15 + 50) / 100 < 50)
  ),
  constraint audits_clean_is_zero check (status <> 'clean' or total_owed_cents = 0),
  constraint audits_scanned_has_summary check (
    status not in ('preview_ready', 'clean', 'unlocked')
    or (total_owed_cents is not null and item_count is not null and fee_cents is not null)
  ),
  constraint audits_unlocked_has_time check (status <> 'unlocked' or unlocked_at is not null),
  constraint audits_processing_has_start check (status <> 'processing' or scan_started_at is not null)
);
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

-- ---------------------------------------------------------------- unlock (service role only)
-- One transaction: dedupe the event, check the paid amount against the stored fee, mark paid, unlock.
-- Returns 'unlocked' | 'duplicate' | 'already_unlocked' | 'amount_mismatch' | 'unknown_session' | 'not_unlockable'.
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
  elsif v_audit.status = 'unlocked' then
    v_outcome := 'already_unlocked';
  elsif v_audit.status <> 'preview_ready' then
    v_outcome := 'not_unlockable';
  elsif p_currency <> 'usd' or p_amount_cents <> v_audit.fee_cents or p_amount_cents <> v_payment.amount_cents then
    v_outcome := 'amount_mismatch';
  else
    update public.payments
      set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent_id
      where id = v_payment.id;
    update public.audits set status = 'unlocked', unlocked_at = now() where id = v_audit.id;
    v_outcome := 'unlocked';
  end if;

  update public.stripe_events set processed_at = now(), outcome = v_outcome where event_id = p_event_id;
  return v_outcome;
end $$;
revoke all on function public.apply_checkout_paid(text, text, text, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.apply_checkout_paid(text, text, text, uuid, bigint, text, text) to service_role;

-- ---------------------------------------------------------------- save scan (service role only)
-- Stores the engine output in one transaction. Only a 'processing' audit can be completed.
create or replace function public.save_scan_result(p_audit_id uuid, p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  select user_id into v_user from public.audits where id = p_audit_id and status = 'processing' for update;
  if v_user is null then raise exception 'audit % is not processing', p_audit_id; end if;

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
revoke all on function public.save_scan_result(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_scan_result(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------- RLS and grants
alter table public.profiles      enable row level security;
alter table public.audits        enable row level security;
alter table public.documents     enable row level security;
alter table public.extractions   enable row level security;  -- no policies: service role only
alter table public.findings      enable row level security;
alter table public.letters       enable row level security;
alter table public.payments      enable row level security;
alter table public.stripe_events enable row level security;  -- no policies: service role only

-- Renters never write through the Data API; every write goes through a server route.
revoke all on public.profiles, public.audits, public.documents, public.extractions,
  public.findings, public.letters, public.payments, public.stripe_events from anon, authenticated;
grant select on public.profiles, public.audits, public.documents, public.findings,
  public.letters, public.payments to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy audits_select_own on public.audits for select to authenticated
  using (user_id = (select auth.uid()));
create policy documents_select_own on public.documents for select to authenticated
  using (user_id = (select auth.uid()));
create policy payments_select_own on public.payments for select to authenticated
  using (user_id = (select auth.uid()));

-- PAYWALL: line-level findings and letters only after a verified unlock.
create policy findings_select_unlocked on public.findings for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.audits a where a.id = audit_id and a.user_id = (select auth.uid()) and a.status = 'unlocked'));
create policy letters_select_unlocked on public.letters for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.audits a where a.id = audit_id and a.user_id = (select auth.uid()) and a.status = 'unlocked'));

-- ---------------------------------------------------------------- Storage: private documents bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Owners may read their own folder; uploads go through the server after type/size/magic-byte checks.
create policy documents_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
