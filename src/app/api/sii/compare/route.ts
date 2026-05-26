import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSiiRegistryFile } from "@/lib/sii/registry-parser";
import { importSiiRegistry, toViewRow } from "@/lib/sii/registry-store";

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
    return NextResponse.json({ ok: false, error: error.code === "42P01" ? "missing_sii_purchase_registry_migration" : error.message }, { status: 500 });
  }
  const results = (data ?? []).map((row) => toViewRow(row as Record<string, unknown>));
  return NextResponse.json({ ok: true, results, summary: summarize(results) });
}

export async function POST(request: Request) {
  const ctx = await context();
  if (ctx.error) return ctx.error;

  const form = await request.formData();
  const upload = form.get("file");
  if (!(upload instanceof File)) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });

  const buffer = Buffer.from(await upload.arrayBuffer());
  const parsed = parseSiiRegistryFile({ buffer, name: upload.name, type: upload.type });
  if (parsed.isSummary || !parsed.rows.length) {
    return NextResponse.json({ ok: false, error: "summary_file_not_supported", errors: parsed.errors, results: [], summary: summarize([]) }, { status: 422 });
  }

  const supabase = createAdminClient();
  try {
    const imported = await importSiiRegistry({
      buffer,
      companyId: ctx.membership.company_id,
      fileName: upload.name,
      rows: parsed.rows,
      supabase,
      tenantId: ctx.membership.tenant_id,
      userId: ctx.user.id
    });
    const { data } = await supabase
      .from("sii_purchase_registry")
      .select("*,dte_documents(monto_total)")
      .eq("tenant_id", ctx.membership.tenant_id)
      .order("fecha_emision", { ascending: false })
      .limit(5000);
    const results = (data ?? []).map((row) => toViewRow(row as Record<string, unknown>));
    return NextResponse.json({ ok: true, imported: imported.summary, results, summary: summarize(results) });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown_import_error";
    return NextResponse.json({ ok: false, error: message.includes("sii_purchase_registry") ? "missing_sii_purchase_registry_migration" : message }, { status: 500 });
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
