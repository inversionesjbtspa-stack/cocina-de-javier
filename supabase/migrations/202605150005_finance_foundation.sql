-- Finance foundation: accounts payable, budgets, reports and dashboard views.

create type public.accounts_payable_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'scheduled',
  'paid',
  'rejected',
  'cancelled'
);

create type public.payment_batch_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'file_generated',
  'sent_to_bank',
  'partially_reconciled',
  'reconciled',
  'cancelled'
);

create type public.budget_status as enum (
  'draft',
  'active',
  'closed',
  'archived'
);

create table public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  dte_document_id uuid references public.dte_documents(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  document_number text not null,
  issue_date date not null,
  due_date date not null,
  subtotal numeric(14, 4) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14, 4) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14, 4) not null check (total_amount >= 0),
  balance_amount numeric(14, 4) not null check (balance_amount >= 0),
  currency text not null default 'CLP' check (currency ~ '^[A-Z]{3}$'),
  status public.accounts_payable_status not null default 'draft',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, supplier_id, document_number)
);

create table public.payment_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  batch_number text not null,
  bank_name text not null default 'Banco Santander Chile',
  status public.payment_batch_status not null default 'draft',
  total_amount numeric(14, 4) not null default 0 check (total_amount >= 0),
  item_count integer not null default 0 check (item_count >= 0),
  currency text not null default 'CLP' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, batch_number)
);

create table public.payment_batch_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_batch_id uuid not null references public.payment_batches(id) on delete cascade,
  accounts_payable_id uuid not null references public.accounts_payable(id) on delete restrict,
  supplier_bank_account_id uuid references public.supplier_bank_accounts(id) on delete restrict,
  amount numeric(14, 4) not null check (amount > 0),
  currency text not null default 'CLP' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (payment_batch_id, accounts_payable_id)
);

create table public.payment_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_batch_id uuid not null references public.payment_batches(id) on delete cascade,
  storage_bucket text not null default 'payment-files',
  storage_path text not null,
  format_code text not null,
  format_version text not null,
  sha256 text not null,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  status public.budget_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (tenant_id, name, period_start, period_end)
);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  product_category_id uuid references public.product_categories(id) on delete set null,
  amount numeric(14, 4) not null check (amount >= 0),
  currency text not null default 'CLP' check (currency ~ '^[A-Z]{3}$'),
  notes text,
  created_at timestamptz not null default now()
);

create table public.report_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  report_code text not null,
  format text not null check (format in ('xlsx', 'pdf', 'csv')),
  filters jsonb not null default '{}'::jsonb,
  storage_bucket text not null default 'report-exports',
  storage_path text,
  status text not null default 'queued',
  requested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index accounts_payable_tenant_status_idx on public.accounts_payable(tenant_id, status);
create index accounts_payable_due_date_idx on public.accounts_payable(tenant_id, due_date);
create index payment_batches_tenant_status_idx on public.payment_batches(tenant_id, status);
create index payment_batch_items_batch_idx on public.payment_batch_items(payment_batch_id);
create index budgets_tenant_status_idx on public.budgets(tenant_id, status);
create index report_exports_tenant_status_idx on public.report_exports(tenant_id, status);

create trigger accounts_payable_set_updated_at
before update on public.accounts_payable
for each row execute function public.set_updated_at();

create trigger payment_batches_set_updated_at
before update on public.payment_batches
for each row execute function public.set_updated_at();

create trigger budgets_set_updated_at
before update on public.budgets
for each row execute function public.set_updated_at();

alter table public.accounts_payable enable row level security;
alter table public.payment_batches enable row level security;
alter table public.payment_batch_items enable row level security;
alter table public.payment_files enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_lines enable row level security;
alter table public.report_exports enable row level security;

create policy "finance users can read accounts payable"
on public.accounts_payable for select
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant', 'auditor']::public.app_role[]
  )
);

create policy "finance users can manage accounts payable"
on public.accounts_payable for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
);

create policy "finance users can read payment batches"
on public.payment_batches for select
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant', 'auditor']::public.app_role[]
  )
);

create policy "finance managers can manage payment batches"
on public.payment_batches for all
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

create policy "finance users can read payment batch items"
on public.payment_batch_items for select
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant', 'auditor']::public.app_role[]
  )
);

create policy "finance managers can manage payment batch items"
on public.payment_batch_items for all
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

create policy "finance users can read payment files"
on public.payment_files for select
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'auditor']::public.app_role[]
  )
);

create policy "finance managers can manage payment files"
on public.payment_files for all
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

create policy "finance users can read budgets"
on public.budgets for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "finance users can manage budgets"
on public.budgets for all
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

create policy "members can read budget lines"
on public.budget_lines for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "finance users can manage budget lines"
on public.budget_lines for all
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

create policy "members can read report exports"
on public.report_exports for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "members can create report exports"
on public.report_exports for insert
to authenticated
with check (public.current_user_is_member(tenant_id));

create or replace view public.v_financial_dashboard as
select
  ap.tenant_id,
  ap.company_id,
  count(*) filter (where ap.status in ('pending_approval', 'approved', 'scheduled')) as open_accounts_payable_count,
  coalesce(sum(ap.balance_amount) filter (where ap.status in ('pending_approval', 'approved', 'scheduled')), 0) as open_accounts_payable_amount,
  coalesce(sum(ap.balance_amount) filter (where ap.due_date < current_date and ap.status not in ('paid', 'cancelled')), 0) as overdue_amount,
  coalesce(sum(ap.tax_amount) filter (where ap.issue_date >= date_trunc('month', current_date)), 0) as month_tax_credit,
  count(*) filter (where ap.due_date <= current_date + interval '7 days' and ap.status in ('approved', 'scheduled')) as due_next_7_days_count
from public.accounts_payable ap
group by ap.tenant_id, ap.company_id;
