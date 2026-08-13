begin;

alter table public.hr_vacation_movements
  add column if not exists effective_date date,
  add column if not exists source text not null default 'system',
  add column if not exists source_reference text,
  add column if not exists import_batch_id uuid,
  add column if not exists row_hash text;

create table if not exists public.hr_vacation_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  import_type text not null,
  source_filename text not null,
  source_hash text not null,
  cutoff_date date,
  status text not null default 'previewed',
  total_rows integer not null default 0,
  ready_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  review_rows integer not null default 0,
  invalid_rows integer not null default 0,
  created_rows integer not null default 0,
  skipped_rows integer not null default 0,
  failed_rows integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint hr_vacation_import_batches_type_chk check (import_type in ('balances', 'used_vacations', 'movements')),
  unique (tenant_id, source_hash, import_type)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hr_vacation_movements_import_batch_fk'
  ) then
    alter table public.hr_vacation_movements
      add constraint hr_vacation_movements_import_batch_fk
      foreign key (import_batch_id)
      references public.hr_vacation_import_batches(id)
      on delete set null;
  end if;
end $$;

create index if not exists hr_vacation_movements_effective_idx
  on public.hr_vacation_movements(tenant_id, employee_id, effective_date desc, created_at desc);

create unique index if not exists hr_vacation_movements_row_hash_uidx
  on public.hr_vacation_movements(tenant_id, employee_id, row_hash)
  where row_hash is not null;

create index if not exists hr_vacation_import_batches_tenant_idx
  on public.hr_vacation_import_batches(tenant_id, created_at desc);

alter table public.hr_vacation_import_batches enable row level security;

grant select, insert, update on table public.hr_vacation_import_batches to authenticated;
grant select, insert, update, delete on table public.hr_vacation_import_batches to service_role;

drop policy if exists "hr members can read hr_vacation_import_batches" on public.hr_vacation_import_batches;
create policy "hr members can read hr_vacation_import_batches"
on public.hr_vacation_import_batches for select
to authenticated
using (public.current_user_is_member(tenant_id));

drop policy if exists "hr admins can manage hr_vacation_import_batches" on public.hr_vacation_import_batches;
create policy "hr admins can manage hr_vacation_import_batches"
on public.hr_vacation_import_batches for all
to authenticated
using (public.current_user_has_role(tenant_id, array['owner', 'admin', 'finance_manager']::public.app_role[]))
with check (public.current_user_has_role(tenant_id, array['owner', 'admin', 'finance_manager']::public.app_role[]));

comment on table public.hr_vacation_import_batches is 'Lotes de importacion masiva de vacaciones con preview, confirmacion e idempotencia por source_hash.';
comment on column public.hr_vacation_movements.row_hash is 'Hash estable de fila importada para impedir movimientos duplicados.';

commit;
