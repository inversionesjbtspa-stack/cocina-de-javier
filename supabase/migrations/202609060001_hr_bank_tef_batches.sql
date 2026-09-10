alter table public.hr_employee_bank_accounts
  add column if not exists real_owner_name text,
  add column if not exists review_status text,
  add column if not exists reviewed_at timestamptz;

alter table public.hr_payment_batch_items
  add column if not exists snapshot jsonb not null default '{}'::jsonb,
  add column if not exists employee_name_snapshot text,
  add column if not exists holder_rut_snapshot text,
  add column if not exists bank_code_snapshot text,
  add column if not exists payment_email_snapshot text,
  add column if not exists glosa_tef_snapshot text,
  add column if not exists glosa_correo_snapshot text;

create index if not exists hr_employee_bank_accounts_review_status_idx
on public.hr_employee_bank_accounts(tenant_id, review_status);

create index if not exists hr_payment_batch_items_snapshot_gin_idx
on public.hr_payment_batch_items using gin(snapshot);

create unique index if not exists hr_payment_batch_items_active_payment_item_uidx
on public.hr_payment_batch_items(payment_item_id)
where payment_item_id is not null and status not in ('cancelada', 'pagada');

alter table public.hr_employee_bank_accounts enable row level security;
alter table public.hr_payment_batch_items enable row level security;

notify pgrst, 'reload schema';
