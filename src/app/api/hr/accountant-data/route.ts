import { NextResponse } from "next/server";
import pg from "pg";
import { hrAccountantRowSchema, type HrAccountantRowInput } from "@/lib/hr/accountant-data-schema";
import { requireHrContext } from "@/lib/hr/auth";
import { generateAccountantWorkbook, type AccountantRow } from "@/lib/hr/payroll-parser";
import { normalizeRut } from "@/lib/hr/utils";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type AccountantDataRecord = Record<string, unknown>;

function htmlError(title: string, detail: string, action: string, status = 422) {
  return new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Inter,Arial,sans-serif;background:#faf7f2;color:#32151d;padding:40px}.panel{max-width:760px;margin:auto;background:white;border:1px solid #eadfd9;border-radius:12px;padding:28px;box-shadow:0 18px 45px rgba(43,16,24,.08)}h1{margin:0 0 12px;font-size:24px}p{line-height:1.5}.detail{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;color:#92400e}</style></head><body><main class="panel"><h1>${title}</h1><p>${detail}</p><p class="detail">${action}</p></main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status }
  );
}

async function readRowsWithPg(tenantId: string, period: string): Promise<AccountantDataRecord[] | null> {
  const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!connectionString) return null;
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    const result = await client.query(
      "select * from public.hr_accountant_data_rows where tenant_id = $1 and period = $2 order by coalesce(row_number, 0) asc",
      [tenantId, period]
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function rawValue(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" || typeof entry === "number") raw[key] = entry;
  }
  return raw;
}

function accountantPayload(body: HrAccountantRowInput, tenantId: string, userId: string, employeeId: string | null) {
  return {
    absences: body.absences,
    advances_amount: body.advances,
    aguinaldo_amount: body.aguinaldo,
    cash_allowance_amount: body.cashAllowance,
    ccaf_loan_amount: body.ccafLoan,
    compensatory_bonus_amount: body.compensatoryBonus,
    company_loan_amount: body.companyLoan,
    cost_center: body.costCenter || null,
    employee_id: employeeId,
    full_name: body.fullName,
    licenses: body.licenses,
    movilization_amount: body.movilization,
    observations: body.observations || null,
    overtime_hours: body.overtimeHours,
    period: body.period,
    phone_allowance_amount: body.phoneAllowance,
    production_bonus_amount: body.productionBonus,
    raw_row: body,
    reason: body.reason || null,
    responsibility_bonus_amount: body.responsibilityBonus,
    row_number: body.rowNumber || null,
    rut: normalizeRut(body.rut),
    sheet_name: body.sheetName,
    source_file: "manual_rrhh",
    sunday_surcharge_amount: body.sundaySurcharge,
    tenant_id: tenantId,
    updated_by: userId
  };
}

export async function GET(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const period = new URL(request.url).searchParams.get("period") ?? "2026-04";
  const supabase = createAdminClient();
  let { data, error } = await supabase
    .from("hr_accountant_data_rows")
    .select("*")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("period", period)
    .order("row_number", { ascending: true });

  if (error?.code === "PGRST205") {
    try {
      const directRows = await readRowsWithPg(ctx.membership.tenant_id, period);
      if (directRows) {
        data = directRows;
        error = null;
      }
    } catch (pgError) {
      console.error({
        error: pgError instanceof Error ? pgError.message : String(pgError),
        stage: "hr_accountant_data_pg_fallback_failed"
      });
    }
  }

  if (error) {
    const isSchemaCacheStale = error.code === "PGRST205";
    const referencesTable = error.message.includes("hr_accountant_data_rows");
    return htmlError(
      isSchemaCacheStale ? "Schema cache de Supabase desactualizado" : referencesTable ? "No se pudo leer Datos Sueldos" : "No se pudo exportar Datos Sueldos",
      isSchemaCacheStale
        ? "La tabla public.hr_accountant_data_rows existe, pero la API REST de Supabase aun no la ve en el schema cache de PostgREST."
        : referencesTable
          ? "Supabase devolvio un error al leer public.hr_accountant_data_rows aunque la tabla existe."
          : error.message,
      isSchemaCacheStale
        ? "Ejecuta en Supabase SQL Editor: notify pgrst, 'reload schema';. Para evitar depender del cache REST, configura DATABASE_URL o SUPABASE_DB_URL como variable server-side en Vercel."
        : referencesTable
          ? `Error tecnico: ${error.message}`
          : "Revisa la carga del periodo y vuelve a intentar. Si persiste, valida permisos RLS y columnas RRHH.",
      isSchemaCacheStale ? 503 : 422
    );
  }

  const [{ data: activeEmployees }, { data: paymentItems }] = await Promise.all([
    supabase
      .from("hr_employees")
      .select("id,full_name,rut,cost_center,area,status")
      .eq("tenant_id", ctx.membership.tenant_id)
      .eq("status", "activo")
      .order("full_name", { ascending: true }),
    supabase
      .from("hr_payment_items")
      .select("employee_id,period,payment_type,amount,status")
      .eq("tenant_id", ctx.membership.tenant_id)
      .eq("period", period)
  ]);

  const dataByEmployee = new Map((data ?? []).filter((row) => row.employee_id).map((row) => [String(row.employee_id), row]));
  const rows: AccountantRow[] = (activeEmployees ?? []).map((employee) => {
    const row = dataByEmployee.get(employee.id) ?? {};
    const advances = numberValue(row.advances_amount ?? row.advances)
      || (paymentItems ?? []).filter((item) => item.employee_id === employee.id && item.payment_type === "anticipo").reduce((sum, item) => sum + numberValue(item.amount), 0);
    return {
    absences: numberValue(row.absences),
    advances,
    aguinaldo: numberValue(row.aguinaldo_amount ?? row.aguinaldo),
    baseSalary: numberValue(row.base_salary),
    cashAllowance: numberValue(row.cash_allowance_amount),
    ccafLoan: numberValue(row.ccaf_loan_amount),
    compensatoryBonus: numberValue(row.compensatory_bonus_amount ?? row.compensatory_bonus),
    companyLoan: numberValue(row.company_loan_amount),
    costCenter: textValue(row.cost_center),
    discounts: numberValue(row.discounts),
    fullName: textValue(row.full_name ?? row.employee_name, employee.full_name),
    licenses: numberValue(row.licenses),
    movilization: numberValue(row.movilization_amount),
    observations: textValue(row.observations ?? row.notes),
    overtimeHours: numberValue(row.overtime_hours),
    phoneAllowance: numberValue(row.phone_allowance_amount),
    position: textValue(row.position),
    productionBonus: numberValue(row.production_bonus_amount),
    raw: rawValue(row.raw_row),
    reason: textValue(row.reason),
    responsibilityBonus: numberValue(row.responsibility_bonus_amount),
    rowNumber: numberValue(row.row_number),
    rut: textValue(row.rut, employee.rut),
    sheetName: textValue(row.sheet_name, "LIBRO REMUNERACIONES"),
    sundaySurcharge: numberValue(row.sunday_surcharge_amount)
    };
  });
  if (!rows.length) {
    return htmlError("Sin trabajadores activos para exportar", `No existen trabajadores activos para el periodo ${period}.`, "Revisa el maestro de trabajadores activos del tenant.", 404);
  }
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

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = hrAccountantRowSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "hr_accountant_row_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  const body = parsed.data;
  const supabase = createAdminClient();
  const rut = normalizeRut(body.rut);
  const employee = await supabase
    .from("hr_employees")
    .select("id")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("rut", rut)
    .maybeSingle();

  const payload = accountantPayload(body, ctx.membership.tenant_id, ctx.user.id, employee.data?.id ?? null);
  const result = await supabase.rpc("hr_upsert_accountant_data_rows", {
    p_actor_role: ctx.membership.role,
    p_company_id: ctx.membership.company_id,
    p_rows: [payload],
    p_tenant_id: ctx.membership.tenant_id,
    p_user_id: ctx.user.id
  });
  if (result.error || !result.data) return NextResponse.json({ ok: false, error: result.error?.message ?? "hr_accountant_row_save_failed" }, { status: 422 });

  return NextResponse.json({ ok: true, row: Array.isArray(result.data) ? result.data[0] : result.data });
}
