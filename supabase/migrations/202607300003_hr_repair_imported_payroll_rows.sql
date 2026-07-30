-- Idempotent repair for April 2026 multipage payslips confirmed before payroll rows were visible.
-- Additive data repair only: no payslips, employees, batches, or bank payments are deleted or changed.

insert into public.hr_payment_items (
  amount,
  created_by,
  employee_id,
  glosa,
  metadata,
  payslip_id,
  payment_type,
  period,
  source_id,
  source_type,
  status,
  tenant_id
)
select
  p.net_amount,
  p.uploaded_by,
  p.employee_id,
  'Pago remuneración abril 2026',
  jsonb_build_object(
    'repair_migration', '202607300003_hr_repair_imported_payroll_rows',
    'repaired_from_existing_payslip', true
  ),
  p.id,
  'remuneracion_mensual',
  p.period,
  p.id,
  'payslip_import',
  'pendiente_pago',
  p.tenant_id
from public.hr_payslips p
where p.period = '2026-04'
  and p.status = 'cargada'
  and p.employee_id is not null
  and p.net_amount > 0
  and not exists (
    select 1
    from public.hr_payment_items i
    where i.tenant_id = p.tenant_id
      and i.source_type = 'payslip_import'
      and (i.payslip_id = p.id or i.source_id = p.id)
  );
