-- KRA eTIMS (OSCU): fiscal invoices for client invoices (per workspace) and for OrbitOS plan payments (platform).
--
-- Every sale sent to KRA needs an invoice number (invcNo) that increases by exactly 1 per branch, with no gaps.
-- Numbers are therefore claimed only at the moment of sending, under a lease, and only "used" once KRA accepts
-- the document (see etims_claim / etims_release). All tables are server-only except safe read access below.

-- ───────── KRA PINs on records the client may edit ─────────
alter table public.invoices add column if not exists client_kra_pin text
  check (client_kra_pin is null or client_kra_pin ~ '^[A-Z][0-9]{9}[A-Z]$');
grant update (client_kra_pin) on public.invoices to authenticated;

-- The workspace's own PIN, printed on OrbitOS plan receipts so the customer can claim input VAT.
-- Set by the owner through /api/settings/billing-details (not client-writable).
alter table public.organizations add column if not exists kra_pin text
  check (kra_pin is null or kra_pin ~ '^[A-Z][0-9]{9}[A-Z]$');

-- ───────── Device configuration (one per workspace, plus 'platform' for OrbitOS itself) ─────────
create table public.etims_configs (
  scope text primary key,                       -- workspace uuid as text, or 'platform'
  org_id uuid references public.organizations on delete cascade,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  tin text not null check (tin ~ '^[A-Z][0-9]{9}[A-Z]$'),
  bhf_id text not null default '00' check (bhf_id ~ '^[0-9]{2}$'),
  device_serial text not null check (char_length(device_serial) between 1 and 100),
  cmc_key_enc text,                             -- AES-256-GCM, never returned to clients
  trade_name text,
  branch_name text,
  sdc_id text,
  mrc_no text,
  tax_type text not null default 'B' check (tax_type in ('A', 'B', 'C', 'D', 'E')),
  item_cls_cd text check (item_cls_cd is null or item_cls_cd ~ '^[0-9]{1,10}$'),
  item_cls_name text,
  item_cd text,
  item_name text not null default 'Professional services',
  status text not null default 'not_connected' check (status in ('not_connected', 'needs_item', 'active', 'error')),
  last_error text,
  initialized_at timestamptz,
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now(),
  check ((scope = 'platform' and org_id is null) or (scope <> 'platform' and org_id is not null and scope = org_id::text))
);
alter table public.etims_configs enable row level security;
-- No policies: read through /api/etims/config, which never returns the communication key.

-- ───────── Invoice-number sequence with a short lease (serialises sending per branch) ─────────
create table public.etims_sequences (
  scope text primary key references public.etims_configs on delete cascade,
  next_invc_no bigint not null default 1 check (next_invc_no >= 1),
  lease_token uuid,
  lease_until timestamptz
);
alter table public.etims_sequences enable row level security;

-- ───────── Documents sent (or waiting to be sent) to KRA ─────────
create table public.etims_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  scope text not null references public.etims_configs on delete cascade,
  org_id uuid references public.organizations on delete cascade,   -- the workspace the document belongs to
  kind text not null check (kind in ('sale', 'credit_note')),
  invoice_id uuid references public.invoices on delete set null,
  billing_payment_id uuid references public.billing_payments on delete set null,
  original_id uuid references public.etims_documents on delete set null,   -- credit note → the sale it reverses
  trade_invoice_no text not null,               -- our number (INV-2026-0042 / receipt api_ref)
  customer_name text,
  customer_pin text,
  amount_minor bigint not null check (amount_minor > 0),   -- VAT-inclusive total, KES cents
  tax_type text not null check (tax_type in ('A', 'B', 'C', 'D', 'E')),
  status text not null default 'queued' check (status in ('queued', 'submitted', 'rejected', 'skipped')),
  invc_no bigint,                               -- assigned when KRA accepts (or while a send is in flight)
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  result_cd text,
  result_msg text,
  rcpt_no bigint,                               -- curRcptNo
  tot_rcpt_no bigint,
  intrl_data text,
  rcpt_sign text,
  sdc_date_time text,
  sdc_id text,
  mrc_no text,
  submitted_at timestamptz,
  request jsonb,
  response jsonb,
  unique (scope, invc_no)
);
create index on public.etims_documents (status, next_attempt_at);
create index on public.etims_documents (invoice_id);
create index on public.etims_documents (billing_payment_id);
create unique index etims_one_sale_per_invoice on public.etims_documents (invoice_id) where kind = 'sale' and invoice_id is not null and status <> 'rejected';
create unique index etims_one_credit_per_sale on public.etims_documents (original_id) where kind = 'credit_note' and status <> 'rejected';
create unique index etims_one_sale_per_payment on public.etims_documents (billing_payment_id) where kind = 'sale' and billing_payment_id is not null;
alter table public.etims_documents enable row level security;
-- Workspace finance roles may read their own workspace's fiscal documents (status, CU number, signature).
create policy etims_documents_read on public.etims_documents for select to authenticated
  using (org_id is not null and public.has_org_role(org_id, array['owner', 'director', 'auditor']));
revoke insert, update, delete on public.etims_documents from authenticated, anon;
revoke all on public.etims_configs, public.etims_sequences from authenticated, anon;

-- KRA's item classification list (shared, refreshed from /selectItemClsList).
create table public.etims_item_classes (
  environment text not null check (environment in ('sandbox', 'production')),
  code text not null,
  name text not null,
  tax_type text,
  primary key (environment, code)
);
alter table public.etims_item_classes enable row level security;
revoke all on public.etims_item_classes from authenticated, anon;

-- ───────── Lease helpers (service role only) ─────────
-- Claims the branch's next invoice number for up to 90 s. Returns null when another send holds the lease.
create or replace function public.etims_claim(p_scope text, p_token uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_next bigint;
begin
  insert into public.etims_sequences (scope) values (p_scope) on conflict (scope) do nothing;
  update public.etims_sequences
     set lease_token = p_token, lease_until = now() + interval '90 seconds'
   where scope = p_scope and (lease_token is null or lease_until < now() or lease_token = p_token)
  returning next_invc_no into v_next;
  return v_next;
end $$;

-- Ends the lease. p_used = true when KRA accepted (or already had) number p_no: the sequence moves past it.
create or replace function public.etims_release(p_scope text, p_token uuid, p_used boolean, p_no bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.etims_sequences
     set next_invc_no = case when p_used then greatest(next_invc_no, p_no + 1) else next_invc_no end,
         lease_token = null, lease_until = null
   where scope = p_scope and lease_token = p_token;
end $$;
revoke all on function public.etims_claim(text, uuid), public.etims_release(text, uuid, boolean, bigint) from public, anon, authenticated;
grant execute on function public.etims_claim(text, uuid), public.etims_release(text, uuid, boolean, bigint) to service_role;

-- ───────── Fiscalised invoices can only be voided through the server (which raises a KRA credit note) ─────────
create or replace function public.invoices_fiscal_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (
       select 1 from public.etims_documents d
        where d.invoice_id = old.id and d.kind = 'sale' and d.status in ('queued', 'submitted')) then
    if new.status is distinct from old.status and new.status = 'void' then
      raise exception 'This invoice was sent to KRA eTIMS. Void it with the Void button so a credit note is issued.' using errcode = '42501';
    end if;
    if new.amount_minor is distinct from old.amount_minor or new.currency is distinct from old.currency
       or new.client_kra_pin is distinct from old.client_kra_pin or new.client_name is distinct from old.client_name then
      raise exception 'This invoice was sent to KRA eTIMS, so its amount and client details can no longer change.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger invoices_fiscal_guard before update on public.invoices for each row execute function public.invoices_fiscal_guard();

create or replace function public.invoices_fiscal_delete_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the service role and for cascades (e.g. a workspace deleted after offboarding).
  if auth.uid() is not null and exists (select 1 from public.etims_documents d where d.invoice_id = old.id and d.status in ('queued', 'submitted')) then
    raise exception 'This invoice was sent to KRA eTIMS and can''t be deleted. Void it instead.' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger invoices_fiscal_delete_guard before delete on public.invoices for each row execute function public.invoices_fiscal_delete_guard();
