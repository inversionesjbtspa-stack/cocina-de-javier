import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { calculateLegalVacationDays } from "@/lib/hr/vacation-domain";
import { persistVacationReceiptForRequest, safeVacationHolidays, type VacationReceiptPersistenceClient } from "@/lib/hr/vacation-server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const reason = "Corrección de cálculo de día hábil por feriado legal 12-10-2026.";
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function page(title: string, content: string, status = 200) {
  return new NextResponse(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:16px system-ui;color:#26372b;background:#f7f8f6;margin:0;padding:24px}main{max-width:680px;margin:auto;background:white;padding:24px;border:1px solid #dfe4dd;border-radius:6px}h1{font-size:22px}dt{color:#667068;margin-top:12px}dd{margin:3px 0;font-weight:600}button,a{display:inline-block;margin-top:20px;padding:12px;background:#69192d;color:white;border:0;border-radius:4px;font:inherit}input{display:none}</style><main><h1>${escape(title)}</h1>${content}</main></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return page("Solicitud no válida", "", 422);
  const client = createAdminClient();
  const [{ data: row, error }, holidays, correction] = await Promise.all([
    client.from("hr_vacation_requests").select("*,hr_employees(full_name)").eq("tenant_id", ctx.membership.tenant_id).eq("id", id).maybeSingle(),
    client.from("hr_holiday_calendar").select("*").eq("status", "active").or(`tenant_id.is.null,tenant_id.eq.${ctx.membership.tenant_id}`),
    client.from("hr_vacation_holiday_corrections").select("*").eq("tenant_id", ctx.membership.tenant_id).eq("request_id", id).maybeSingle()
  ]);
  if (error || !row || holidays.error || correction.error) return page("No se pudo verificar la solicitud", "", 422);
  if (correction.data?.new_hash) return page("Corrección completada", `<p>${escape(row.document_number)}</p><p>Saldo: ${escape(correction.data.balance_after)} días</p><a href="/api/hr/vacations/${id}/papeleta?format=pdf">PDF corregido</a>`);
  const days = calculateLegalVacationDays({ startDate: row.start_date, endDate: row.effective_rest_end_date ?? row.end_date, legalHolidays: safeVacationHolidays(holidays.data), manualNonWorkingDays: (row.snapshot?.workCalendar?.non_business?.manualNonWorkingDayDates ?? []).map((date: string) => ({ date })) });
  const delta = Number(row.business_days) - days.daysToDeduct;
  const legalDate = days.legalHolidayDates.includes("2026-10-12");
  if (!correction.data && (row.status !== "aprobada" || delta !== 1 || !legalDate)) return page("Requiere revisión", `<p>${escape(row.document_number)}</p><p>Días registrados: ${escape(row.business_days)}. Días legales: ${days.daysToDeduct}.</p>`, 409);
  const employee = Array.isArray(row.hr_employees) ? row.hr_employees[0] : row.hr_employees;
  return page("Corrección de feriado legal", `<p>${escape(employee?.full_name)} · ${escape(row.document_number)}</p><p>${escape(row.start_date)} → ${escape(row.end_date)}</p><dl><dt>Días corridos</dt><dd>${days.calendarDays}</dd><dt>Hábiles registrados / correctos</dt><dd>${escape(correction.data?.old_business_days ?? row.business_days)} / ${days.daysToDeduct}</dd><dt>Inhábiles</dt><dd>${days.calendarDays - days.daysToDeduct}</dd><dt>Saldo actual / corregido</dt><dd>${escape(correction.data?.balance_before ?? row.resulting_balance)} / ${escape(correction.data?.balance_after ?? Number(row.resulting_balance) + delta)}</dd><dt>Motivo</dt><dd>${escape(reason)}</dd></dl><form method="post"><input name="version" value="${escape(row.version)}"><button type="submit">${correction.data ? "Completar PDF pendiente" : "Aplicar corrección de +1 día y actualizar PDF"}</button></form>`);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  if (request.headers.get("origin") !== new URL(request.url).origin) return page("Origen no autorizado", "", 403);
  const { id } = await params;
  const form = await request.formData();
  const version = z.coerce.number().int().positive().safeParse(form.get("version"));
  if (!z.string().uuid().safeParse(id).success || !version.success) return page("Solicitud no válida", "", 422);
  const authenticated = await createClient();
  // This RPC computes the correction from persisted legal dates and serializes retries.
  const result = await authenticated.rpc("hr_correct_vacation_legal_holidays", { p_request: id, p_expected_version: version.data, p_reason: reason });
  if (result.error) return page("Corrección detenida", `<p>${escape(result.error.message)}</p>`, 409);
  const correction = result.data as { id: string; new_hash: string | null; balance_after: number; days_returned: number };
  if (!correction.new_hash) {
    const document = await persistVacationReceiptForRequest({ correctionId: correction.id, companyId: ctx.membership.company_id, tenantId: ctx.membership.tenant_id, requestId: id, userId: ctx.user.id, supabase: createAdminClient() as unknown as VacationReceiptPersistenceClient });
    if (!document.ok) return page("Abono registrado; PDF pendiente", `<p>${escape(document.error)}</p><a href="/api/hr/vacations/${id}/holiday-correction">Revisar documento pendiente</a>`, 422);
    const completed = await authenticated.rpc("hr_complete_vacation_holiday_document", { p_correction: correction.id, p_hash: document.hash, p_path: document.storagePath });
    if (completed.error) return page("PDF generado; auditoría pendiente", `<p>${escape(completed.error.message)}</p>`, 422);
  }
  return page("Corrección completada", `<p>Devolución: +${escape(correction.days_returned)} día. Saldo: ${escape(correction.balance_after)} días.</p><p>Solicitud original conservada.</p><a href="/api/hr/vacations/${id}/papeleta?format=pdf">PDF corregido</a>`);
}
