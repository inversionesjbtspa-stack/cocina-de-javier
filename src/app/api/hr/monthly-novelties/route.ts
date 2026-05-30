import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const noveltySchema = z.object({
  amount: z.coerce.number().min(0).optional().default(0),
  employeeId: z.string().uuid(),
  hours: z.coerce.number().min(0).optional().default(0),
  notes: z.string().trim().max(1000).optional().default(""),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  quantity: z.coerce.number().min(0).optional().default(0),
  status: z.enum(["borrador", "confirmada", "anulada"]).optional().default("confirmada"),
  type: z.enum([
    "inasistencia",
    "licencia",
    "horas_extras",
    "recargo_domingo",
    "bono_compensatorio",
    "bono_produccion",
    "bono_responsabilidad",
    "aguinaldo",
    "anticipo",
    "prestamo_empresa",
    "prestamo_ccaf",
    "honorarios",
    "finiquito",
    "descuento",
    "observacion"
  ])
});

const payableTypes = new Set(["anticipo", "bono_compensatorio", "bono_produccion", "bono_responsabilidad", "aguinaldo", "honorarios", "finiquito"]);

function paymentTypeFor(type: string) {
  if (type === "bono_produccion" || type === "bono_responsabilidad") return "bono_extra";
  if (type === "prestamo_empresa" || type === "prestamo_ccaf") return "prestamo_trabajador";
  return type;
}

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = noveltySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "hr_monthly_novelty_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  const body = parsed.data;
  const supabase = createAdminClient();
  const before = await supabase
    .from("hr_monthly_novelties")
    .select("*")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("employee_id", body.employeeId)
    .eq("period", body.period)
    .eq("novelty_type", body.type)
    .maybeSingle();

  const result = await supabase
    .from("hr_monthly_novelties")
    .upsert({
      amount: body.amount,
      employee_id: body.employeeId,
      hours: body.hours,
      notes: body.notes || null,
      novelty_type: body.type,
      period: body.period,
      quantity: body.quantity,
      status: body.status,
      tenant_id: ctx.membership.tenant_id,
      updated_by: ctx.user.id,
      ...(before.data ? {} : { created_by: ctx.user.id })
    }, { onConflict: "tenant_id,employee_id,period,novelty_type" })
    .select("id")
    .single();

  if (result.error || !result.data) {
    return NextResponse.json({ ok: false, error: result.error?.message ?? "hr_monthly_novelty_save_failed" }, { status: 422 });
  }

  let paymentItemId: string | null = null;
  if (payableTypes.has(body.type) && body.amount > 0 && body.status !== "anulada") {
    const existingPayment = await supabase
      .from("hr_payment_items")
      .select("id,status")
      .eq("tenant_id", ctx.membership.tenant_id)
      .eq("employee_id", body.employeeId)
      .eq("period", body.period)
      .eq("payment_type", paymentTypeFor(body.type))
      .maybeSingle();
    if (existingPayment.data?.id) {
      await supabase
        .from("hr_payment_items")
        .update({ amount: body.amount, glosa: null, status: existingPayment.data.status === "pagado" ? "pagado" : "aprobado" })
        .eq("id", existingPayment.data.id);
      paymentItemId = existingPayment.data.id;
    } else {
      const payment = await supabase
        .from("hr_payment_items")
        .insert({
          amount: body.amount,
          approved_at: new Date().toISOString(),
          approved_by: ctx.user.id,
          created_by: ctx.user.id,
          employee_id: body.employeeId,
          payment_type: paymentTypeFor(body.type),
          period: body.period,
          status: "aprobado",
          tenant_id: ctx.membership.tenant_id
        })
        .select("id")
        .single();
      paymentItemId = payment.data?.id ?? null;
    }
  }

  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { ...body, payment_item_id: paymentItemId },
    before_data: before.data,
    company_id: ctx.membership.company_id,
    entity_id: result.data.id,
    entity_type: "hr_monthly_novelty",
    event_type: before.data ? "hr.monthly_novelty_updated" : "hr.monthly_novelty_created",
    tenant_id: ctx.membership.tenant_id
  });

  return NextResponse.json({ ok: true, novelty: result.data, paymentItemId });
}
