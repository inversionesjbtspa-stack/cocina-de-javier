import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { parseHrBankWorkbook } from "@/lib/hr/bank-import-parser";
import { normalizeRut } from "@/lib/hr/utils";
import { createAdminClient } from "@/lib/supabase/admin";

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function glosaName(value: string) {
  return normalizeName(value.replace(/^REM\s+[A-Z]+\s+/i, ""));
}

function accountTypeFromCode(bankCode: string) {
  return bankCode === "875" ? "Cuenta Mercado Pago" : "Cuenta corriente";
}

type EmployeeRow = {
  full_name: string;
  id: string;
  payment_enabled: boolean;
  rut: string;
  status: string;
};

type BankRow = {
  account_number: string | null;
  id: string;
};

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const form = await request.formData();
  const file = form.get("bankFile");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "hr_bank_file_required" }, { status: 422 });

  const rows = parseHrBankWorkbook(Buffer.from(await file.arrayBuffer()));
  const supabase = createAdminClient();
  const { data: employees } = await supabase
    .from("hr_employees")
    .select("id,rut,full_name,status,payment_enabled")
    .eq("tenant_id", ctx.membership.tenant_id);

  const employeeRows = (employees ?? []) as EmployeeRow[];
  const byRut = new Map(employeeRows.map((employee) => [normalizeRut(employee.rut), employee]));
  const byName = new Map(employeeRows.map((employee) => [normalizeName(employee.full_name), employee]));

  let updated = 0;
  let inserted = 0;
  let enabled = 0;
  const unmatched: Array<{ glosaTef: string; holderName: string; holderRut: string; rowNumber: number }> = [];
  const incomplete: Array<{ employeeName: string; missing: string[]; rowNumber: number }> = [];

  for (const row of rows) {
    const employee =
      (row.holderRut ? byRut.get(row.holderRut) : undefined) ??
      byName.get(normalizeName(row.holderName)) ??
      byName.get(glosaName(row.glosaTef)) ??
      employeeRows.find((candidate) => glosaName(row.glosaTef).includes(normalizeName(candidate.full_name)) || normalizeName(candidate.full_name).includes(glosaName(row.glosaTef)));

    if (!employee) {
      unmatched.push({ glosaTef: row.glosaTef, holderName: row.holderName, holderRut: row.holderRut, rowNumber: row.rowNumber });
      continue;
    }

    const missing = [];
    if (!row.bankCode) missing.push("codigo banco");
    if (!row.accountNumber) missing.push("numero cuenta");
    if (!row.email) missing.push("email pago");
    if (missing.length) incomplete.push({ employeeName: employee.full_name, missing, rowNumber: row.rowNumber });
    const valid = Boolean(row.bankCode && row.accountNumber);
    const { data: existing } = await supabase
      .from("hr_employee_bank_accounts")
      .select("id,account_number")
      .eq("tenant_id", ctx.membership.tenant_id)
      .eq("employee_id", employee.id)
      .eq("is_primary", true)
      .maybeSingle();
    const payload = {
      account_holder_name: row.holderName || employee.full_name,
      account_holder_rut: row.holderRut || employee.rut,
      account_number: row.accountNumber,
      account_type: accountTypeFromCode(row.bankCode),
      bank_code: row.bankCode,
      bank_name: row.bankName || row.bankCode,
      glosa_tef: row.glosaTef,
      imported_at: new Date().toISOString(),
      is_primary: true,
      payment_email: row.email || null,
      source_file: file.name,
      tenant_id: ctx.membership.tenant_id,
      updated_by: ctx.user.id,
      validation_status: valid ? "valid" : "pending"
    };
    if ((existing as BankRow | null)?.id) {
      await supabase.from("hr_employee_bank_accounts").update(payload).eq("id", (existing as BankRow).id);
      updated += 1;
    } else {
      await supabase.from("hr_employee_bank_accounts").insert({ ...payload, created_by: ctx.user.id, employee_id: employee.id });
      inserted += 1;
    }
    await supabase.from("hr_employees").update({
      glosa_tef: row.glosaTef,
      payment_enabled: employee.status === "activo" && valid,
      payment_enabled_at: employee.status === "activo" && valid && !employee.payment_enabled ? new Date().toISOString() : undefined,
      payment_enabled_by: employee.status === "activo" && valid && !employee.payment_enabled ? ctx.user.id : undefined,
      updated_by: ctx.user.id
    }).eq("id", employee.id);
    if (employee.status === "activo" && valid && !employee.payment_enabled) enabled += 1;
  }

  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { enabled, file: file.name, imported: rows.length, incomplete: incomplete.length, inserted, unmatched: unmatched.length, updated },
    company_id: ctx.membership.company_id,
    entity_type: "hr_employee_bank_accounts",
    event_type: "hr.bank_accounts_imported",
    tenant_id: ctx.membership.tenant_id
  });

  return NextResponse.json({ ok: true, enabled, imported: rows.length, incomplete, inserted, unmatched, updated });
}
