begin;

-- Back up the table and Storage inventory before applying remotely. Never deduplicate history here.
do $$ begin
  if exists (
    select 1 from public.hr_vacation_documents
    where document_type='comprobante_feriado'
    group by tenant_id,vacation_request_id,document_type having count(*)>1
  ) then raise exception 'duplicate_vacation_receipt_metadata_requires_review' using errcode='23505'; end if;
end $$;

-- Legacy papeleta rows can legitimately coexist until reviewed separately.
create unique index if not exists hr_vacation_receipt_metadata_identity_uidx
  on public.hr_vacation_documents(tenant_id,vacation_request_id,document_type)
  where document_type='comprobante_feriado';

create or replace function public.hr_upsert_vacation_receipt_metadata(p_metadata jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.hr_vacation_requests; document_id uuid; expected_path text;
begin
  select * into r from public.hr_vacation_requests
    where id=(p_metadata->>'vacation_request_id')::uuid
      and tenant_id=(p_metadata->>'tenant_id')::uuid
      and employee_id=(p_metadata->>'employee_id')::uuid
    for update;
  if not found then raise exception 'vacation_receipt_owner_mismatch'; end if;
  if r.status is distinct from 'aprobada' then raise exception 'vacation_not_approved'; end if;
  expected_path := 'tenants/'||r.tenant_id||'/employees/'||r.employee_id||'/vacations/'||r.id||'/'||coalesce(r.document_number,r.receipt_number)||'.pdf';
  if expected_path is null
    or p_metadata->>'storage_path' is distinct from expected_path
    or p_metadata->>'storage_bucket' is distinct from 'hr-vacation-documents'
    or p_metadata->>'document_type' is distinct from 'comprobante_feriado'
    or p_metadata->>'mime_type' is distinct from 'application/pdf'
    or coalesce(p_metadata->>'file_sha256','') !~ '^[a-f0-9]{64}$'
    or coalesce((p_metadata->>'file_size')::bigint,0)<=0
    or nullif(p_metadata->>'file_name','') is null
    or nullif(p_metadata->>'generated_by','') is null
    or jsonb_typeof(p_metadata->'immutable_snapshot') is distinct from 'object'
    then raise exception 'invalid_vacation_receipt_metadata'; end if;

  insert into public.hr_vacation_documents as document (
    tenant_id,employee_id,vacation_request_id,document_type,document_status,
    file_name,file_sha256,file_size,mime_type,generated_at,generated_by,
    immutable_snapshot,storage_bucket,storage_path
  ) values (
    r.tenant_id,r.employee_id,r.id,'comprobante_feriado',coalesce(r.receipt_status,'vigente'),
    p_metadata->>'file_name',p_metadata->>'file_sha256',(p_metadata->>'file_size')::bigint,
    'application/pdf',now(),(p_metadata->>'generated_by')::uuid,
    p_metadata->'immutable_snapshot','hr-vacation-documents',expected_path
  ) on conflict (tenant_id,vacation_request_id,document_type)
    where document_type='comprobante_feriado'
  do update set
    document_status=excluded.document_status,file_name=excluded.file_name,
    file_sha256=excluded.file_sha256,file_size=excluded.file_size,mime_type=excluded.mime_type,
    generated_at=excluded.generated_at,generated_by=excluded.generated_by,
    immutable_snapshot=excluded.immutable_snapshot,storage_bucket=excluded.storage_bucket,
    storage_path=excluded.storage_path,version=coalesce(document.version,1)+1
  returning id into document_id;
  return document_id;
end $$;

-- Only the existing trusted server writer can call this function; RLS and table grants stay unchanged.
revoke all on function public.hr_upsert_vacation_receipt_metadata(jsonb) from public,anon,authenticated;
grant execute on function public.hr_upsert_vacation_receipt_metadata(jsonb) to service_role;

notify pgrst,'reload schema';
commit;
