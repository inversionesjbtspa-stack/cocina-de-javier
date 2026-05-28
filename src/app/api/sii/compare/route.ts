import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSiiRegistryFile } from "@/lib/sii/registry-parser";
import type { SiiRegistryRow } from "@/lib/sii/registry-parser";
import { getSiiSummaryComparisons, importSiiRegistry, importSiiSummary, toViewRow } from "@/lib/sii/registry-store";

const SII_REGISTRY_WITH_XML_SELECT =
  "*,dte_documents!sii_purchase_registry_dte_document_id_fkey(monto_total)";

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
    .select(SII_REGISTRY_WITH_XML_SELECT)
    .eq("tenant_id", ctx.membership.tenant_id)
    .order("fecha_emision", { ascending: false })
    .limit(5000);
  if (error) {
    const detail = technicalError(error, {
      query: SII_REGISTRY_WITH_XML_SELECT,
      stage: "select_sii_purchase_registry",
      table: "sii_purchase_registry"
    });
    return NextResponse.json({
      ok: false,
      detail,
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

  let uploadName = "";
  let parsedFormat = "unknown";
  let parsedPeriod = "";
  let parsedRows = 0;
  let parsedSummaryRows = 0;
  let sampleRow: unknown = null;
  try {
    const form = await runStage("parse_file", async () => request.formData(), { fileName: uploadName });
    const upload = form.get("file");
    if (!(upload instanceof File)) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
    uploadName = upload.name;

    const buffer = await runStage("parse_file", async () => Buffer.from(await upload.arrayBuffer()), { fileName: uploadName });
    const parsed = await runStage("parse_file", async () => parseSiiRegistryFile({ buffer, name: upload.name, type: upload.type }), { fileName: uploadName });
    parsedFormat = parsed.format;
    parsedPeriod = parsed.period;
    parsedRows = parsed.rows.length;
    parsedSummaryRows = parsed.summaryRows.length;
    sampleRow = parsed.rows[0] ?? parsed.summaryRows[0] ?? null;

    if (!parsed.rows.length && !parsed.summaryRows.length) {
      return NextResponse.json({
        ok: false,
        detail: {
          errors: parsed.errors,
          fileName: upload.name,
          format: parsed.format,
          period: parsed.period,
          stage: "parse_file"
        },
        error: "no_supported_rows",
        results: [],
        summary: summarize([])
      }, { status: 422 });
    }

    const validated = await runStage("validate_rows", async () => validateRows(parsed.rows), {
      fileName: uploadName,
      sampleRow
    });
    const normalizedRows = await runStage("normalize_rows", async () => normalizeRows(validated.validRows), {
      fileName: uploadName,
      sampleRow: validated.validRows[0] ?? sampleRow
    });

    const supabase = createAdminClient();
    const schema = await runStage("validate_schema", async () => validateSiiSchema(supabase), { fileName: uploadName });
    if (!schema.ok) return schema.response;

    const imported = normalizedRows.length ? await runStage("upsert_sii_purchase_registry", async () => importSiiRegistry({
        buffer,
        companyId: ctx.membership.company_id,
        fileName: upload.name,
        rows: normalizedRows,
        supabase,
        tenantId: ctx.membership.tenant_id,
        userId: ctx.user.id
      }), {
        fileName: uploadName,
        payload: normalizedRows[0] ?? null,
        rowNumber: normalizedRows[0]?.rowNumber ?? null
      }) : null;
    const importedSummary = parsed.summaryRows.length ? await runStage("upsert_sii_purchase_summary", async () => importSiiSummary({
        buffer,
        companyId: ctx.membership.company_id,
        fileName: upload.name,
        rows: parsed.summaryRows,
        supabase,
        tenantId: ctx.membership.tenant_id,
        userId: ctx.user.id
      }), {
        fileName: uploadName,
        payload: parsed.summaryRows[0] ?? null,
        rowNumber: parsed.summaryRows[0]?.rowNumber ?? null
      }) : null;
    const { data, error: resultError } = await runStage("calculate_results", async () => supabase
      .from("sii_purchase_registry")
      .select(SII_REGISTRY_WITH_XML_SELECT)
      .eq("tenant_id", ctx.membership.tenant_id)
      .order("fecha_emision", { ascending: false })
      .limit(5000), { fileName: uploadName });
    if (resultError) throw { ...resultError, stage: "calculate_results" };
    const mapped = (data ?? []).map((row) => toViewRow(row as Record<string, unknown>));
    const results = await runStage("calculate_results", async () => enrichSupplierEmails(supabase, ctx.membership.tenant_id, mapped), { fileName: uploadName });
    const summaryComparisons = await runStage("calculate_results", async () => getSiiSummaryComparisons(supabase, ctx.membership.tenant_id), { fileName: uploadName });
    const responsePayload = {
      ok: true,
      importMode: parsed.summaryRows.length && !parsed.rows.length ? "summary" : "detail",
      imported: imported ? {
        ...imported.summary,
        erroresFilasInvalidas: validated.invalidRows.length
      } : null,
      importErrors: [...validated.invalidRows, ...(imported?.rowErrors ?? [])],
      importedSummary: importedSummary?.summary ?? null,
      results,
      summary: summarize(results),
      summaryComparisons,
      summaryTotals: summarizeMonthly(summaryComparisons)
    };
    return await runStage("return_ui_response", async () => NextResponse.json(responsePayload), {
      fileName: uploadName,
      payload: {
        imported: responsePayload.imported,
        results: responsePayload.results.length,
        summary: responsePayload.summary
      }
    });
  } catch (cause) {
    const technical = technicalError(cause, {
      fileName: uploadName,
      format: parsedFormat,
      parsedRows,
      sampleRow,
      stage: "sii_import",
      summaryRows: parsedSummaryRows,
      period: parsedPeriod
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

async function runStage<T>(stage: string, task: () => Promise<T> | T, context: Record<string, unknown>) {
  try {
    return await task();
  } catch (error) {
    if (typeof error === "object" && error !== null) throw { ...error as Record<string, unknown>, stage, stageContext: context };
    throw { message: String(error), stage, stageContext: context };
  }
}

function validateRows(rows: SiiRegistryRow[]) {
  const invalidRows = [];
  const validRows = [];
  for (const row of rows) {
    const missing = [];
    if (!row.rutProveedor) missing.push("rut_emisor");
    if (!row.tipoDte) missing.push("tipo_dte");
    if (!row.folio) missing.push("folio");
    if (!Number.isFinite(row.montoTotal)) missing.push("monto_total");
    if (missing.length) {
      invalidRows.push({
        code: "invalid_sii_row",
        column: missing.join(","),
        constraint: null,
        key: `${row.rutProveedor}:${row.tipoDte}:${row.folio}`,
        message: `Fila SII invalida: faltan ${missing.join(", ")}`,
        payload: row,
        rowNumber: row.rowNumber,
        table: "sii_purchase_registry"
      });
    } else {
      validRows.push(row);
    }
  }
  return { invalidRows, validRows };
}

function normalizeRows(rows: SiiRegistryRow[]) {
  return rows.map((row) => ({
    ...row,
    folio: String(row.folio).trim(),
    iva: Number(row.iva || 0),
    montoNeto: Number(row.montoNeto || 0),
    montoTotal: Number(row.montoTotal || 0),
    rutProveedor: String(row.rutProveedor).replace(/\./g, "").replace(/\s+/g, "").toUpperCase(),
    tipoDte: String(row.tipoDte).trim()
  }));
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
  const code = String(record.code ?? "") || null;
  const ambiguousSiiDte =
    code === "PGRST201" &&
    String(context.table ?? "").includes("sii_purchase_registry") &&
    (message.includes("dte_documents") || String(record.details ?? record.detail ?? "").includes("dte_documents"));
  return {
    actionRecommended: context.actionRecommended ?? recommendedAction(String(code ?? ""), message),
    ambiguousRelations: ambiguousSiiDte
      ? [
          "dte_documents!dte_documents_sii_purchase_registry_id_fkey",
          "dte_documents!sii_purchase_registry_provisional_dte_document_id_fkey",
          "dte_documents!sii_purchase_registry_dte_document_id_fkey"
        ]
      : null,
    code,
    column: String(record.column ?? "") || inferColumn(message),
    constraint: String(record.constraint ?? "") || inferConstraint(message),
    detail: String(record.details ?? record.detail ?? "") || null,
    fileName: context.fileName ?? null,
    format: context.format ?? null,
    hint: String(record.hint ?? "") || null,
    message,
    payload: context.sampleRow ?? context.payload ?? null,
    query: context.query ?? null,
    rowNumber: typeof context.sampleRow === "object" && context.sampleRow && "rowNumber" in context.sampleRow ? (context.sampleRow as { rowNumber?: number }).rowNumber ?? null : null,
    stack: cause instanceof Error ? cause.stack ?? null : null,
    stage: String(record.stage ?? context.stage ?? "unknown"),
    suggestedFk: ambiguousSiiDte ? "sii_purchase_registry_dte_document_id_fkey" : null,
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
  if (code === "PGRST201" || message.includes("more than one relationship")) return "Especificar la FK en el embed Supabase. Para Control SII vs XML usar dte_documents!sii_purchase_registry_dte_document_id_fkey(...).";
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
