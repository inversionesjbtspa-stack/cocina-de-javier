import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { buildBankImportPreview, parseHrBankSourceFile } from "@/lib/hr/bank-tef";
import { createAdminClient } from "@/lib/supabase/admin";

type EmployeeRow = {
  full_name: string;
  id: string;
  rut: string;
  status: string;
  hr_employee_bank_accounts?: Array<{
    account_number: string | null;
    bank_code: string | null;
    glosa_tef?: string | null;
    account_holder_name: string | null;
    account_holder_rut: string | null;
    payment_email: string | null;
    real_owner_name?: string | null;
  }>;
};

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const form = await request.formData();
  const file = form.get("bankFile");
  const mode = String(form.get("mode") ?? "preview");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "hr_bank_file_required" }, { status: 422 });

  const parsedFile = parseHrBankSourceFile(Buffer.from(await file.arrayBuffer()), file.name);
  const supabase = createAdminClient();
  const { data: employees } = await supabase
    .from("hr_employees")
    .select("id,rut,full_name,status,hr_employee_bank_accounts(id,account_number,bank_code,glosa_tef,account_holder_name,account_holder_rut,payment_email,real_owner_name)")
    .eq("tenant_id", ctx.membership.tenant_id);

  const employeeRows = ((employees ?? []) as EmployeeRow[]).map((employee) => {
    const bank = employee.hr_employee_bank_accounts?.[0];
    return {
      fullName: employee.full_name,
      id: employee.id,
      rut: employee.rut,
      status: employee.status,
      bankAccount: bank ? {
        accountNumber: bank.account_number,
        bankCode: bank.bank_code,
        glosaTef: bank.glosa_tef,
        holderName: bank.account_holder_name,
        holderRut: bank.account_holder_rut,
        paymentEmail: bank.payment_email,
        realOwnerName: bank.real_owner_name
      } : null
    };
  });
  const preview = buildBankImportPreview(parsedFile.rows, employeeRows);

  if (mode !== "commit") {
    return NextResponse.json({
      ok: true,
      preview,
      source: { fileName: file.name, sheetName: parsedFile.sheetName, sourceKind: parsedFile.sourceKind },
      writeMode: "preview_only"
    });
  }

  const importable = preview.rows.filter((row) => row.employeeId && (row.status === "LISTO" || row.status === "CAMBIO DE CUENTA"));
  let inserted = 0;
  let updated = 0;
  for (const row of importable) {
    const { data: existing } = await supabase
      .from("hr_employee_bank_accounts")
      .select("id")
      .eq("tenant_id", ctx.membership.tenant_id)
      .eq("employee_id", row.employeeId)
      .eq("is_primary", true)
      .maybeSingle();
    const payload = {
      account_holder_name: row.holderName || row.employeeName,
      account_holder_rut: row.holderRut,
      account_number: row.accountNumber,
      account_type: null,
      bank_code: row.bankCode,
      bank_name: row.bankName || row.bankCode,
      glosa_tef: row.glosaTef || null,
      imported_at: new Date().toISOString(),
      is_primary: true,
      payment_email: row.email || null,
      real_owner_name: row.realOwnerName || row.employeeName,
      review_status: "POR_REVISAR_TIPO_CUENTA",
      source_file: file.name,
      tenant_id: ctx.membership.tenant_id,
      updated_by: ctx.user.id,
      validation_status: "pending"
    };
    if (existing?.id) {
      await supabase.from("hr_employee_bank_accounts").update(payload).eq("id", existing.id);
      updated += 1;
    } else {
      await supabase.from("hr_employee_bank_accounts").insert({ ...payload, created_by: ctx.user.id, employee_id: row.employeeId });
      inserted += 1;
    }
  }

  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { file: file.name, inserted, preview: preview.summary, sheet: parsedFile.sheetName, updated },
    company_id: ctx.membership.company_id,
    entity_type: "hr_employee_bank_accounts",
    event_type: "hr.bank_accounts_imported_from_preview",
    tenant_id: ctx.membership.tenant_id
  });

  return NextResponse.json({ ok: true, imported: importable.length, inserted, preview, updated });
}
