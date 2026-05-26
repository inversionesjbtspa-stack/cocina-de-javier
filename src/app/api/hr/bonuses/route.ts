import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  amount: z.coerce.number().positive(),
  bonusType: z.enum(["bono_compensatorio", "bono_desempeno", "bono_turno_extra", "bono_responsabilidad", "ajuste_manual", "otro"]),
  employeeId: z.string().uuid(),
  observation: z.string().trim().max(500).optional().default(""),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  reason: z.string().trim().max(500).optional().default(""),
  status: z.enum(["borrador", "aprobado", "incluido_en_nomina", "pagado", "anulado"]).default("aprobado")
});

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bonus_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  let paymentItemId: string | null = null;
  if (body.status === "aprobado") {
    const payment = await supabase.from("hr_payment_items").insert({
      amount: body.amount,
      approved_at: new Date().toISOString(),
      approved_by: ctx.user.id,
      created_by: ctx.user.id,
      employee_id: body.employeeId,
      glosa: body.reason || body.bonusType.replace(/_/g, " "),
      payment_type: body.bonusType === "ajuste_manual" ? "ajuste" : "bono_extra",
      period: body.period,
      status: "aprobado",
      tenant_id: ctx.membership.tenant_id
    }).select("id").single();
    paymentItemId = payment.data?.id ?? null;
  }
  const { data, error } = await supabase.from("hr_bonuses").insert({
    amount: body.amount,
    bonus_type: body.bonusType,
    created_by: ctx.user.id,
    employee_id: body.employeeId,
    observation: body.observation || null,
    payment_item_id: paymentItemId,
    period: body.period,
    reason: body.reason || null,
    status: body.status,
    tenant_id: ctx.membership.tenant_id
  }).select("id").single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "bonus_create_failed" }, { status: 422 });
  await supabase.from("audit_events").insert({ actor_role: ctx.membership.role, actor_user_id: ctx.user.id, after_data: body, company_id: ctx.membership.company_id, entity_id: data.id, entity_type: "hr_bonus", event_type: "hr.bonus_created", tenant_id: ctx.membership.tenant_id });
  return NextResponse.json({ ok: true, bonus: data, paymentItemId });
}
