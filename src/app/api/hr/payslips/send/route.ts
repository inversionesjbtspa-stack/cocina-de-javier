import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  payslipIds: z.array(z.string().uuid()).min(1),
  resend: z.boolean().optional().default(false)
});

function hasMailTransport() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN
  );
}

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "hr_payslip_send_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  const { data: payslips } = await supabase
    .from("hr_payslips")
    .select("id,employee_id,period,send_attempts,resend_count,hr_employees(id,full_name,personal_email,work_email,hr_employee_bank_accounts(payment_email))")
    .eq("tenant_id", ctx.membership.tenant_id)
    .in("id", body.payslipIds);

  const results = [];
  for (const payslip of payslips ?? []) {
    const employee = Array.isArray(payslip.hr_employees) ? payslip.hr_employees[0] : payslip.hr_employees;
    const bank = employee?.hr_employee_bank_accounts?.[0];
    const email = bank?.payment_email || employee?.work_email || employee?.personal_email || "";
    const paidPayment = await supabase
      .from("hr_payment_items")
      .select("id,status")
      .eq("tenant_id", ctx.membership.tenant_id)
      .eq("employee_id", payslip.employee_id)
      .eq("period", payslip.period)
      .eq("status", "pagado")
      .limit(1)
      .maybeSingle();

    let status = "pendiente";
    let error: string | null = null;
    if (!paidPayment.data?.id) {
      status = "bloqueado";
      error = "La liquidacion solo puede enviarse despues de marcar el pago como pagado.";
    } else if (!email) {
      status = "bloqueado";
      error = "El trabajador no tiene email valido.";
    } else if (!hasMailTransport()) {
      status = "error_configuracion_envio";
      error = "No hay transporte Gmail OAuth/SMTP configurado para envio real.";
    } else {
      status = "preparado";
      error = "Backend preparado; envio real queda pendiente de integrar transporte Gmail API/SMTP.";
    }

    await supabase.from("hr_payslip_send_events").insert({
      employee_id: payslip.employee_id,
      error,
      payment_item_id: paidPayment.data?.id ?? null,
      payslip_id: payslip.id,
      recipient_email: email || null,
      sent_at: status === "enviado" ? new Date().toISOString() : null,
      sent_by: ctx.user.id,
      status,
      tenant_id: ctx.membership.tenant_id
    });
    await supabase.from("hr_payslips").update({
      last_send_attempt_at: new Date().toISOString(),
      last_send_error: error,
      resend_count: body.resend ? Number(payslip.resend_count ?? 0) + 1 : undefined,
      send_attempts: Number(payslip.send_attempts ?? 0) + 1,
      send_status: status,
      sent_at: status === "enviado" ? new Date().toISOString() : undefined,
      sent_by: ctx.user.id
    }).eq("id", payslip.id);
    await supabase.from("audit_events").insert({
      actor_role: ctx.membership.role,
      actor_user_id: ctx.user.id,
      after_data: { email_present: Boolean(email), error, payment_item_id: paidPayment.data?.id ?? null, resend: body.resend, status },
      company_id: ctx.membership.company_id,
      entity_id: payslip.id,
      entity_type: "hr_payslip",
      event_type: body.resend ? "hr.payslip_resent" : "hr.payslip_send_requested",
      tenant_id: ctx.membership.tenant_id
    });
    results.push({ error, payslipId: payslip.id, status });
  }

  return NextResponse.json({ ok: true, results });
}
