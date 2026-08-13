import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { previewVacationPeriodBackfill } from "@/lib/hr/vacation-persistence";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const schema = z.object({
  asOf: z.string().date().optional(),
  employeeId: z.string().uuid().optional(),
  mode: z.enum(["preview", "commit"]).default("preview"),
  yearsForward: z.coerce.number().int().min(0).max(3).optional().default(1)
});

type EmployeeRow = {
  full_name: string;
  hire_date: string | null;
  id: string;
  status: string;
  tenant_id: string;
};

type PeriodRow = {
  employee_id: string;
  period_end: string;
  period_start: string;
};

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "vacation_backfill_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  let employeeQuery = supabase
    .from("hr_employees")
    .select("id,tenant_id,full_name,hire_date,status")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("status", "activo");
  if (body.employeeId) employeeQuery = employeeQuery.eq("id", body.employeeId);
  const [{ data: employees, error: employeeError }, { data: periods, error: periodError }] = await Promise.all([
    employeeQuery,
    supabase
      .from("hr_vacation_periods")
      .select("employee_id,period_start,period_end")
      .eq("tenant_id", ctx.membership.tenant_id)
  ]);
  if (employeeError || periodError) {
    return NextResponse.json({ ok: false, error: employeeError?.message ?? periodError?.message ?? "vacation_backfill_load_failed" }, { status: 422 });
  }

  const periodRows = (periods ?? []) as PeriodRow[];
  const periodByEmployee = new Map<string, PeriodRow[]>();
  for (const period of periodRows) {
    const current = periodByEmployee.get(period.employee_id) ?? [];
    current.push(period);
    periodByEmployee.set(period.employee_id, current);
  }

  const previews = ((employees ?? []) as EmployeeRow[]).map((employee) => {
    const preview = previewVacationPeriodBackfill({
      asOf: body.asOf,
      employeeId: employee.id,
      existingPeriods: periodByEmployee.get(employee.id) ?? [],
      hireDate: employee.hire_date,
      yearsForward: body.yearsForward
    });
    return {
      employeeId: employee.id,
      employeeName: employee.full_name,
      hireDate: employee.hire_date,
      ...preview
    };
  });

  const conflicts = previews.flatMap((preview) => preview.conflicts);
  const missingRows = previews.flatMap((preview) =>
    preview.missing.map((period) => ({
      base_days: period.baseDays,
      created_by: ctx.user.id,
      employee_id: preview.employeeId,
      period_end: period.periodEnd,
      period_start: period.periodStart,
      status: period.status,
      tenant_id: ctx.membership.tenant_id,
      updated_by: ctx.user.id
    }))
  );
  const withoutHireDate = previews.filter((preview) => !preview.hireDate).length;
  const summary = {
    conflicts: conflicts.length,
    evaluatedEmployees: previews.length,
    existingPeriods: previews.reduce((sum, preview) => sum + preview.existingCount, 0),
    missingPeriods: missingRows.length,
    withoutHireDate
  };

  if (body.mode === "preview") {
    return NextResponse.json({ ok: true, mode: "preview", previews, summary });
  }
  if (conflicts.length) {
    return NextResponse.json({ ok: false, error: "vacation_backfill_conflicts_detected", conflicts, previews, summary }, { status: 409 });
  }
  if (!missingRows.length) {
    return NextResponse.json({ ok: true, created: 0, mode: "commit", previews, summary });
  }
  const inserted = await supabase
    .from("hr_vacation_periods")
    .upsert(missingRows, { onConflict: "tenant_id,employee_id,period_start,period_end", ignoreDuplicates: true })
    .select("id");
  if (inserted.error) return NextResponse.json({ ok: false, error: inserted.error.message, previews, summary }, { status: 422 });
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { created: inserted.data?.length ?? 0, summary },
    company_id: ctx.membership.company_id,
    entity_type: "hr_vacation_period_backfill",
    event_type: "hr.vacation_periods_backfilled",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ ok: true, created: inserted.data?.length ?? 0, mode: "commit", previews, summary });
}
