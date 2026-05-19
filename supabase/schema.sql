create extension if not exists pgcrypto;

create table if not exists public.invoice_counters (
  invoice_year integer primary key,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  invoice_year integer not null,
  sequence_number integer not null,
  status text not null default 'rendering'
    check (status in ('rendering', 'issued', 'failed', 'void')),
  payload jsonb not null,
  totals jsonb not null default '{}'::jsonb,
  zugferd_xml text,
  pdf_sha256 text,
  error_message text,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists invoices_created_at_idx on public.invoices (created_at desc);
create index if not exists invoices_status_idx on public.invoices (status);

alter table public.invoice_counters enable row level security;
alter table public.invoices enable row level security;

create or replace function public.allocate_invoice_number(p_year integer)
returns table(invoice_number text, sequence_number integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.invoice_counters as counters (invoice_year, last_number, updated_at)
  values (p_year, 1, now())
  on conflict (invoice_year)
  do update set
    last_number = counters.last_number + 1,
    updated_at = now()
  returning
    format('%s-%s', p_year, lpad(last_number::text, 4, '0')),
    last_number
  into invoice_number, sequence_number;

  return next;
end;
$$;

revoke all on function public.allocate_invoice_number(integer) from public;
revoke all on public.invoice_counters from anon, authenticated;
revoke all on public.invoices from anon, authenticated;
