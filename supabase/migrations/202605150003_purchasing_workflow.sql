-- Purchasing workflow: purchase requests, approvals, purchase orders and goods receipts.

create type public.purchase_request_status as enum (
  'draft',
  'submitted',
  'approved',
  'rejected',
  'converted',
  'cancelled'
);

create type public.purchase_order_status as enum (
  'draft',
  'issued',
  'partially_received',
  'received',
  'cancelled',
  'closed'
);

create type public.goods_receipt_status as enum (
  'draft',
  'posted',
  'cancelled'
);

create type public.approval_decision as enum (
  'pending',
  'approved',
  'rejected'
);

create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  request_number text not null,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  required_date date,
  status public.purchase_request_status not null default 'draft',
  justification text,
  subtotal numeric(14, 4) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14, 4) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14, 4) not null default 0 check (total_amount >= 0),
  currency text not null default 'CLP' check (currency ~ '^[A-Z]{3}$'),
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, request_number)
);

create table public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(14, 4) not null check (quantity > 0),
  unit text not null default 'unidad',
  estimated_unit_price numeric(14, 4) not null default 0 check (estimated_unit_price >= 0),
  estimated_total numeric(14, 4) generated always as (quantity * estimated_unit_price) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  approver_user_id uuid not null references public.profiles(id) on delete restrict,
  decision public.approval_decision not null default 'pending',
  comments text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_request_id, approver_user_id)
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_request_id uuid references public.purchase_requests(id) on delete set null,
  order_number text not null,
  issue_date date not null default current_date,
  expected_delivery_date date,
  status public.purchase_order_status not null default 'draft',
  subtotal numeric(14, 4) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14, 4) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14, 4) not null default 0 check (total_amount >= 0),
  currency text not null default 'CLP' check (currency ~ '^[A-Z]{3}$'),
  notes text,
  issued_by uuid references public.profiles(id) on delete set null,
  issued_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_number)
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  purchase_request_item_id uuid references public.purchase_request_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(14, 4) not null check (quantity > 0),
  received_quantity numeric(14, 4) not null default 0 check (received_quantity >= 0),
  unit text not null default 'unidad',
  unit_price numeric(14, 4) not null check (unit_price >= 0),
  line_total numeric(14, 4) generated always as (quantity * unit_price) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (received_quantity <= quantity)
);

create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  receipt_number text not null,
  received_by uuid not null references public.profiles(id) on delete restrict,
  received_at timestamptz not null default now(),
  status public.goods_receipt_status not null default 'draft',
  notes text,
  posted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, receipt_number)
);

create table public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  goods_receipt_id uuid not null references public.goods_receipts(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  received_quantity numeric(14, 4) not null check (received_quantity > 0),
  rejected_quantity numeric(14, 4) not null default 0 check (rejected_quantity >= 0),
  unit text not null default 'unidad',
  condition_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  purchase_request_id uuid references public.purchase_requests(id) on delete cascade,
  purchase_order_id uuid references public.purchase_orders(id) on delete cascade,
  goods_receipt_id uuid references public.goods_receipts(id) on delete cascade,
  document_type text not null,
  storage_bucket text not null,
  storage_path text not null,
  content_type text,
  sha256 text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  check (
    num_nonnulls(purchase_request_id, purchase_order_id, goods_receipt_id) = 1
  )
);

create index cost_centers_tenant_active_idx on public.cost_centers(tenant_id, is_active);
create index purchase_requests_tenant_status_idx on public.purchase_requests(tenant_id, status);
create index purchase_request_items_request_idx on public.purchase_request_items(purchase_request_id);
create index purchase_approvals_request_idx on public.purchase_approvals(purchase_request_id);
create index purchase_orders_tenant_status_idx on public.purchase_orders(tenant_id, status);
create index purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
create index purchase_order_items_order_idx on public.purchase_order_items(purchase_order_id);
create index goods_receipts_tenant_status_idx on public.goods_receipts(tenant_id, status);
create index goods_receipts_order_idx on public.goods_receipts(purchase_order_id);
create index goods_receipt_items_receipt_idx on public.goods_receipt_items(goods_receipt_id);
create index purchase_documents_tenant_idx on public.purchase_documents(tenant_id);

create trigger cost_centers_set_updated_at
before update on public.cost_centers
for each row execute function public.set_updated_at();

create trigger purchase_requests_set_updated_at
before update on public.purchase_requests
for each row execute function public.set_updated_at();

create trigger purchase_request_items_set_updated_at
before update on public.purchase_request_items
for each row execute function public.set_updated_at();

create trigger purchase_approvals_set_updated_at
before update on public.purchase_approvals
for each row execute function public.set_updated_at();

create trigger purchase_orders_set_updated_at
before update on public.purchase_orders
for each row execute function public.set_updated_at();

create trigger purchase_order_items_set_updated_at
before update on public.purchase_order_items
for each row execute function public.set_updated_at();

create trigger goods_receipts_set_updated_at
before update on public.goods_receipts
for each row execute function public.set_updated_at();

create trigger goods_receipt_items_set_updated_at
before update on public.goods_receipt_items
for each row execute function public.set_updated_at();

create or replace function public.post_goods_receipt(target_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt_record public.goods_receipts%rowtype;
  over_received_count integer;
begin
  select *
  into receipt_record
  from public.goods_receipts
  where id = target_receipt_id
  for update;

  if not found then
    raise exception 'Goods receipt % not found', target_receipt_id;
  end if;

  if receipt_record.status <> 'draft' then
    raise exception 'Goods receipt % is not in draft status', target_receipt_id;
  end if;

  if not public.current_user_has_role(
    receipt_record.tenant_id,
    array['owner', 'admin', 'procurement_manager', 'buyer', 'store_manager']::public.app_role[]
  ) then
    raise exception 'Not authorized to post goods receipt %', target_receipt_id;
  end if;

  select count(*)
  into over_received_count
  from (
    select
      poi.id,
      poi.quantity,
      poi.received_quantity,
      coalesce(sum(gri.received_quantity), 0) as receipt_quantity
    from public.purchase_order_items poi
    join public.goods_receipt_items gri on gri.purchase_order_item_id = poi.id
    where gri.goods_receipt_id = target_receipt_id
    group by poi.id, poi.quantity, poi.received_quantity
  ) lines
  where lines.received_quantity + lines.receipt_quantity > lines.quantity;

  if over_received_count > 0 then
    raise exception 'Goods receipt % exceeds purchase order quantities', target_receipt_id;
  end if;

  update public.purchase_order_items poi
  set received_quantity = poi.received_quantity + receipt_lines.receipt_quantity
  from (
    select
      purchase_order_item_id,
      sum(received_quantity) as receipt_quantity
    from public.goods_receipt_items
    where goods_receipt_id = target_receipt_id
    group by purchase_order_item_id
  ) receipt_lines
  where poi.id = receipt_lines.purchase_order_item_id;

  update public.goods_receipts
  set status = 'posted',
      posted_at = now()
  where id = target_receipt_id;

  update public.purchase_orders po
  set status = case
      when not exists (
        select 1
        from public.purchase_order_items poi
        where poi.purchase_order_id = po.id
          and poi.received_quantity < poi.quantity
      ) then 'received'::public.purchase_order_status
      when exists (
        select 1
        from public.purchase_order_items poi
        where poi.purchase_order_id = po.id
          and poi.received_quantity > 0
      ) then 'partially_received'::public.purchase_order_status
      else po.status
    end
  where po.id = receipt_record.purchase_order_id;
end;
$$;

revoke all on function public.post_goods_receipt(uuid) from public;
grant execute on function public.post_goods_receipt(uuid) to authenticated;

alter table public.cost_centers enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;
alter table public.purchase_approvals enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_items enable row level security;
alter table public.purchase_documents enable row level security;

create policy "members can read cost centers"
on public.cost_centers for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "admins can manage cost centers"
on public.cost_centers for all
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

create policy "members can read purchase requests"
on public.purchase_requests for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "purchasing users can manage purchase requests"
on public.purchase_requests for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'buyer', 'store_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'buyer', 'store_manager']::public.app_role[]
  )
);

create policy "members can read purchase request items"
on public.purchase_request_items for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "purchasing users can manage purchase request items"
on public.purchase_request_items for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'buyer', 'store_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'buyer', 'store_manager']::public.app_role[]
  )
);

create policy "members can read purchase approvals"
on public.purchase_approvals for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "managers can manage purchase approvals"
on public.purchase_approvals for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'finance_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'finance_manager']::public.app_role[]
  )
);

create policy "members can read purchase orders"
on public.purchase_orders for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "purchasing managers can manage purchase orders"
on public.purchase_orders for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
);

create policy "members can read purchase order items"
on public.purchase_order_items for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "purchasing managers can manage purchase order items"
on public.purchase_order_items for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
);

create policy "members can read goods receipts"
on public.goods_receipts for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "purchasing users can manage goods receipts"
on public.goods_receipts for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'buyer', 'store_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'buyer', 'store_manager']::public.app_role[]
  )
);

create policy "members can read goods receipt items"
on public.goods_receipt_items for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "purchasing users can manage goods receipt items"
on public.goods_receipt_items for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'buyer', 'store_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'buyer', 'store_manager']::public.app_role[]
  )
);

create policy "members can read purchase documents"
on public.purchase_documents for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "purchasing users can manage purchase documents"
on public.purchase_documents for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'buyer', 'store_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'buyer', 'store_manager']::public.app_role[]
  )
);
