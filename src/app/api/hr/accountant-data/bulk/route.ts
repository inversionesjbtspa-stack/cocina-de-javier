import { NextResponse } from "next/server";
import { z } from "zod";
import { hrAccountantRowSchema } from "@/lib/hr/accountant-data-schema";
import { requireHrContext } from "@/lib/hr/auth";
import { normalizeRut } from "@/lib/hr/utils";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bulkSchema = z.object({
  rows: z.array(hrAccountantRowSchema).min(1).max(150)
});

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = bulkSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "hr_accountant_bulk_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });

  const supabase = createAdminClient();
  const ruts = parsed.data.rows.map((row) => normalizeRut(row.rut));
  const employees = await supabase
    .from("hr_employees")
    .select("id,rut")
    .eq("tenant_id", ctx.membership.tenant_id)
    .in("rut", ruts);
  const employeeByRut = new Map((employees.data ?? []).map((employee) => [normalizeRut(employee.rut), employee.id]));

  const rows = parsed.data.rows.map((row) => ({
    absences: row.absences,
    advances_amount: row.advances,
    aguinaldo_amount: row.aguinaldo,
    cash_allowance_amount: row.cashAllowance,
    ccaf_loan_amount: row.ccafLoan,
    compensatory_bonus_amount: row.compensatoryBonus,
    company_loan_amount: row.companyLoan,
    cost_center: row.costCenter || null,
    employee_id: employeeByRut.get(normalizeRut(row.rut)) ?? null,
    full_name: row.fullName,
    licenses: row.licenses,
    movilization_amount: row.movilization,
    observations: row.observations || null,
    overtime_hours: row.overtimeHours,
    period: row.period,
    phone_allowance_amount: row.phoneAllowance,
    production_bonus_amount: row.productionBonus,
    raw_row: row,
    reason: row.reason || null,
    responsibility_bonus_amount: row.responsibilityBonus,
    row_number: row.rowNumber || null,
    rut: normalizeRut(row.rut),
    sheet_name: row.sheetName,
    source_file: "manual_rrhh_bulk",
    sunday_surcharge_amount: row.sundaySurcharge,
    tenant_id: ctx.membership.tenant_id,
    updated_by: ctx.user.id
  }));

  const result = await supabase.rpc("hr_upsert_accountant_data_rows", {
    p_actor_role: ctx.membership.role,
    p_company_id: ctx.membership.company_id,
    p_rows: rows,
    p_tenant_id: ctx.membership.tenant_id,
    p_user_id: ctx.user.id
  });
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 422 });
  const saved = Array.isArray(result.data) ? result.data.length : rows.length;
  const auditEntries = Array.isArray(result.data) ? result.data.reduce((sum, row) => sum + Number(row.audit_entries ?? 0), 0) : 0;
  return NextResponse.json({ ok: true, auditEntries, saved });
}
