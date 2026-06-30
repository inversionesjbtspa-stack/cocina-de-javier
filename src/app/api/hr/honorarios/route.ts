import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  accountNumber: z.string().trim().min(3).max(80),
  accountType: z.string().trim().min(2).max(80),
  amount: z.coerce.number().positive(),
  bankCode: z.string().trim().min(1).max(20),
  bankName: z.string().trim().min(2).max(120),
  employeeId: z.string().uuid().optional().or(z.literal("")).default(""),
  fullName: z.string().trim().min(3).max(180),
  glosa: z.string().trim().max(240).optional().default(""),
  observation: z.string().trim().max(1000).optional().default(""),
  paymentEmail: z.string().trim().email().or(z.literal("")).optional().default(""),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  rut: z.string().trim().min(6).max(20),
  status: z.enum(["pendiente_pago", "en_nomina", "pagado", "retenido", "anulado"]).default("pendiente_pago")
});

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "hr_honorario_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();

  const payment = await supabase.from("hr_payment_items").insert({
    account_number: body.accountNumber,
    account_type: body.accountType,
    amount: body.amount,
    approved_at: body.status !== "anulado" ? new Date().toISOString() : null,
    approved_by: body.status !== "anulado" ? ctx.user.id : null,
    bank_code: body.bankCode,
    bank_name: body.bankName,
    created_by: ctx.user.id,
    employee_id: body.employeeId || null,
    glosa: body.glosa || `Honorarios ${body.period}`,
    metadata: { full_name: body.fullName, rut: body.rut },
    payment_email: body.paymentEmail || null,
    payment_type: "honorarios",
    period: body.period,
    source_type: "honorarios",
    status: body.status,
    tenant_id: ctx.membership.tenant_id
  }).select("id").single();

  const { data, error } = await supabase.from("hr_honorarios").insert({
    account_number: body.accountNumber,
    account_type: body.accountType,
    amount: body.amount,
    bank_code: body.bankCode,
    bank_name: body.bankName,
    created_by: ctx.user.id,
    employee_id: body.employeeId || null,
    full_name: body.fullName,
    glosa: body.glosa || `Honorarios ${body.period}`,
    observation: body.observation || null,
    payment_email: body.paymentEmail || null,
    payment_item_id: payment.data?.id ?? null,
    period: body.period,
    rut: body.rut,
    status: body.status,
    tenant_id: ctx.membership.tenant_id
  }).select("id").single();

  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "hr_honorario_create_failed" }, { status: 422 });
  if (payment.data?.id) await supabase.from("hr_payment_items").update({ source_id: data.id }).eq("id", payment.data.id);
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { ...body, payment_item_id: payment.data?.id ?? null },
    company_id: ctx.membership.company_id,
    entity_id: data.id,
    entity_type: "hr_honorario",
    event_type: "hr.honorario_created",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ ok: true, honorario: data, paymentItemId: payment.data?.id ?? null });
}
