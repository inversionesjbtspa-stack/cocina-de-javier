alter table public.hr_payment_batches
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists selection_filters jsonb not null default '{}'::jsonb;

alter table public.hr_salary_data_audit
  add column if not exists accountant_data_row_id uuid references public.hr_accountant_data_rows(id) on delete set null;

create or replace function public.hr_create_payment_batch(
  p_tenant_id uuid,
  p_company_id uuid,
  p_user_id uuid,
  p_actor_role text,
  p_period text,
  p_payment_type text,
  p_glosa_global text,
  p_total_amount numeric,
  p_metadata jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_item_ids uuid[];
begin
  insert into public.hr_payment_batches (
    generated_by,
    glosa_global,
    metadata,
    payment_type,
    period,
    selection_filters,
    status,
    tenant_id,
    total_amount,
    total_employees
  )
  values (
    p_user_id,
    nullif(p_glosa_global, ''),
    coalesce(p_metadata, '{}'::jsonb),
    p_payment_type,
    p_period,
    '{}'::jsonb,
    'borrador',
    p_tenant_id,
    p_total_amount,
    jsonb_array_length(p_items)
  )
  returning id into v_batch_id;

  with inserted as (
    insert into public.hr_payment_items (
      account_number,
      account_type,
      amount,
      approved_at,
      approved_by,
      bank_code,
      bank_name,
      created_by,
      employee_id,
      glosa,
      metadata,
      payment_email,
      payment_type,
      period,
      scheduled_date,
      status,
      tenant_id
    )
    select
      item.account_number,
      item.account_type,
      item.amount,
      item.approved_at,
      item.approved_by,
      item.bank_code,
      item.bank_name,
      item.created_by,
      item.employee_id,
      item.glosa,
      item.metadata,
      item.payment_email,
      item.payment_type,
      item.period,
      item.scheduled_date,
      item.status,
      item.tenant_id
    from jsonb_to_recordset(p_items) as item(
      account_number text,
      account_type text,
      amount numeric,
      approved_at timestamptz,
      approved_by uuid,
      bank_code text,
      bank_name text,
      created_by uuid,
      employee_id uuid,
      glosa text,
      metadata jsonb,
      payment_email text,
      payment_type text,
      period text,
      scheduled_date date,
      status text,
      tenant_id uuid
    )
    returning id
  )
  select array_agg(id) into v_item_ids from inserted;

  update public.hr_payment_batches
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('payment_item_ids', coalesce(to_jsonb(v_item_ids), '[]'::jsonb))
  where id = v_batch_id and tenant_id = p_tenant_id;

  insert into public.audit_events (
    actor_role,
    actor_user_id,
    after_data,
    company_id,
    entity_id,
    entity_type,
    event_type,
    tenant_id
  )
  values (
    p_actor_role,
    p_user_id,
    jsonb_build_object('count', jsonb_array_length(p_items), 'invalid_count', 0, 'payment_type', p_payment_type, 'period', p_period, 'total_amount', p_total_amount),
    p_company_id,
    v_batch_id,
    'hr_payment_batch',
    'hr.payment_batch_created_from_selection',
    p_tenant_id
  );

  return jsonb_build_object('id', v_batch_id);
end;
$$;

create or replace function public.hr_upsert_accountant_data_rows(
  p_tenant_id uuid,
  p_company_id uuid,
  p_user_id uuid,
  p_actor_role text,
  p_rows jsonb
)
returns table(id uuid, audit_entries integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  old_row public.hr_accountant_data_rows%rowtype;
  new_id uuid;
  field_name text;
  old_value text;
  new_value text;
  audit_count integer;
  audited_fields text[] := array[
    'absences','licenses','overtime_hours','production_bonus_amount','compensatory_bonus_amount',
    'responsibility_bonus_amount','aguinaldo_amount','advances_amount','cash_allowance_amount',
    'ccaf_loan_amount','company_loan_amount','movilization_amount','observations',
    'phone_allowance_amount','reason','sunday_surcharge_amount'
  ];
begin
  for item in select * from jsonb_array_elements(p_rows)
  loop
    if (item->>'tenant_id')::uuid <> p_tenant_id then
      raise exception 'tenant mismatch in salary row';
    end if;

    select * into old_row
    from public.hr_accountant_data_rows
    where tenant_id = p_tenant_id
      and period = item->>'period'
      and rut = item->>'rut'
      and sheet_name = item->>'sheet_name'
    for update;

    insert into public.hr_accountant_data_rows (
      absences, advances_amount, aguinaldo_amount, cash_allowance_amount, ccaf_loan_amount,
      compensatory_bonus_amount, company_loan_amount, cost_center, created_by, employee_id,
      full_name, licenses, movilization_amount, observations, overtime_hours, period,
      phone_allowance_amount, production_bonus_amount, raw_row, reason, responsibility_bonus_amount,
      row_number, rut, sheet_name, source_file, sunday_surcharge_amount, tenant_id, updated_by
    )
    values (
      coalesce((item->>'absences')::numeric, 0),
      coalesce((item->>'advances_amount')::numeric, 0),
      coalesce((item->>'aguinaldo_amount')::numeric, 0),
      coalesce((item->>'cash_allowance_amount')::numeric, 0),
      coalesce((item->>'ccaf_loan_amount')::numeric, 0),
      coalesce((item->>'compensatory_bonus_amount')::numeric, 0),
      coalesce((item->>'company_loan_amount')::numeric, 0),
      nullif(item->>'cost_center', ''),
      p_user_id,
      nullif(item->>'employee_id', '')::uuid,
      item->>'full_name',
      coalesce((item->>'licenses')::numeric, 0),
      coalesce((item->>'movilization_amount')::numeric, 0),
      nullif(item->>'observations', ''),
      coalesce((item->>'overtime_hours')::numeric, 0),
      item->>'period',
      coalesce((item->>'phone_allowance_amount')::numeric, 0),
      coalesce((item->>'production_bonus_amount')::numeric, 0),
      coalesce(item->'raw_row', '{}'::jsonb),
      nullif(item->>'reason', ''),
      coalesce((item->>'responsibility_bonus_amount')::numeric, 0),
      nullif(item->>'row_number', '')::integer,
      item->>'rut',
      item->>'sheet_name',
      item->>'source_file',
      coalesce((item->>'sunday_surcharge_amount')::numeric, 0),
      p_tenant_id,
      p_user_id
    )
    on conflict (tenant_id, period, rut, sheet_name) do update set
      absences = excluded.absences,
      advances_amount = excluded.advances_amount,
      aguinaldo_amount = excluded.aguinaldo_amount,
      cash_allowance_amount = excluded.cash_allowance_amount,
      ccaf_loan_amount = excluded.ccaf_loan_amount,
      compensatory_bonus_amount = excluded.compensatory_bonus_amount,
      company_loan_amount = excluded.company_loan_amount,
      cost_center = excluded.cost_center,
      employee_id = excluded.employee_id,
      full_name = excluded.full_name,
      licenses = excluded.licenses,
      movilization_amount = excluded.movilization_amount,
      observations = excluded.observations,
      overtime_hours = excluded.overtime_hours,
      phone_allowance_amount = excluded.phone_allowance_amount,
      production_bonus_amount = excluded.production_bonus_amount,
      raw_row = excluded.raw_row,
      reason = excluded.reason,
      responsibility_bonus_amount = excluded.responsibility_bonus_amount,
      row_number = excluded.row_number,
      source_file = excluded.source_file,
      sunday_surcharge_amount = excluded.sunday_surcharge_amount,
      updated_by = p_user_id,
      updated_at = now()
    returning hr_accountant_data_rows.id into new_id;

    audit_count := 0;
    foreach field_name in array audited_fields
    loop
      execute format('select ($1).%I::text', field_name) using old_row into old_value;
      execute format('select %I::text from public.hr_accountant_data_rows where id = $1', field_name) using new_id into new_value;
      if old_row.id is null or coalesce(old_value, '') is distinct from coalesce(new_value, '') then
        insert into public.hr_salary_data_audit (
          accountant_data_row_id,
          changed_by,
          employee_id,
          field_name,
          new_value,
          old_value,
          period,
          source,
          tenant_id
        )
        values (
          new_id,
          p_user_id,
          nullif(item->>'employee_id', '')::uuid,
          field_name,
          new_value,
          old_value,
          item->>'period',
          item->>'source_file',
          p_tenant_id
        );
        audit_count := audit_count + 1;
      end if;
    end loop;

    insert into public.audit_events (
      actor_role,
      actor_user_id,
      after_data,
      company_id,
      entity_id,
      entity_type,
      event_type,
      tenant_id
    )
    values (
      p_actor_role,
      p_user_id,
      jsonb_build_object('period', item->>'period', 'rut', item->>'rut', 'audit_entries', audit_count),
      p_company_id,
      new_id,
      'hr_accountant_data_row',
      'hr.accountant_data_row_saved',
      p_tenant_id
    );

    id := new_id;
    audit_entries := audit_count;
    return next;
  end loop;
end;
$$;

grant execute on function public.hr_create_payment_batch(uuid, uuid, uuid, text, text, text, text, numeric, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.hr_upsert_accountant_data_rows(uuid, uuid, uuid, text, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
