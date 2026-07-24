alter table public.hr_vacation_requests
  add column if not exists receipt_number text,
  add column if not exists receipt_status text default 'borrador',
  add column if not exists receipt_snapshot jsonb,
  add column if not exists receipt_generated_at timestamptz,
  add column if not exists receipt_generated_by uuid references auth.users(id) on delete set null,
  add column if not exists reincorporation_date date,
  add column if not exists vacation_kind text,
  add column if not exists vacation_allocations jsonb default '[]'::jsonb;

alter table public.hr_vacation_documents
  add column if not exists file_name text,
  add column if not exists file_sha256 text,
  add column if not exists document_status text default 'vigente',
  add column if not exists immutable_snapshot jsonb,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_reason text;

create unique index if not exists hr_vacation_requests_receipt_number_uidx
  on public.hr_vacation_requests(tenant_id, receipt_number)
  where receipt_number is not null;

create index if not exists hr_vacation_documents_request_status_idx
  on public.hr_vacation_documents(tenant_id, vacation_request_id, document_status);

create index if not exists hr_vacation_documents_hash_idx
  on public.hr_vacation_documents(tenant_id, file_sha256)
  where file_sha256 is not null;

notify pgrst, 'reload schema';
