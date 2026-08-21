import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { calculateVacationPreview, yearsInRange, type HolidayCalendarStatus } from "@/lib/hr/vacation-domain";
import { resolveEmployeeWorkingCalendar } from "@/lib/hr/vacation-calendar-server";
import { assertEmployeeInTenant, buildFallbackPeriods, buildVacationSnapshot, ensureVacationPeriodsForEmployee, mapPeriodRow, persistVacationReceiptForRequest, safeVacationHolidays, type VacationReceiptPersistenceClient } from "@/lib/hr/vacation-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const vacationSchema = z.object({
  advanceAuthorized: z.coerce.boolean().optional().default(false),
  contractPeriodEnd: z.string().date().optional().or(z.literal("")).default(""),
  contractPeriodStart: z.string().date().optional().or(z.literal("")).default(""),
  documentDate: z.string().date().optional().or(z.literal("")).default(""),
  employeeId: z.string().uuid(),
  endDate: z.string().date().optional().or(z.literal("")).default(""),
  fractionationAgreement: z.coerce.boolean().optional().default(false),
  fractionalVacation: z.coerce.boolean().optional().default(false),
  manualNonWorkingDays: z.array(z.object({
    date: z.string().date(),
    reason: z.string().trim().max(160).optional().default("Cierre empresa manual")
  })).optional().default([]),
  note: z.string().trim().max(1000).optional().default(""),
  observation: z.string().trim().max(800).optional().default(""),
  requestedBusinessDays: z.coerce.number().positive().optional(),
  startDate: z.string().date(),
  status: z.enum(["borrador", "solicitada", "pendiente", "aprobada", "rechazada"]).default("solicitada")
}).refine((value) => value.requestedBusinessDays || value.endDate, { message: "start_and_days_or_end_required", path: ["endDate"] });

function legacyStatus(status: string) {
  return status === "pendiente" ? "solicitada" : status;
}

function validateManualClosedDays(manualDays: Array<{ date: string; reason: string }>, startDate: string, endDate: string) {
  for (const day of manualDays) {
    if (day.date < startDate || day.date > endDate) {
      return { error: "manual_non_working_day_out_of_range" };
    }
  }
  return { error: null };
}

export async function GET() {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("hr_vacation_requests")
    .select("*,hr_employees(id,full_name,rut)")
    .eq("tenant_id", ctx.membership.tenant_id)
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  return NextResponse.json({ ok: true, vacations: data ?? [] });
}

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = vacationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "vacation_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  const previewEnd = body.endDate || body.startDate;
  const calendarYears = yearsInRange(body.startDate, previewEnd);
  const { data: employee } = await supabase.from("hr_employees").select("id,tenant_id,full_name,rut,position,area,cost_center,hire_date,contract_type,work_schedule").eq("tenant_id", ctx.membership.tenant_id).eq("id", body.employeeId).maybeSingle();
  const { data: company } = await supabase.from("companies").select("legal_name,name,rut,address,phone").eq("id", ctx.membership.company_id).maybeSingle();
  const { data: periodRows } = await supabase.from("hr_vacation_periods").select("*").eq("tenant_id", ctx.membership.tenant_id).eq("employee_id", body.employeeId);
  const { data: holidayRows } = await supabase.from("hr_holiday_calendar").select("*").eq("status", "active");
  const { data: calendarRows } = await supabase.from("hr_holiday_calendar_years").select("calendar_year,verification_status").in("calendar_year", calendarYears);
  const checked = assertEmployeeInTenant(employee, ctx.membership.tenant_id);
  if (!checked.ok) return NextResponse.json({ ok: false, error: checked.error }, { status: 404 });
  const employeeRow = checked.employee as Record<string, unknown> & { hire_date?: string | null; id: string; tenant_id?: string | null };
  if (!employeeRow.hire_date) return NextResponse.json({ ok: false, error: "employee_hire_date_required" }, { status: 422 });

  const holidays = safeVacationHolidays(holidayRows as Array<Record<string, unknown>> | null);
  const manualClosed = validateManualClosedDays(body.manualNonWorkingDays, body.startDate, previewEnd);
  if (manualClosed.error) return NextResponse.json({ ok: false, error: "manual_non_working_day_out_of_range" }, { status: 422 });
  const calendarStatusByYear = Object.fromEntries((calendarRows ?? []).map((row) => [String(row.calendar_year), String(row.verification_status) as HolidayCalendarStatus]));
  const ensured = periodRows?.length
    ? { periods: periodRows.map((row) => mapPeriodRow(row as Record<string, unknown>)), usedFallback: false }
    : await ensureVacationPeriodsForEmployee({ asOf: body.startDate, employee: employeeRow, supabase, userId: ctx.user.id });
  const periods = ensured.periods.length ? ensured.periods : buildFallbackPeriods(employeeRow, body.startDate);
  const workingCalendar = await resolveEmployeeWorkingCalendar({
    employeeId: body.employeeId,
    employeeSchedule: employeeRow.work_schedule,
    fromDate: body.startDate,
    holidays,
    manualClosedDays: body.manualNonWorkingDays,
    supabase,
    tenantId: ctx.membership.tenant_id,
    toDate: previewEnd
  });
  const preview = calculateVacationPreview({
    advanceAuthorized: body.advanceAuthorized,
    agreementAccepted: body.fractionationAgreement,
    calendarStatusByYear,
    endDate: body.endDate || null,
    hireDate: employeeRow.hire_date,
    holidays,
    periods,
    requestedBusinessDays: body.requestedBusinessDays ?? null,
    schedule: workingCalendar.schedule,
    startDate: body.startDate
  });
  const observationText = [
    body.observation,
    ...body.manualNonWorkingDays.map((day) => `Cierre empresa manual: ${day.date} - ${day.reason}`)
  ].filter(Boolean).join("\n");
  if (!preview.valid && body.status !== "borrador") {
    return NextResponse.json({ ok: false, error: "vacation_preview_invalid", preview }, { status: 422 });
  }

  const snapshot = buildVacationSnapshot({
    companyRow: company,
    employee: employeeRow,
    holidays,
    note: body.note,
    observation: observationText,
    periods,
    preview
  });
  const resultingBalance = Math.round((preview.totalAvailable - preview.businessDays) * 1000000) / 1000000;
  const payload = {
    advance_authorized: body.advanceAuthorized,
    advance_days: preview.advanceDays,
    business_days: preview.businessDays,
    effective_rest_end_date: preview.effectiveRestEndDate,
    employee_id: body.employeeId,
    end_date: preview.lastCountedVacationDate,
    fractionation_agreement: body.fractionationAgreement,
    is_fractioned: preview.businessDays < 10,
    last_counted_vacation_date: preview.lastCountedVacationDate,
    non_business_days: Number(preview.nonBusiness.mondayClosed ?? 0) + Number(preview.nonBusiness.scheduledSundayOff ?? 0) + Number(preview.nonBusiness.companyClosed ?? 0),
    observation: observationText || null,
    previous_balance: preview.totalAvailable,
    projected_business_days: preview.projectedProportional,
    requested_business_days: preview.businessDays,
    resulting_balance: resultingBalance,
    return_date_confirmed: preview.returnDateManuallyConfirmed,
    return_to_work_date: preview.returnToWorkDate,
    schedule_source: preview.scheduleSource,
    start_date: body.startDate,
    status: legacyStatus(body.status),
    tenant_id: ctx.membership.tenant_id
  };

  const rpc = await supabase.rpc("hr_create_vacation_request", {
    p_payload: { ...payload, snapshot }
  });
  if (rpc.error) {
    return NextResponse.json({ ok: false, error: rpc.error.message }, { status: 422 });
  }

  const requestId = String(rpc.data);
  if (body.status === "aprobada") {
    const approved = await supabase.rpc("hr_approve_vacation_request", {
      p_request_id: requestId,
      p_expected_version: 1
    });
    if (approved.error) return NextResponse.json({ ok: false, error: approved.error.message, requestId }, { status: 422 });
    const receipt = await persistVacationReceiptForRequest({
      companyId: ctx.membership.company_id,
      requestId,
      supabase: supabase as unknown as VacationReceiptPersistenceClient,
      tenantId: ctx.membership.tenant_id,
      userId: ctx.user.id
    });
    if (!receipt.ok) return NextResponse.json({ ok: false, error: receipt.error, requestId }, { status: 422 });
  }
  return NextResponse.json({
    ok: true,
    periodsPersisted: !ensured.usedFallback && periods.length > 0,
    preview,
    receiptPdfUrl: `/api/hr/vacations/${requestId}/papeleta?format=pdf`,
    receiptPreviewUrl: `/api/hr/vacations/${requestId}/papeleta?format=html`,
    requestId
  });
}
