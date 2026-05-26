import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  employeeId: z.string().uuid(),
  glosa: z.string().trim().max(240).optional().default(""),
  paymentType: z.enum(["remuneracion_mensual", "anticipo", "bono_compensatorio", "bono_extra", "gratificacion", "ajuste", "prestamo_trabajador", "devolucion", "finiquito", "otro"]),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  scheduledDate: z.string().date().optional().or(z.literal("")).default(""),
  status: z.enum(["borrador", "pendiente_aprobacion", "aprobado", "incluido_en_nomina", "pagado", "anulado"]).default("aprobado")
});

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = paymentSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "hr_payment_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("hr_payment_items").insert({
    amount: body.amount,
    approved_at: body.status === "aprobado" ? new Date().toISOString() : null,
    approved_by: body.status === "aprobado" ? ctx.user.id : null,
    created_by: ctx.user.id,
    employee_id: body.employeeId,
    glosa: body.glosa || null,
    payment_type: body.paymentType,
    period: body.period,
    scheduled_date: body.scheduledDate || null,
    status: body.status,
    tenant_id: ctx.membership.tenant_id
  }).select("id").single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "hr_payment_create_failed" }, { status: 422 });
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: body,
    company_id: ctx.membership.company_id,
    entity_id: data.id,
    entity_type: "hr_payment_item",
    event_type: "hr.payment_item_created",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ ok: true, payment: data });
}
