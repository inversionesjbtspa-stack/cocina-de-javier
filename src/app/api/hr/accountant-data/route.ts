import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { generateAccountantWorkbook, type AccountantRow } from "@/lib/hr/payroll-parser";
import { createAdminClient } from "@/lib/supabase/admin";

function htmlError(title: string, detail: string, action: string, status = 422) {
  return new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Inter,Arial,sans-serif;background:#faf7f2;color:#32151d;padding:40px}.panel{max-width:760px;margin:auto;background:white;border:1px solid #eadfd9;border-radius:12px;padding:28px;box-shadow:0 18px 45px rgba(43,16,24,.08)}h1{margin:0 0 12px;font-size:24px}p{line-height:1.5}.detail{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;color:#92400e}</style></head><body><main class="panel"><h1>${title}</h1><p>${detail}</p><p class="detail">${action}</p></main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status }
  );
}

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
  if (error) {
    const isMissingTable = error.code === "PGRST205" || error.message.includes("hr_accountant_data_rows");
    return htmlError(
      isMissingTable ? "Migracion RRHH pendiente" : "No se pudo exportar Datos Sueldos",
      isMissingTable
        ? "Supabase produccion no tiene la tabla public.hr_accountant_data_rows requerida para exportar Datos Sueldos."
        : error.message,
      isMissingTable
        ? "Ejecuta la migracion 202605150022_hr_schema_repair.sql en Supabase SQL Editor y vuelve a intentar la descarga."
        : "Revisa la carga del periodo y vuelve a intentar. Si persiste, valida permisos RLS y columnas RRHH.",
      isMissingTable ? 503 : 422
    );
  }
  const rows: AccountantRow[] = (data ?? []).map((row) => ({
    absences: Number(row.absences ?? 0),
    advances: Number(row.advances_amount ?? row.advances ?? 0),
    aguinaldo: Number(row.aguinaldo_amount ?? row.aguinaldo ?? 0),
    cashAllowance: Number(row.cash_allowance_amount ?? 0),
    ccafLoan: Number(row.ccaf_loan_amount ?? 0),
    compensatoryBonus: Number(row.compensatory_bonus_amount ?? row.compensatory_bonus ?? 0),
    companyLoan: Number(row.company_loan_amount ?? 0),
    costCenter: row.cost_center ?? "",
    fullName: row.full_name ?? row.employee_name ?? "",
    licenses: Number(row.licenses ?? 0),
    movilization: Number(row.movilization_amount ?? 0),
    observations: row.observations ?? row.notes ?? "",
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
