import { NextResponse } from "next/server";
import { auditCsv, getAuditEvents, type AuditEventView } from "@/lib/audit/events";
import { createClient } from "@/lib/supabase/server";

function filterEvents(request: Request, events: AuditEventView[]) {
  const params = new URL(request.url).searchParams;
  const query = params.get("query")?.trim().toLowerCase() ?? "";
  const moduleFilter = params.get("module") ?? "";
  const actor = params.get("actor") ?? "";
  const state = params.get("state") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  return events.filter((event) => {
    const day = event.createdAt.slice(0, 10);
    const haystack = [event.eventType, event.module, event.actor, event.entityType, event.entityId, event.error, JSON.stringify(event.afterData ?? {})].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!moduleFilter || event.module === moduleFilter) && (!actor || event.actor === actor) && (!state || event.state === state) && (!from || day >= from) && (!to || day <= to);
  });
}

function pdfEscape(value: string) {
  return value.replace(/[()\\]/g, "\\$&").replace(/[^\x20-\x7e]/g, " ");
}

function auditPdf(events: AuditEventView[]) {
  const lines = ["Auditoria ERP La Cocina de Javier", `Eventos exportados: ${events.length}`, ""];
  for (const event of events.slice(0, 68)) {
    lines.push(`${event.createdAt} | ${event.actor} | ${event.module} | ${event.eventType} | ${event.entityType} ${event.entityId} | ${event.state}`);
  }
  const content = lines.map((line, index) => `BT /F1 8 Tf 36 ${806 - index * 11} Td (${pdfEscape(line.slice(0, 148))}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

export async function GET(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const membership = await auth.from("user_memberships").select("role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !["owner", "admin", "auditor"].includes(membership.data.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const events = filterEvents(request, await getAuditEvents(1200));
  const format = new URL(request.url).searchParams.get("format");
  if (format === "pdf") {
    return new NextResponse(auditPdf(events), { headers: { "Content-Disposition": 'inline; filename="auditoria-erp.pdf"', "Content-Type": "application/pdf" } });
  }
  return new NextResponse(auditCsv(events), { headers: { "Content-Disposition": 'attachment; filename="auditoria-erp.csv"', "Content-Type": "text/csv; charset=utf-8" } });
}
