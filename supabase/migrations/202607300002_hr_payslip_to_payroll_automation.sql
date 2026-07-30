-- Idempotency guard for automatic payroll rows created from imported payslips.
-- Additive only: no data is deleted or rewritten.

create unique index if not exists hr_payment_items_payslip_import_source_uidx
  on public.hr_payment_items(tenant_id, source_type, source_id)
  where source_type = 'payslip_import' and source_id is not null;

create unique index if not exists hr_payment_items_payslip_import_payslip_uidx
  on public.hr_payment_items(tenant_id, payslip_id)
  where source_type = 'payslip_import' and payslip_id is not null;

create index if not exists hr_payment_items_source_lookup_idx
  on public.hr_payment_items(tenant_id, source_type, source_id)
  where source_id is not null;
