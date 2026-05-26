import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { businessDaysInclusive } from "@/lib/hr/utils";
import { createAdminClient } from "@/lib/supabase/admin";

const vacationSchema = z.object({
  employeeId: z.string().uuid(),
  endDate: z.string().date(),
  observation: z.string().trim().max(800).optional().default(""),
  startDate: z.string().date(),
  status: z.enum(["solicitada", "aprobada", "rechazada", "tomada"]).default("solicitada")
});

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = vacationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "vacation_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const days = businessDaysInclusive(body.startDate, body.endDate);
  if (days <= 0) return NextResponse.json({ ok: false, error: "vacation_business_days_invalid" }, { status: 422 });

  const supabase = createAdminClient();
  const balance = await supabase.from("hr_vacation_balances").select("*").eq("tenant_id", ctx.membership.tenant_id).eq("employee_id", body.employeeId).maybeSingle();
  const previous = Number(balance.data?.pending_days ?? balance.data?.initial_balance ?? 0);
  const resulting = Math.round((previous - days) * 100) / 100;
  const { data, error } = await supabase.from("hr_vacation_requests").insert({
    business_days: days,
    created_by: ctx.user.id,
    employee_id: body.employeeId,
    end_date: body.endDate,
    observation: body.observation || null,
    previous_balance: previous,
    resulting_balance: resulting,
    start_date: body.startDate,
    status: body.status,
    tenant_id: ctx.membership.tenant_id
  }).select("id").single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "vacation_create_failed" }, { status: 422 });
  if (body.status === "aprobada" || body.status === "tomada") {
    await supabase.from("hr_vacation_balances").upsert({
      employee_id: body.employeeId,
      pending_days: resulting,
      tenant_id: ctx.membership.tenant_id,
      updated_by: ctx.user.id,
      used_days: Number(balance.data?.used_days ?? 0) + days
    }, { onConflict: "tenant_id,employee_id" });
  }
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { ...body, business_days: days, resulting_balance: resulting },
    company_id: ctx.membership.company_id,
    entity_id: data.id,
    entity_type: "hr_vacation_request",
    event_type: "hr.vacation_created",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ ok: true, vacation: data, businessDays: days, resultingBalance: resulting });
}
