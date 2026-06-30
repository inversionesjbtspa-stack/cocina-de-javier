import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  causal: z.string().trim().min(3).max(400),
  employeeId: z.string().uuid(),
  observation: z.string().trim().max(1000).optional().default(""),
  pendingAdvancesAmount: z.coerce.number().min(0).optional().default(0),
  pendingVacationDays: z.coerce.number().min(0).optional().default(0),
  settlementAmount: z.coerce.number().min(0),
  status: z.enum(["borrador", "aprobado", "pendiente_pago", "pagado", "anulado"]).default("pendiente_pago"),
  terminationDate: z.string().date()
});

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "hr_finiquito_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  let paymentItemId: string | null = null;

  if (body.settlementAmount > 0 && body.status !== "anulado") {
    const payment = await supabase.from("hr_payment_items").insert({
      amount: body.settlementAmount,
      approved_at: new Date().toISOString(),
      approved_by: ctx.user.id,
      created_by: ctx.user.id,
      employee_id: body.employeeId,
      glosa: `Finiquito ${body.terminationDate.slice(0, 7)}`,
      payment_type: "finiquito",
      period: body.terminationDate.slice(0, 7),
      source_type: "finiquito",
      status: body.status === "pagado" ? "pagado" : "pendiente_pago",
      tenant_id: ctx.membership.tenant_id
    }).select("id").single();
    paymentItemId = payment.data?.id ?? null;
  }

  const { data, error } = await supabase.from("hr_termination_settlements").insert({
    approved_at: ["aprobado", "pendiente_pago", "pagado"].includes(body.status) ? new Date().toISOString() : null,
    approved_by: ["aprobado", "pendiente_pago", "pagado"].includes(body.status) ? ctx.user.id : null,
    causal: body.causal,
    created_by: ctx.user.id,
    employee_id: body.employeeId,
    observation: body.observation || null,
    payment_item_id: paymentItemId,
    pending_advances_amount: body.pendingAdvancesAmount,
    pending_vacation_days: body.pendingVacationDays,
    settlement_amount: body.settlementAmount,
    status: body.status,
    tenant_id: ctx.membership.tenant_id,
    termination_date: body.terminationDate
  }).select("id").single();

  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "hr_finiquito_create_failed" }, { status: 422 });
  if (paymentItemId) await supabase.from("hr_payment_items").update({ source_id: data.id }).eq("id", paymentItemId);
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { ...body, payment_item_id: paymentItemId },
    company_id: ctx.membership.company_id,
    entity_id: data.id,
    entity_type: "hr_termination_settlement",
    event_type: "hr.finiquito_created",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ ok: true, finiquito: data, paymentItemId });
}
