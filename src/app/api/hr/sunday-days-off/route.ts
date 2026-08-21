import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { validateMonthlySundayOffDates } from "@/lib/hr/vacation-calendar-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const schema = z.object({
  employeeId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  sundayOffDates: z.array(z.string().date().or(z.literal(""))).default([])
});

function monthEnd(month: string) {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "sunday_schedule_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const validation = validateMonthlySundayOffDates(body.month, body.sundayOffDates);
  if (!validation.ok) return NextResponse.json({ ok: false, error: validation.error }, { status: 422 });

  const supabase = createAdminClient();
  const { data: employee } = await supabase
    .from("hr_employees")
    .select("id,tenant_id,status")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("id", body.employeeId)
    .maybeSingle();
  if (!employee) return NextResponse.json({ ok: false, error: "employee_not_found" }, { status: 404 });

  const start = `${body.month}-01`;
  const end = monthEnd(body.month);
  const cleanup = await supabase
    .from("hr_employee_monthly_days_off")
    .delete()
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("employee_id", body.employeeId)
    .eq("day_type", "SUNDAY_OFF")
    .gte("off_date", start)
    .lte("off_date", end);
  if (cleanup.error) return NextResponse.json({ ok: false, error: cleanup.error.message }, { status: 422 });

  if (validation.dates.length) {
    const insert = await supabase.from("hr_employee_monthly_days_off").insert(validation.dates.map((date) => ({
      created_by: ctx.user.id,
      day_type: "SUNDAY_OFF",
      employee_id: body.employeeId,
      note: "Programacion mensual RRHH",
      off_date: date,
      source: "monthly_schedule",
      tenant_id: ctx.membership.tenant_id
    })));
    if (insert.error) return NextResponse.json({ ok: false, error: insert.error.message }, { status: 422 });
  }

  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { employeeId: body.employeeId, month: body.month, sundayOffDates: validation.dates },
    company_id: ctx.membership.company_id,
    entity_id: body.employeeId,
    entity_type: "hr_employee_monthly_days_off",
    event_type: "hr.sunday_days_off_updated",
    tenant_id: ctx.membership.tenant_id
  });

  return NextResponse.json({ ok: true, saved: validation.dates.length });
}
