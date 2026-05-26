import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { generateAccountantWorkbook, type AccountantRow } from "@/lib/hr/payroll-parser";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const period = new URL(request.url).searchParams.get("period") ?? "2026-04";
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("hr_accountant_data_rows")
    .select("*")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("period", period)
    .order("row_number", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  const rows: AccountantRow[] = (data ?? []).map((row) => ({
    absences: Number(row.absences ?? 0),
    advances: Number(row.advances_amount ?? 0),
    aguinaldo: Number(row.aguinaldo_amount ?? 0),
    cashAllowance: Number(row.cash_allowance_amount ?? 0),
    ccafLoan: Number(row.ccaf_loan_amount ?? 0),
    compensatoryBonus: Number(row.compensatory_bonus_amount ?? 0),
    companyLoan: Number(row.company_loan_amount ?? 0),
    costCenter: row.cost_center ?? "",
    fullName: row.full_name,
    licenses: Number(row.licenses ?? 0),
    movilization: Number(row.movilization_amount ?? 0),
    observations: row.observations ?? "",
    overtimeHours: Number(row.overtime_hours ?? 0),
    phoneAllowance: Number(row.phone_allowance_amount ?? 0),
    productionBonus: Number(row.production_bonus_amount ?? 0),
    raw: row.raw_row ?? {},
    reason: row.reason ?? "",
    responsibilityBonus: Number(row.responsibility_bonus_amount ?? 0),
    rowNumber: Number(row.row_number ?? 0),
    rut: row.rut,
    sheetName: row.sheet_name ?? "LIBRO REMUNERACIONES",
    sundaySurcharge: Number(row.sunday_surcharge_amount ?? 0)
  }));
  const buffer = generateAccountantWorkbook(rows);
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { period, rows: rows.length },
    company_id: ctx.membership.company_id,
    entity_type: "hr_accountant_export",
    event_type: "hr.accountant_data_exported",
    tenant_id: ctx.membership.tenant_id
  });
  return new NextResponse(buffer, {
    headers: {
      "Content-Disposition": `attachment; filename="Datos sueldos ${period}.xlsx"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-HR-Accountant-Rows": String(rows.length)
    }
  });
}
