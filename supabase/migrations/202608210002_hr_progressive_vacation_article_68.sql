do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hr_vacation_progressive_previous_years_chk'
      and conrelid = 'public.hr_vacation_progressive_records'::regclass
  ) then
    alter table public.hr_vacation_progressive_records
      add constraint hr_vacation_progressive_previous_years_chk
      check (previous_employer_years >= 0 and previous_employer_years <= 10) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'hr_vacation_progressive_recognized_days_chk'
      and conrelid = 'public.hr_vacation_progressive_records'::regclass
  ) then
    alter table public.hr_vacation_progressive_records
      add constraint hr_vacation_progressive_recognized_days_chk
      check (recognized_days = 0) not valid;
  end if;
end $$;

create or replace function public.hr_accredit_progressive_vacation(
  p_actor_role text,
  p_company_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_employee_id uuid := (p_payload->>'employee_id')::uuid;
  v_previous_years numeric := coalesce((p_payload->>'previous_employer_years')::numeric, 0);
begin
  if p_actor_role not in ('owner', 'admin', 'finance_manager') then
    raise exception 'hr_forbidden';
  end if;
  if v_previous_years < 0 or v_previous_years > 10 then
    raise exception 'progressive_previous_employer_years_out_of_range';
  end if;
  if not exists (select 1 from public.hr_employees where id = v_employee_id and tenant_id = p_tenant_id) then
    raise exception 'employee_not_in_tenant';
  end if;

  insert into public.hr_vacation_progressive_records(
    tenant_id, employee_id, previous_employer_years, credited_months, accreditation_date,
    effective_from, recognized_days, document_path, document_type, status, reviewed_by,
    reviewed_at, review_notes, created_by
  ) values (
    p_tenant_id, v_employee_id, v_previous_years,
    coalesce((p_payload->>'credited_months')::integer, 0), nullif(p_payload->>'accreditation_date', '')::date,
    nullif(p_payload->>'effective_from', '')::date, 0,
    p_payload->>'document_path', p_payload->>'document_type', coalesce(p_payload->>'status', 'acreditado'),
    p_user_id, now(), p_payload->>'review_notes', p_user_id
  ) returning id into v_id;

  insert into public.audit_events(actor_role, actor_user_id, after_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (
    p_actor_role,
    p_user_id,
    p_payload || jsonb_build_object('recognized_days', 0, 'legal_basis', 'Codigo del Trabajo articulos 67 y 68'),
    p_company_id,
    v_id,
    'hr_vacation_progressive_record',
    'hr.vacation_progressive_accredited',
    p_tenant_id
  );
  return v_id;
end;
$$;

revoke execute on function public.hr_accredit_progressive_vacation(text, uuid, uuid, uuid, jsonb) from public;
revoke execute on function public.hr_accredit_progressive_vacation(text, uuid, uuid, uuid, jsonb) from anon;
grant execute on function public.hr_accredit_progressive_vacation(text, uuid, uuid, uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
