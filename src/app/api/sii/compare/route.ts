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
  const results = (data ?? []).map((row) => toViewRow(row as Record<string, unknown>));
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
    const results = (data ?? []).map((row) => toViewRow(row as Record<string, unknown>));
    const summaryComparisons = await getSiiSummaryComparisons(supabase, ctx.membership.tenant_id);
    return NextResponse.json({
      ok: true,
      importMode: parsed.summaryRows.length && !parsed.rows.length ? "summary" : "detail",
      imported: imported?.summary ?? null,
      importedSummary: importedSummary?.summary ?? null,
      results,
      summary: summarize(results),
      summaryComparisons,
      summaryTotals: summarizeMonthly(summaryComparisons)
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown_import_error";
    const error = message.includes("sii_purchase_registry")
      ? "missing_sii_purchase_registry_migration"
      : message.includes("sii_purchase_summary")
        ? "missing_sii_purchase_summary_migration"
        : message;
    return NextResponse.json({
      ok: false,
      detail: {
        fileName: upload.name,
        format: parsed.format,
        message,
        period: parsed.period,
        registryRows: parsed.rows.length,
        summaryRows: parsed.summaryRows.length
      },
      error
    }, { status: 500 });
  }
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

function summarizeMonthly(results: Awaited<ReturnType<typeof getSiiSummaryComparisons>>) {
  return {
    diferenciaDocumentos: results.reduce((sum, row) => sum + row.diferenciaDocumentos, 0),
    diferenciaMonto: results.reduce((sum, row) => sum + row.diferenciaMonto, 0),
    documentosSii: results.reduce((sum, row) => sum + row.documentosSii, 0),
    documentosXml: results.reduce((sum, row) => sum + row.documentosXml, 0),
    tiposConDiferencias: results.filter((row) => row.estado !== "ok").length
  };
}
