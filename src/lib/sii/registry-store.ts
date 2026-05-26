import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiiRegistryRow, SiiSummaryRow } from "@/lib/sii/registry-parser";

type DteDocumentRow = {
  id: string;
  tipo_dte: string;
  folio: string;
  rut_emisor: string;
  monto_total: number;
  gmail_message_id: string | null;
  gmail_received_at: string | null;
};

export type SiiImportRowError = {
  rowNumber: number;
  key: string;
  message: string;
  code: string | null;
  table: string;
  column: string | null;
  constraint: string | null;
  payload: Record<string, unknown>;
};

export type SiiRegistryViewRow = {
  id: string;
  periodo: string;
  rutEmisor: string;
  razonSocial: string;
  supplierEmail: string | null;
  tipoDte: string;
  folio: string;
  fechaEmision: string;
  montoNeto: number;
  iva: number;
  montoTotal: number;
  montoXml: number;
  estadoXml: "xml_recibido" | "falta_xml" | "diferencia_monto" | "pendiente_revision";
  claimStatus: "pendiente" | "copiado" | "enviado_manualmente" | "resuelto" | "ignorado";
  xmlReceivedAt: string | null;
  dteDocumentId: string | null;
  gmailMessageId: string | null;
  sourceFile: string | null;
  lastImportedAt: string;
};

export type SiiSummaryComparisonRow = {
  id: string;
  periodo: string;
  rutEmpresa: string;
  tipoDocumento: string;
  documentosSii: number;
  documentosXml: number;
  diferenciaDocumentos: number;
  montoNetoSii: number;
  ivaSii: number;
  montoTotalSii: number;
  montoXml: number;
  diferenciaMonto: number;
  estado: "ok" | "faltan_documentos" | "diferencia_monto" | "requiere_detalle";
  accionRecomendada: string;
  sourceFile: string | null;
  importedAt: string;
};

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function estadoFor(row: SiiRegistryRow, doc: DteDocumentRow | null) {
  if (!doc) return "falta_xml";
  return Math.abs(Number(doc.monto_total ?? 0) - row.montoTotal) > 10 ? "diferencia_monto" : "xml_recibido";
}

function errorField(error: unknown, field: string) {
  return typeof error === "object" && error !== null && field in error ? String((error as Record<string, unknown>)[field] ?? "") : "";
}

function toRowError(error: unknown, rowNumber: number, key: string, payload: Record<string, unknown>): SiiImportRowError {
  return {
    code: errorField(error, "code") || null,
    column: errorField(error, "column") || null,
    constraint: errorField(error, "constraint") || null,
    key,
    message: errorField(error, "message") || (error instanceof Error ? error.message : String(error)),
    payload,
    rowNumber,
    table: "sii_purchase_registry"
  };
}

export async function importSiiRegistry({
  buffer,
  companyId,
  fileName,
  rows,
  supabase,
  tenantId,
  userId
}: {
  buffer: Buffer;
  companyId: string | null;
  fileName: string;
  rows: SiiRegistryRow[];
  supabase: SupabaseClient;
  tenantId: string;
  userId: string;
}) {
  const sourceHash = sha256(buffer);
  const uniqueRows = [...new Map(rows.map((row) => [`${row.rutProveedor}:${row.tipoDte}:${row.folio}`, row])).values()];
  const keys = uniqueRows.map((row) => ({
    folio: row.folio,
    rut: row.rutProveedor,
    tipo: row.tipoDte
  }));
  const rutList = [...new Set(keys.map((key) => key.rut))];
  const folios = [...new Set(keys.map((key) => key.folio))];
  const docsResult = rutList.length && folios.length
    ? await supabase
      .from("dte_documents")
      .select("id,tipo_dte,folio,rut_emisor,monto_total,gmail_message_id,gmail_received_at")
      .eq("tenant_id", tenantId)
      .in("rut_emisor", rutList)
      .in("folio", folios)
      .limit(5000)
    : { data: [] as DteDocumentRow[], error: null };
  if (docsResult.error) throw { ...docsResult.error, stage: "select_dte_documents" };
  const docsRows = docsResult.data ?? [];
  const docMap = new Map(docsRows.map((doc) => [`${doc.rut_emisor}:${doc.tipo_dte}:${doc.folio}`, doc as DteDocumentRow]));
  const beforeResult = keys.length
    ? await supabase
      .from("sii_purchase_registry")
      .select("id,rut_emisor,tipo_dte,folio")
      .eq("tenant_id", tenantId)
      .in("rut_emisor", rutList)
      .in("folio", folios)
      .limit(5000)
    : { data: [] as Array<{ id: string; rut_emisor: string; tipo_dte: string; folio: string }>, error: null };
  if (beforeResult.error) throw { ...beforeResult.error, stage: "select_sii_purchase_registry_existing" };
  const beforeRows = beforeResult.data ?? [];
  const existingKeys = new Set((beforeRows ?? []).map((row) => `${row.rut_emisor}:${row.tipo_dte}:${row.folio}`));
  const now = new Date().toISOString();
  const payload = uniqueRows.map((row) => {
    const doc = docMap.get(`${row.rutProveedor}:${row.tipoDte}:${row.folio}`) ?? null;
    const estadoXml = estadoFor(row, doc);
    return {
      claim_status: estadoXml === "xml_recibido" ? "resuelto" : "pendiente",
      company_id: companyId,
      dte_document_id: doc?.id ?? null,
      estado_xml: estadoXml,
      fecha_emision: row.fecha || null,
      folio: row.folio,
      gmail_message_id: doc?.gmail_message_id ?? null,
      iva: row.iva,
      last_imported_at: now,
      monto_neto: row.montoNeto,
      monto_total: row.montoTotal,
      periodo: row.periodo,
      proveedor: row.razonSocial,
      razon_social: row.razonSocial,
      rut_emisor: row.rutProveedor,
      source_file: fileName,
      source_hash: sourceHash,
      tenant_id: tenantId,
      tipo_dte: row.tipoDte,
      xml_received_at: doc?.gmail_received_at ?? null
    };
  });
  const rowErrors: SiiImportRowError[] = [];
  const upserted: Array<{ id: string; estado_xml: string }> = [];
  for (let index = 0; index < payload.length; index += 50) {
    const chunk = payload.slice(index, index + 50);
    const { data, error } = await supabase
      .from("sii_purchase_registry")
      .upsert(chunk, { onConflict: "tenant_id,rut_emisor,tipo_dte,folio" })
      .select("id,estado_xml");
    if (!error) {
      upserted.push(...(data ?? []));
      continue;
    }
    for (const item of chunk) {
      const { data: rowData, error: rowError } = await supabase
        .from("sii_purchase_registry")
        .upsert(item, { onConflict: "tenant_id,rut_emisor,tipo_dte,folio" })
        .select("id,estado_xml");
      if (rowError) {
        const source = uniqueRows.find((row) => row.rutProveedor === item.rut_emisor && row.tipoDte === item.tipo_dte && row.folio === item.folio);
        rowErrors.push(toRowError(rowError, source?.rowNumber ?? 0, `${item.rut_emisor}:${item.tipo_dte}:${item.folio}`, item));
      } else {
        upserted.push(...(rowData ?? []));
      }
    }
  }
  const summary = {
    actualizados: payload.filter((row) => existingKeys.has(`${row.rut_emisor}:${row.tipo_dte}:${row.folio}`)).length,
    diferenciasMonto: payload.filter((row) => row.estado_xml === "diferencia_monto").length,
    duplicadosIgnorados: Math.max(0, rows.length - uniqueRows.length),
    faltanXml: payload.filter((row) => row.estado_xml === "falta_xml").length,
    leidos: rows.length,
    nuevos: payload.filter((row) => !existingKeys.has(`${row.rut_emisor}:${row.tipo_dte}:${row.folio}`)).length,
    rowErrors: rowErrors.length,
    rowsPersistidas: upserted.length,
    xmlRecibidos: payload.filter((row) => row.estado_xml === "xml_recibido").length
  };
  await supabase.from("audit_events").insert({
    actor_user_id: userId,
    after_data: { filename: fileName, source_hash: sourceHash, ...summary },
    company_id: companyId,
    entity_type: "sii_purchase_registry",
    event_type: "sii.registry_imported",
    tenant_id: tenantId
  });
  return { rowErrors, sourceHash, summary, upserted };
}

export async function importSiiSummary({
  buffer,
  companyId,
  fileName,
  rows,
  supabase,
  tenantId,
  userId
}: {
  buffer: Buffer;
  companyId: string | null;
  fileName: string;
  rows: SiiSummaryRow[];
  supabase: SupabaseClient;
  tenantId: string;
  userId: string;
}) {
  const sourceHash = sha256(buffer);
  const keys = rows.map((row) => ({
    periodo: row.periodo,
    rutEmpresa: row.rutEmpresa,
    tipoDocumento: row.tipoDocumento
  }));
  const { data: beforeRows } = keys.length
    ? await supabase
      .from("sii_purchase_summary")
      .select("id,periodo,rut_empresa,tipo_documento")
      .eq("tenant_id", tenantId)
      .in("periodo", [...new Set(keys.map((key) => key.periodo))])
      .limit(5000)
    : { data: [] as Array<{ id: string; periodo: string; rut_empresa: string; tipo_documento: string }> };
  const existingKeys = new Set((beforeRows ?? []).map((row) => `${row.periodo}:${row.rut_empresa}:${row.tipo_documento}`));
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    cantidad_documentos_sii: row.cantidadDocumentos,
    company_id: companyId,
    imported_at: now,
    iva_sii: row.iva,
    monto_neto_sii: row.montoNeto,
    monto_total_sii: row.montoTotal,
    periodo: row.periodo,
    rut_empresa: row.rutEmpresa,
    source_file: fileName,
    source_hash: sourceHash,
    tenant_id: tenantId,
    tipo_documento: row.tipoDocumento
  }));
  const { error } = await supabase
    .from("sii_purchase_summary")
    .upsert(payload, { onConflict: "tenant_id,periodo,rut_empresa,tipo_documento" });
  if (error) throw error;
  const summary = {
    actualizados: payload.filter((row) => existingKeys.has(`${row.periodo}:${row.rut_empresa}:${row.tipo_documento}`)).length,
    leidos: rows.length,
    nuevos: payload.filter((row) => !existingKeys.has(`${row.periodo}:${row.rut_empresa}:${row.tipo_documento}`)).length
  };
  await supabase.from("audit_events").insert({
    actor_user_id: userId,
    after_data: { filename: fileName, source_hash: sourceHash, ...summary },
    company_id: companyId,
    entity_type: "sii_purchase_summary",
    event_type: "sii.summary_imported",
    tenant_id: tenantId
  });
  return { sourceHash, summary };
}

export async function getSiiSummaryComparisons(supabase: SupabaseClient, tenantId: string): Promise<SiiSummaryComparisonRow[]> {
  const { data, error } = await supabase
    .from("sii_purchase_summary")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("periodo", { ascending: false })
    .limit(5000);
  if (error) throw error;

  const summaries = data ?? [];
  const periods = [...new Set(summaries.map((row) => String(row.periodo ?? "")).filter(Boolean))];
  const docsByPeriod = new Map<string, Array<{ tipo_dte: string; monto_total: number; monto_neto: number; iva: number }>>();

  for (const period of periods) {
    const start = `${period}-01`;
    const end = nextPeriodStart(period);
    const { data: docs } = await supabase
      .from("dte_documents")
      .select("tipo_dte,monto_neto,iva,monto_total")
      .eq("tenant_id", tenantId)
      .gte("fecha_emision", start)
      .lt("fecha_emision", end)
      .limit(10000);
    docsByPeriod.set(period, (docs ?? []) as Array<{ tipo_dte: string; monto_total: number; monto_neto: number; iva: number }>);
  }

  return summaries.map((row) => {
    const period = String(row.periodo ?? "");
    const type = String(row.tipo_documento ?? "");
    const docs = (docsByPeriod.get(period) ?? []).filter((doc) => String(doc.tipo_dte) === type);
    const documentosXml = docs.length;
    const montoXml = docs.reduce((sum, doc) => sum + Number(doc.monto_total ?? 0), 0);
    const documentosSii = Number(row.cantidad_documentos_sii ?? 0);
    const montoTotalSii = Number(row.monto_total_sii ?? 0);
    const diferenciaDocumentos = documentosSii - documentosXml;
    const diferenciaMonto = montoTotalSii - montoXml;
    const hasAmountDifference = Math.abs(diferenciaMonto) > 10;
    const estado = diferenciaDocumentos === 0 && !hasAmountDifference
      ? "ok"
      : diferenciaDocumentos !== 0
        ? "faltan_documentos"
        : "diferencia_monto";
    return {
      accionRecomendada: estado === "ok"
        ? "Control agregado consistente"
        : diferenciaDocumentos !== 0
          ? "Descargar detalle SII para identificar folios y solicitar XML a proveedores"
          : "Revisar diferencia de monto entre XML recibidos y resumen SII",
      diferenciaDocumentos,
      diferenciaMonto,
      documentosSii,
      documentosXml,
      estado,
      id: String(row.id),
      importedAt: String(row.imported_at ?? ""),
      ivaSii: Number(row.iva_sii ?? 0),
      montoNetoSii: Number(row.monto_neto_sii ?? 0),
      montoTotalSii,
      montoXml,
      periodo: period,
      rutEmpresa: String(row.rut_empresa ?? ""),
      sourceFile: String(row.source_file ?? "") || null,
      tipoDocumento: type
    };
  });
}

export async function syncSiiRegistryForDte({
  companyId,
  dteDocumentId,
  gmailMessageId,
  montoTotal,
  receivedAt,
  rutEmisor,
  supabase,
  tenantId,
  tipoDte,
  folio
}: {
  companyId: string | null;
  dteDocumentId: string;
  folio: string;
  gmailMessageId: string | null;
  montoTotal: number;
  receivedAt: string | null;
  rutEmisor: string;
  supabase: SupabaseClient;
  tenantId: string;
  tipoDte: string;
}) {
  const { data: existing } = await supabase
    .from("sii_purchase_registry")
    .select("id,monto_total,estado_xml")
    .eq("tenant_id", tenantId)
    .eq("rut_emisor", rutEmisor)
    .eq("tipo_dte", tipoDte)
    .eq("folio", folio)
    .maybeSingle();
  if (!existing) return null;
  const estadoXml = Math.abs(Number(existing.monto_total ?? 0) - montoTotal) > 10 ? "diferencia_monto" : "xml_recibido";
  await supabase.from("sii_purchase_registry").update({
    claim_status: estadoXml === "xml_recibido" ? "resuelto" : "pendiente",
    dte_document_id: dteDocumentId,
    estado_xml: estadoXml,
    gmail_message_id: gmailMessageId,
    xml_received_at: receivedAt ?? new Date().toISOString()
  }).eq("id", existing.id);
  await supabase.from("audit_events").insert({
    after_data: { estado_xml: estadoXml, folio, rut_emisor: rutEmisor },
    company_id: companyId,
    entity_id: existing.id,
    entity_type: "sii_purchase_registry",
    event_type: estadoXml === "xml_recibido" ? "sii.xml_missing_resolved" : "sii.amount_difference_detected",
    tenant_id: tenantId
  });
  return estadoXml;
}

export function toViewRow(row: Record<string, unknown>): SiiRegistryViewRow {
  const dte = Array.isArray(row.dte_documents) ? row.dte_documents[0] : row.dte_documents as Record<string, unknown> | null;
  return {
    claimStatus: String(row.claim_status ?? "pendiente") as SiiRegistryViewRow["claimStatus"],
    dteDocumentId: String(row.dte_document_id ?? "") || null,
    estadoXml: String(row.estado_xml ?? "pendiente_revision") as SiiRegistryViewRow["estadoXml"],
    fechaEmision: String(row.fecha_emision ?? ""),
    folio: String(row.folio ?? ""),
    gmailMessageId: String(row.gmail_message_id ?? "") || null,
    id: String(row.id),
    iva: Number(row.iva ?? 0),
    lastImportedAt: String(row.last_imported_at ?? ""),
    montoNeto: Number(row.monto_neto ?? 0),
    montoTotal: Number(row.monto_total ?? 0),
    montoXml: Number(dte?.monto_total ?? 0),
    periodo: String(row.periodo ?? ""),
    razonSocial: String(row.razon_social ?? ""),
    rutEmisor: String(row.rut_emisor ?? ""),
    sourceFile: String(row.source_file ?? "") || null,
    supplierEmail: String(row.supplier_email ?? "") || null,
    tipoDte: String(row.tipo_dte ?? ""),
    xmlReceivedAt: String(row.xml_received_at ?? "") || null
  };
}

function nextPeriodStart(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
