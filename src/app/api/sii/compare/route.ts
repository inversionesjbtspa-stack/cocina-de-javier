import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSiiRegistryFile } from "@/lib/sii/registry-parser";
import { getSiiSummaryComparisons, importSiiRegistry, importSiiSummary, toViewRow } from "@/lib/sii/registry-store";

async function context() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { auth, error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }), user: null };
  const membership = await auth.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !["owner", "admin", "finance_manager", "accountant"].includes(membership.data.role)) {
    return { auth, error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }), user: null };
  }
  return { auth, error: null, membership: membership.data, user };
}

export async function GET() {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const supabase = createAdminClient();
  const schema = await validateSiiSchema(supabase);
  if (!schema.ok) return schema.response;
  const { data, error } = await supabase
    .from("sii_purchase_registry")
    .select("*,dte_documents(monto_total)")
    .eq("tenant_id", ctx.membership.tenant_id)
    .order("fecha_emision", { ascending: false })
    .limit(5000);
  if (error) {
    return NextResponse.json({
      ok: false,
      detail: error.message,
      error: error.code === "42P01" ? "missing_sii_purchase_registry_migration" : "sii_registry_query_failed"
    }, { status: 500 });
  }
  let summaryComparisons = [];
  try {
    summaryComparisons = await getSiiSummaryComparisons(supabase, ctx.membership.tenant_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("sii_purchase_summary")) {
      return NextResponse.json({ ok: false, error: "missing_sii_purchase_summary_migration" }, { status: 500 });
    }
    throw error;
  }
  const results = await enrichSupplierEmails(supabase, ctx.membership.tenant_id, (data ?? []).map((row) => toViewRow(row as Record<string, unknown>)));
  return NextResponse.json({ ok: true, results, summary: summarize(results), summaryComparisons, summaryTotals: summarizeMonthly(summaryComparisons) });
}

export async function POST(request: Request) {
  const ctx = await context();
  if (ctx.error) return ctx.error;

  const form = await request.formData();
  const upload = form.get("file");
  if (!(upload instanceof File)) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });

  const buffer = Buffer.from(await upload.arrayBuffer());
  const parsed = parseSiiRegistryFile({ buffer, name: upload.name, type: upload.type });
  if (!parsed.rows.length && !parsed.summaryRows.length) {
    return NextResponse.json({
      ok: false,
      detail: {
        errors: parsed.errors,
        fileName: upload.name,
        format: parsed.format,
        period: parsed.period
      },
      error: "no_supported_rows",
      results: [],
      summary: summarize([])
    }, { status: 422 });
  }

  const supabase = createAdminClient();
  try {
    const schema = await validateSiiSchema(supabase);
    if (!schema.ok) return schema.response;
    const imported = parsed.rows.length ? await importSiiRegistry({
        buffer,
        companyId: ctx.membership.company_id,
        fileName: upload.name,
        rows: parsed.rows,
        supabase,
        tenantId: ctx.membership.tenant_id,
        userId: ctx.user.id
      }) : null;
    const importedSummary = parsed.summaryRows.length ? await importSiiSummary({
        buffer,
        companyId: ctx.membership.company_id,
        fileName: upload.name,
        rows: parsed.summaryRows,
        supabase,
        tenantId: ctx.membership.tenant_id,
        userId: ctx.user.id
      }) : null;
    const { data } = await supabase
      .from("sii_purchase_registry")
      .select("*,dte_documents(monto_total)")
      .eq("tenant_id", ctx.membership.tenant_id)
      .order("fecha_emision", { ascending: false })
      .limit(5000);
    const results = await enrichSupplierEmails(supabase, ctx.membership.tenant_id, (data ?? []).map((row) => toViewRow(row as Record<string, unknown>)));
    const summaryComparisons = await getSiiSummaryComparisons(supabase, ctx.membership.tenant_id);
    return NextResponse.json({
      ok: true,
      importMode: parsed.summaryRows.length && !parsed.rows.length ? "summary" : "detail",
      imported: imported?.summary ?? null,
      importErrors: imported?.rowErrors ?? [],
      importedSummary: importedSummary?.summary ?? null,
      results,
      summary: summarize(results),
      summaryComparisons,
      summaryTotals: summarizeMonthly(summaryComparisons)
    });
  } catch (cause) {
    const technical = technicalError(cause, {
      fileName: upload.name,
      format: parsed.format,
      parsedRows: parsed.rows.length,
      sampleRow: parsed.rows[0] ?? parsed.summaryRows[0] ?? null,
      stage: "sii_import"
    });
    logSiiError(technical);
    const message = technical.message;
    const error = message.includes("sii_purchase_registry")
      ? "missing_sii_purchase_registry_migration"
      : message.includes("sii_purchase_summary")
        ? "missing_sii_purchase_summary_migration"
        : message;
    return NextResponse.json({
      ok: false,
      detail: technical,
      error
    }, { status: 500 });
  }
}

async function validateSiiSchema(supabase: ReturnType<typeof createAdminClient>) {
  const checks = [
    {
      columns: "id,periodo,rut_emisor,tipo_dte,folio,monto_total,estado_xml,proveedor",
      table: "sii_purchase_registry"
    },
    {
      columns: "id,periodo,rut_empresa,tipo_documento,cantidad_documentos_sii,monto_total_sii",
      table: "sii_purchase_summary"
    }
  ];
  for (const check of checks) {
    const { error } = await supabase.from(check.table).select(check.columns).limit(1);
    if (error) {
      const detail = technicalError(error, {
        actionRecommended: `Aplicar migraciones SII pendientes. Tabla/columnas esperadas: ${check.table}(${check.columns}).`,
        columns: check.columns,
        stage: "validate_sii_schema",
        table: check.table
      });
      logSiiError(detail);
      return {
        ok: false as const,
        response: NextResponse.json({
          ok: false,
          detail,
          error: detail.code === "42P01"
            ? `missing_${check.table}_migration`
            : detail.code === "42703"
              ? `missing_${check.table}_column`
              : "sii_schema_validation_failed"
        }, { status: 500 })
      };
    }
  }
  return { ok: true as const };
}

function technicalError(cause: unknown, context: Record<string, unknown>) {
  const record = typeof cause === "object" && cause !== null ? cause as Record<string, unknown> : {};
  const message = cause instanceof Error ? cause.message : String(record.message ?? cause ?? "unknown_import_error");
  return {
    actionRecommended: context.actionRecommended ?? recommendedAction(String(record.code ?? ""), message),
    code: String(record.code ?? "") || null,
    column: String(record.column ?? "") || inferColumn(message),
    constraint: String(record.constraint ?? "") || inferConstraint(message),
    detail: String(record.details ?? record.detail ?? "") || null,
    fileName: context.fileName ?? null,
    format: context.format ?? null,
    hint: String(record.hint ?? "") || null,
    message,
    payload: context.sampleRow ?? context.payload ?? null,
    rowNumber: typeof context.sampleRow === "object" && context.sampleRow && "rowNumber" in context.sampleRow ? (context.sampleRow as { rowNumber?: number }).rowNumber ?? null : null,
    stack: cause instanceof Error ? cause.stack ?? null : null,
    stage: String(record.stage ?? context.stage ?? "unknown"),
    table: String(context.table ?? inferTable(message)) || null
  };
}

function logSiiError(detail: ReturnType<typeof technicalError>) {
  console.error({
    error: detail.message,
    payload: detail.payload,
    rowNumber: detail.rowNumber,
    stack: detail.stack,
    stage: detail.stage,
    table: detail.table
  });
}

function inferTable(message: string) {
  return message.match(/relation "([^"]+)"/)?.[1] ?? message.match(/table "([^"]+)"/)?.[1] ?? "";
}

function inferColumn(message: string) {
  return message.match(/column "([^"]+)"/)?.[1] ?? "";
}

function inferConstraint(message: string) {
  return message.match(/constraint "([^"]+)"/)?.[1] ?? "";
}

function recommendedAction(code: string, message: string) {
  if (code === "42P01" || message.includes("relation") && message.includes("does not exist")) return "Aplicar migraciones SII pendientes en Supabase SQL Editor.";
  if (code === "42703" || message.includes("column") && message.includes("does not exist")) return "Aplicar migracion correctiva de columnas SII.";
  if (code === "23505" || message.includes("duplicate key")) return "Revisar duplicados internos del archivo; el importador intenta continuar por fila.";
  if (code === "22P02" || message.includes("invalid input syntax")) return "Revisar la fila indicada: tipo de dato incompatible con la columna.";
  if (code === "42501" || message.includes("permission denied")) return "Revisar policies/RLS o service role en Vercel.";
  return "Revisar detalle tecnico y logs Vercel del endpoint /api/sii/compare.";
}

function summarize(results: ReturnType<typeof toViewRow>[]) {
  const missing = results.filter((row) => row.estadoXml === "falta_xml");
  const providers = new Set(missing.map((row) => row.rutEmisor));
  return {
    diferenciasMonto: results.filter((row) => row.estadoXml === "diferencia_monto").length,
    documentosResueltos: results.filter((row) => row.claimStatus === "resuelto").length,
    faltanXml: missing.length,
    montoSinXml: missing.reduce((sum, row) => sum + row.montoTotal, 0),
    proveedoresAReclamar: providers.size,
    total: results.length,
    xmlRecibidos: results.filter((row) => row.estadoXml === "xml_recibido").length
  };
}

async function enrichSupplierEmails(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  rows: ReturnType<typeof toViewRow>[]
) {
  const ruts = [...new Set(rows.map((row) => row.rutEmisor).filter(Boolean))];
  if (!ruts.length) return rows;
  const { data } = await supabase
    .from("suppliers")
    .select("rut,email,payment_email,commercial_email")
    .eq("tenant_id", tenantId)
    .in("rut", ruts)
    .limit(5000);
  const emailByRut = new Map((data ?? []).map((row) => [
    String(row.rut),
    String(row.payment_email ?? row.email ?? row.commercial_email ?? "") || null
  ]));
  return rows.map((row) => ({ ...row, supplierEmail: emailByRut.get(row.rutEmisor) ?? null }));
}

function summarizeMonthly(results: Awaited<ReturnType<typeof getSiiSummaryComparisons>>) {
  return {
    diferenciaDocumentos: results.reduce((sum, row) => sum + row.diferenciaDocumentos, 0),
    diferenciaMonto: results.reduce((sum, row) => sum + row.diferenciaMonto, 0),
    documentosSii: results.reduce((sum, row) => sum + row.documentosSii, 0),
    documentosXml: results.reduce((sum, row) => sum + row.documentosXml, 0),
    tiposConDiferencias: results.filter((row) => row.estado !== "ok").length
  };
}
