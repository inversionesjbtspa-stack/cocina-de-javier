import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  approvedAmount: z.coerce.number().min(0),
  discountPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional().or(z.literal("")).default(""),
  employeeId: z.string().uuid(),
  reason: z.string().trim().max(500).optional().default(""),
  requestedAmount: z.coerce.number().positive(),
  requestDate: z.string().date(),
  status: z.enum(["solicitado", "aprobado", "rechazado", "pagado", "descontado", "anulado"]).default("solicitado")
});

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "advance_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  let paymentItemId: string | null = null;
  if (["aprobado", "pagado"].includes(body.status) && body.approvedAmount > 0) {
    const payment = await supabase.from("hr_payment_items").insert({
      amount: body.approvedAmount,
      approved_at: new Date().toISOString(),
      approved_by: ctx.user.id,
      created_by: ctx.user.id,
      employee_id: body.employeeId,
      glosa: `Anticipo sueldo ${body.discountPeriod || body.requestDate.slice(0, 7)}`,
      payment_type: "anticipo",
      period: body.discountPeriod || body.requestDate.slice(0, 7),
      scheduled_date: body.requestDate,
      status: "aprobado",
      tenant_id: ctx.membership.tenant_id
    }).select("id").single();
    paymentItemId = payment.data?.id ?? null;
  }
  const { data, error } = await supabase.from("hr_advances").insert({
    approved_amount: body.approvedAmount,
    created_by: ctx.user.id,
    discount_period: body.discountPeriod || null,
    employee_id: body.employeeId,
    payment_item_id: paymentItemId,
    reason: body.reason || null,
    request_date: body.requestDate,
    requested_amount: body.requestedAmount,
    status: body.status,
    tenant_id: ctx.membership.tenant_id
  }).select("id").single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "advance_create_failed" }, { status: 422 });
  await supabase.from("audit_events").insert({ actor_role: ctx.membership.role, actor_user_id: ctx.user.id, after_data: body, company_id: ctx.membership.company_id, entity_id: data.id, entity_type: "hr_advance", event_type: "hr.advance_created", tenant_id: ctx.membership.tenant_id });
  return NextResponse.json({ ok: true, advance: data, paymentItemId });
}
