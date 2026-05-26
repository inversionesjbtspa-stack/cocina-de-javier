import { unstable_noStore as noStore } from "next/cache";
import { hasSupabaseAdminConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditEventView = {
  id: string;
  eventType: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  actorRole: string;
  state: "ok" | "warning" | "error";
  createdAt: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  error: string;
  requestId: string;
  ipAddress: string;
  userAgent: string;
  technical: boolean;
};

type RawAuditEvent = {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

function humanize(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function moduleFromEvent(eventType: string, entityType: string | null) {
  if (eventType.startsWith("dte.") || entityType?.includes("dte")) return "Facturas DTE";
  if (eventType.startsWith("supplier.")) return "Proveedores";
  if (eventType.startsWith("product.")) return "Productos";
  if (eventType.startsWith("payment.")) return "Tesoreria";
  if (eventType.startsWith("auth.")) return "Autenticacion";
  if (eventType.startsWith("health.")) return "Salud tecnica";
  if (entityType === "accounts_payable") return "Cuentas por pagar";
  return humanize(entityType || eventType.split(".")[0] || "Sistema");
}

function stateFromPayload(eventType: string, afterData: Record<string, unknown> | null) {
  const error = afterData?.error ?? afterData?.errors;
  if (eventType.includes("reject") || eventType.includes("failed") || error) return "error";
  if (eventType.includes("warning")) return "warning";
  return "ok";
}

function errorFromPayload(afterData: Record<string, unknown> | null) {
  const error = afterData?.error ?? afterData?.reason;
  return typeof error === "string" ? error : "";
}

function isTechnicalEvent(eventType: string, afterData: Record<string, unknown> | null) {
  if (eventType === "dte.xml_duplicate_seen") return true;
  if (eventType.includes("duplicate") && !afterData?.requires_action) return true;
  if (eventType.startsWith("health.")) return true;
  return Boolean(afterData?.technical);
}

export async function getAuditEvents(limit = 500): Promise<AuditEventView[]> {
  noStore();
  if (!hasSupabaseAdminConfig()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audit_events")
    .select("id,event_type,entity_type,entity_id,actor_user_id,actor_role,before_data,after_data,request_id,ip_address,user_agent,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as RawAuditEvent[];
  const actorIds = [...new Set(rows.map((row) => row.actor_user_id).filter(Boolean))] as string[];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id,full_name,email").in("id", actorIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };
  const actors = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || profile.email || profile.id]));

  return rows.map((row) => ({
    action: humanize(row.event_type),
    actor: row.actor_user_id ? actors.get(row.actor_user_id) ?? row.actor_user_id : "Sistema",
    actorRole: row.actor_role ?? "",
    afterData: row.after_data,
    beforeData: row.before_data,
    createdAt: row.created_at,
    entityId: row.entity_id ?? "",
    entityType: humanize(row.entity_type ?? "sistema"),
    error: errorFromPayload(row.after_data),
    eventType: row.event_type,
    id: row.id,
    ipAddress: row.ip_address ?? "",
    module: moduleFromEvent(row.event_type, row.entity_type),
    requestId: row.request_id ?? "",
    state: stateFromPayload(row.event_type, row.after_data),
    technical: isTechnicalEvent(row.event_type, row.after_data),
    userAgent: row.user_agent ?? ""
  }));
}

export function auditCsv(events: AuditEventView[]) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["fecha", "usuario", "rol", "modulo", "accion", "entidad", "id_entidad", "estado", "error", "metadata"],
    ...events.map((event) => [
      event.createdAt,
      event.actor,
      event.actorRole,
      event.module,
      event.eventType,
      event.entityType,
      event.entityId,
      event.state,
      event.error,
      JSON.stringify({ before: event.beforeData, after: event.afterData, requestId: event.requestId })
    ])
  ];
  return rows.map((row) => row.map(escape).join(";")).join("\n");
}
