import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { getEmployeeForHrTenant } from "@/lib/hr/vacation-server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  days: z.coerce.number(),
  employeeId: z.string().uuid(),
  movementType: z.enum(["saldo_inicial", "acumulacion_mensual", "vacaciones_tomadas", "ajuste_manual", "finiquito"]),
  note: z.string().trim().max(800).optional().default(""),
  period: z.string().regex(/^\d{4}-\d{2}$/)
});

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "hr_vacation_accrual_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  const employee = await getEmployeeForHrTenant(supabase, ctx.membership.tenant_id, body.employeeId, "id,tenant_id,status");
  if (!employee.checked.ok) return NextResponse.json({ ok: false, error: employee.checked.error }, { status: 404 });
  if (employee.data?.status && employee.data.status !== "activo") {
    return NextResponse.json({ ok: false, error: "employee_not_active" }, { status: 422 });
  }
  const balance = await supabase.from("hr_vacation_balances").select("*").eq("tenant_id", ctx.membership.tenant_id).eq("employee_id", body.employeeId).maybeSingle();
  const current = Number(balance.data?.pending_days ?? balance.data?.initial_balance ?? 0);
  const balanceAfter = Math.round((current + body.days) * 100) / 100;

  const { data, error } = await supabase.from("hr_vacation_ledger").insert({
    balance_after: balanceAfter,
    created_by: ctx.user.id,
    days: body.days,
    employee_id: body.employeeId,
    movement_type: body.movementType,
    note: body.note || null,
    period: body.period,
    tenant_id: ctx.membership.tenant_id
  }).select("id").single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "hr_vacation_accrual_save_failed" }, { status: 422 });

  await supabase.from("hr_vacation_balances").upsert({
    employee_id: body.employeeId,
    pending_days: balanceAfter,
    tenant_id: ctx.membership.tenant_id,
    updated_by: ctx.user.id
  }, { onConflict: "tenant_id,employee_id" });
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { ...body, balance_after: balanceAfter },
    company_id: ctx.membership.company_id,
    entity_id: data.id,
    entity_type: "hr_vacation_ledger",
    event_type: body.movementType === "ajuste_manual" ? "hr.vacation_manual_adjustment" : "hr.vacation_accrual_recorded",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ ok: true, ledger: data, balanceAfter });
}
