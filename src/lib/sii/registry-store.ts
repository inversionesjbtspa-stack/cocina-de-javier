import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiiRegistryRow } from "@/lib/sii/registry-parser";

type DteDocumentRow = {
  id: string;
  tipo_dte: string;
  folio: string;
  rut_emisor: string;
  monto_total: number;
  gmail_message_id: string | null;
  gmail_received_at: string | null;
};

export type SiiRegistryViewRow = {
  id: string;
  periodo: string;
  rutEmisor: string;
  razonSocial: string;
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

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function estadoFor(row: SiiRegistryRow, doc: DteDocumentRow | null) {
  if (!doc) return "falta_xml";
  return Math.abs(Number(doc.monto_total ?? 0) - row.montoTotal) > 10 ? "diferencia_monto" : "xml_recibido";
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
  const keys = rows.map((row) => ({
    folio: row.folio,
    rut: row.rutProveedor,
    tipo: row.tipoDte
  }));
  const rutList = [...new Set(keys.map((key) => key.rut))];
  const folios = [...new Set(keys.map((key) => key.folio))];
  const { data: docs } = rutList.length && folios.length
    ? await supabase
      .from("dte_documents")
      .select("id,tipo_dte,folio,rut_emisor,monto_total,gmail_message_id,gmail_received_at")
      .eq("tenant_id", tenantId)
      .in("rut_emisor", rutList)
      .in("folio", folios)
      .limit(5000)
    : { data: [] as DteDocumentRow[] };
  const docMap = new Map((docs ?? []).map((doc) => [`${doc.rut_emisor}:${doc.tipo_dte}:${doc.folio}`, doc as DteDocumentRow]));
  const { data: beforeRows } = keys.length
    ? await supabase
      .from("sii_purchase_registry")
      .select("id,rut_emisor,tipo_dte,folio")
      .eq("tenant_id", tenantId)
      .in("rut_emisor", rutList)
      .in("folio", folios)
      .limit(5000)
    : { data: [] as Array<{ id: string; rut_emisor: string; tipo_dte: string; folio: string }> };
  const existingKeys = new Set((beforeRows ?? []).map((row) => `${row.rut_emisor}:${row.tipo_dte}:${row.folio}`));
  const now = new Date().toISOString();
  const payload = rows.map((row) => {
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
      razon_social: row.razonSocial,
      rut_emisor: row.rutProveedor,
      source_file: fileName,
      source_hash: sourceHash,
      tenant_id: tenantId,
      tipo_dte: row.tipoDte,
      xml_received_at: doc?.gmail_received_at ?? null
    };
  });
  const { data: upserted, error } = await supabase
    .from("sii_purchase_registry")
    .upsert(payload, { onConflict: "tenant_id,rut_emisor,tipo_dte,folio" })
    .select("id,estado_xml");
  if (error) throw error;
  const summary = {
    actualizados: payload.filter((row) => existingKeys.has(`${row.rut_emisor}:${row.tipo_dte}:${row.folio}`)).length,
    diferenciasMonto: payload.filter((row) => row.estado_xml === "diferencia_monto").length,
    duplicadosIgnorados: Math.max(0, rows.length - new Set(rows.map((row) => `${row.rutProveedor}:${row.tipoDte}:${row.folio}`)).size),
    faltanXml: payload.filter((row) => row.estado_xml === "falta_xml").length,
    leidos: rows.length,
    nuevos: payload.filter((row) => !existingKeys.has(`${row.rut_emisor}:${row.tipo_dte}:${row.folio}`)).length,
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
  return { sourceHash, summary, upserted: upserted ?? [] };
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
    tipoDte: String(row.tipo_dte ?? ""),
    xmlReceivedAt: String(row.xml_received_at ?? "") || null
  };
}
