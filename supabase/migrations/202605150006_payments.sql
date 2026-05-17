-- Payment records: individual payment lifecycle and reconciliation evidence.

create type public.payment_status as enum (
  'prepared',
  'approved',
  'sent_to_bank',
  'paid',
  'rejected',
  'reversed',
  'cancelled'
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  accounts_payable_id uuid not null references public.accounts_payable(id) on delete restrict,
  payment_batch_id uuid references public.payment_batches(id) on delete set null,
  payment_batch_item_id uuid references public.payment_batch_items(id) on delete set null,
  payment_number text not null,
  bank_name text not null default 'Banco Santander Chile',
  amount numeric(14, 4) not null check (amount > 0),
  currency text not null default 'CLP' check (currency ~ '^[A-Z]{3}$'),
  status public.payment_status not null default 'prepared',
  prepared_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  bank_reference text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, payment_number),
  unique (accounts_payable_id, payment_batch_item_id)
);

create index payments_tenant_status_idx on public.payments(tenant_id, status);
create index payments_supplier_idx on public.payments(supplier_id);
create index payments_accounts_payable_idx on public.payments(accounts_payable_id);
create index payments_batch_idx on public.payments(payment_batch_id);

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

create policy "finance users can read payments"
on public.payments for select
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant', 'auditor']::public.app_role[]
  )
);

create policy "finance managers can manage payments"
on public.payments for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager']::public.app_role[]
  )
);
