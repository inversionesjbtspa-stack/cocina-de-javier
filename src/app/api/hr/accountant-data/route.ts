import { NextResponse } from "next/server";
import pg from "pg";
import { requireHrContext } from "@/lib/hr/auth";
import { generateAccountantWorkbook, type AccountantRow } from "@/lib/hr/payroll-parser";
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

  if (!data?.length) {
    return htmlError(
      "Sin datos de sueldos para exportar",
      `No existen filas en Datos Sueldos para el periodo ${period}.`,
      "Carga o importa el archivo Datos Sueldos del periodo desde Recursos Humanos y vuelve a exportar.",
      404
    );
  }

  const rows: AccountantRow[] = (data as AccountantDataRecord[]).map((row) => ({
    absences: numberValue(row.absences),
    advances: numberValue(row.advances_amount ?? row.advances),
    aguinaldo: numberValue(row.aguinaldo_amount ?? row.aguinaldo),
    cashAllowance: numberValue(row.cash_allowance_amount),
    ccafLoan: numberValue(row.ccaf_loan_amount),
    compensatoryBonus: numberValue(row.compensatory_bonus_amount ?? row.compensatory_bonus),
    companyLoan: numberValue(row.company_loan_amount),
    costCenter: textValue(row.cost_center),
    fullName: textValue(row.full_name ?? row.employee_name),
    licenses: numberValue(row.licenses),
    movilization: numberValue(row.movilization_amount),
    observations: textValue(row.observations ?? row.notes),
    overtimeHours: numberValue(row.overtime_hours),
    phoneAllowance: numberValue(row.phone_allowance_amount),
    productionBonus: numberValue(row.production_bonus_amount),
    raw: rawValue(row.raw_row),
    reason: textValue(row.reason),
    responsibilityBonus: numberValue(row.responsibility_bonus_amount),
    rowNumber: numberValue(row.row_number),
    rut: textValue(row.rut),
    sheetName: textValue(row.sheet_name, "LIBRO REMUNERACIONES"),
    sundaySurcharge: numberValue(row.sunday_surcharge_amount)
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
