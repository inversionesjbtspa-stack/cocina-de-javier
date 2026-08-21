import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { calculateVacationPreview, yearsInRange, type HolidayCalendarStatus } from "@/lib/hr/vacation-domain";
import { resolveEmployeeWorkingCalendar } from "@/lib/hr/vacation-calendar-server";
import { assertEmployeeInTenant, buildFallbackPeriods, ensureVacationPeriodsForEmployee, mapPeriodRow, safeVacationHolidays } from "@/lib/hr/vacation-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const previewSchema = z.object({
  advanceAuthorized: z.coerce.boolean().optional().default(false),
  endDate: z.string().date().optional().or(z.literal("")).default(""),
  employeeId: z.string().uuid(),
  fractionationAgreement: z.coerce.boolean().optional().default(false),
  manualNonWorkingDays: z.array(z.object({
    date: z.string().date(),
    reason: z.string().trim().max(160).optional().default("Cierre empresa manual")
  })).optional().default([]),
  requestedBusinessDays: z.coerce.number().positive().optional(),
  startDate: z.string().date()
}).refine((value) => value.requestedBusinessDays || value.endDate, { message: "start_and_days_or_end_required", path: ["endDate"] })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, { message: "end_before_start", path: ["endDate"] });

function domainError(code: string, message: string, status = 422, fields?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, code, error: code, message, fields }, { status });
}

function validateManualClosedDays(manualDays: Array<{ date: string; reason: string }>, startDate: string, endDate: string) {
  for (const day of manualDays) {
    if (day.date < startDate || day.date > endDate) {
      return { error: "manual_non_working_day_out_of_range" };
    }
  }
  return { error: null };
}

export async function POST(request: Request) {
  try {
    const ctx = await requireHrContext();
    if (ctx.error) return ctx.error;
    const parsed = previewSchema.safeParse(await request.json());
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      const code = fields.endDate?.includes("end_before_start") ? "INVALID_DATE_RANGE" : "VACATION_PREVIEW_VALIDATION_FAILED";
      const message = code === "INVALID_DATE_RANGE"
        ? "La fecha Hasta no puede ser anterior a Desde."
        : "Completa las fechas requeridas para calcular la vista previa.";
      return domainError(code, message, 422, fields);
    }
    const body = parsed.data;
    const supabase = createAdminClient();
    const previewEnd = body.endDate || body.startDate;
    const calendarYears = yearsInRange(body.startDate, previewEnd);
    const [{ data: employee }, { data: periodRows }, { data: holidayRows }, { data: calendarRows }] = await Promise.all([
      supabase.from("hr_employees").select("id,tenant_id,full_name,rut,hire_date,work_schedule").eq("tenant_id", ctx.membership.tenant_id).eq("id", body.employeeId).maybeSingle(),
      supabase.from("hr_vacation_periods").select("*").eq("tenant_id", ctx.membership.tenant_id).eq("employee_id", body.employeeId),
      supabase.from("hr_holiday_calendar").select("*").eq("status", "active"),
      supabase.from("hr_holiday_calendar_years").select("calendar_year,verification_status").in("calendar_year", calendarYears)
    ]);
    const checked = assertEmployeeInTenant(employee, ctx.membership.tenant_id);
    if (!checked.ok) return domainError("EMPLOYEE_NOT_FOUND", "No se encontro el trabajador en este tenant.", 404);
    const employeeRow = checked.employee as Record<string, unknown> & { hire_date?: string | null; id: string; tenant_id?: string | null };
    if (!employeeRow.hire_date) return domainError("EMPLOYEE_HIRE_DATE_REQUIRED", "No se puede calcular porque falta la fecha de ingreso del trabajador.");

    const calendarStatusByYear = Object.fromEntries((calendarRows ?? []).map((row) => [String(row.calendar_year), String(row.verification_status) as HolidayCalendarStatus]));
    const ensured = periodRows?.length
      ? { periods: periodRows.map((row) => mapPeriodRow(row as Record<string, unknown>)), usedFallback: false }
      : await ensureVacationPeriodsForEmployee({ asOf: body.startDate, employee: employeeRow, supabase, userId: ctx.user.id });
    const periods = ensured.periods.length ? ensured.periods : buildFallbackPeriods(employeeRow, body.startDate);
    const holidays = safeVacationHolidays(holidayRows as Array<Record<string, unknown>> | null);
    const manualClosed = validateManualClosedDays(body.manualNonWorkingDays, body.startDate, body.endDate || body.startDate);
    if (manualClosed.error) return domainError("MANUAL_NON_WORKING_DAY_OUT_OF_RANGE", "El cierre manual debe estar dentro del rango solicitado.", 422);
    const workingCalendar = await resolveEmployeeWorkingCalendar({
      employeeId: body.employeeId,
      employeeSchedule: employeeRow.work_schedule,
      fromDate: body.startDate,
      holidays,
      manualClosedDays: body.manualNonWorkingDays,
      supabase,
      tenantId: ctx.membership.tenant_id,
      toDate: body.endDate || body.startDate
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
    return NextResponse.json({
      ok: true,
      allocations: preview.allocations,
      balanceAfter: preview.totalAfterRequest,
      balanceBefore: preview.totalAvailable,
      calendarDays: preview.calendarDays,
      fromDate: body.startDate,
      holidays: preview.holidaysApplied,
      nonWorkingDays: preview.nonBusiness,
      policy: workingCalendar.policy,
      periodsPersisted: !ensured.usedFallback && periods.length > 0,
      preview,
      toDate: preview.effectiveRestEndDate,
      warnings: preview.calendarWarnings,
      workingCalendar: workingCalendar.days,
      workingDays: preview.businessDays
    });
  } catch (error) {
    console.error("vacation_preview_unexpected_error", error);
    return domainError("VACATION_PREVIEW_UNEXPECTED_ERROR", "No se pudo calcular la solicitud. Intenta nuevamente.", 500);
  }
}
