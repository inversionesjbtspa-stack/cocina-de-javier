import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { calculateVacationPreview, yearsInRange, type HolidayCalendarStatus } from "@/lib/hr/vacation-domain";
import { assertEmployeeInTenant, buildFallbackPeriods, ensureVacationPeriodsForEmployee, mapPeriodRow, parseVacationWorkSchedule, safeVacationHolidays } from "@/lib/hr/vacation-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const previewSchema = z.object({
  advanceAuthorized: z.coerce.boolean().optional().default(false),
  endDate: z.string().date().optional().or(z.literal("")).default(""),
  employeeId: z.string().uuid(),
  fractionationAgreement: z.coerce.boolean().optional().default(false),
  requestedBusinessDays: z.coerce.number().positive().optional(),
  startDate: z.string().date()
}).refine((value) => value.requestedBusinessDays || value.endDate, { message: "start_and_days_or_end_required", path: ["endDate"] });

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = previewSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "vacation_preview_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
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
  if (!checked.ok) return NextResponse.json({ ok: false, error: checked.error }, { status: 404 });
  const employeeRow = checked.employee as Record<string, unknown> & { hire_date?: string | null; id: string; tenant_id?: string | null };
  if (!employeeRow.hire_date) return NextResponse.json({ ok: false, error: "employee_hire_date_required" }, { status: 422 });

  const calendarStatusByYear = Object.fromEntries((calendarRows ?? []).map((row) => [String(row.calendar_year), String(row.verification_status) as HolidayCalendarStatus]));
  const ensured = periodRows?.length
    ? { periods: periodRows.map((row) => mapPeriodRow(row as Record<string, unknown>)), usedFallback: false }
    : await ensureVacationPeriodsForEmployee({ asOf: body.startDate, employee: employeeRow, supabase, userId: ctx.user.id });
  const periods = ensured.periods.length ? ensured.periods : buildFallbackPeriods(employeeRow, body.startDate);
  const preview = calculateVacationPreview({
    advanceAuthorized: body.advanceAuthorized,
    agreementAccepted: body.fractionationAgreement,
    calendarStatusByYear,
    endDate: body.endDate || null,
    hireDate: employeeRow.hire_date,
    holidays: safeVacationHolidays(holidayRows as Array<Record<string, unknown>> | null),
    periods,
    requestedBusinessDays: body.requestedBusinessDays ?? null,
    schedule: parseVacationWorkSchedule(employeeRow.work_schedule),
    startDate: body.startDate
  });
  return NextResponse.json({ ok: true, periodsPersisted: !ensured.usedFallback && periods.length > 0, preview });
}
