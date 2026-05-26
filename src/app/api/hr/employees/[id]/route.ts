import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { normalizeRut } from "@/lib/hr/utils";
import { createAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({
  bankAccount: z.string().trim().optional(),
  bankCode: z.string().trim().optional(),
  bankName: z.string().trim().optional(),
  emailPayment: z.string().trim().email().or(z.literal("")).optional(),
  fullName: z.string().trim().min(2).optional(),
  paymentEnabled: z.boolean().optional(),
  reason: z.string().trim().max(500).optional(),
  status: z.enum(["activo", "inactivo", "finiquitado", "suspendido"]).optional(),
  tipoCuenta: z.string().trim().optional(),
  titularCuenta: z.string().trim().optional(),
  titularRut: z.string().trim().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "employee_update_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  const before = await supabase.from("hr_employees").select("*,hr_employee_bank_accounts(*)").eq("tenant_id", ctx.membership.tenant_id).eq("id", id).maybeSingle();
  if (!before.data) return NextResponse.json({ ok: false, error: "employee_not_found" }, { status: 404 });
  const employeeUpdate: Record<string, unknown> = { updated_by: ctx.user.id };
  if (body.fullName) employeeUpdate.full_name = body.fullName;
  if (body.status) employeeUpdate.status = body.status;
  if (typeof body.paymentEnabled === "boolean") {
    employeeUpdate.payment_enabled = body.paymentEnabled && (body.status ?? before.data.status) === "activo";
    employeeUpdate.payment_toggle_reason = body.reason ?? null;
    if (employeeUpdate.payment_enabled) {
      employeeUpdate.payment_enabled_at = new Date().toISOString();
      employeeUpdate.payment_enabled_by = ctx.user.id;
    } else {
      employeeUpdate.payment_disabled_at = new Date().toISOString();
      employeeUpdate.payment_disabled_by = ctx.user.id;
    }
  }
  await supabase.from("hr_employees").update(employeeUpdate).eq("id", id).eq("tenant_id", ctx.membership.tenant_id);

  if (body.bankName !== undefined || body.bankCode !== undefined || body.bankAccount !== undefined || body.tipoCuenta !== undefined || body.emailPayment !== undefined) {
    const bank = Array.isArray(before.data.hr_employee_bank_accounts) ? before.data.hr_employee_bank_accounts[0] : before.data.hr_employee_bank_accounts;
    const payload = {
      account_holder_name: body.titularCuenta ?? before.data.full_name,
      account_holder_rut: normalizeRut(body.titularRut ?? before.data.rut),
      account_number: body.bankAccount ?? bank?.account_number ?? null,
      account_type: body.tipoCuenta ?? bank?.account_type ?? null,
      bank_code: body.bankCode ?? bank?.bank_code ?? null,
      bank_name: body.bankName ?? bank?.bank_name ?? null,
      employee_id: id,
      payment_email: body.emailPayment ?? bank?.payment_email ?? before.data.work_email ?? before.data.personal_email ?? null,
      tenant_id: ctx.membership.tenant_id,
      updated_by: ctx.user.id,
      validation_status: body.bankName && body.bankCode && body.bankAccount ? "validated" : "pending"
    };
    if (bank?.id) {
      await supabase.from("hr_employee_bank_accounts").update(payload).eq("id", bank.id);
    } else {
      await supabase.from("hr_employee_bank_accounts").insert({ ...payload, created_by: ctx.user.id });
    }
  }

  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: body,
    before_data: before.data,
    company_id: ctx.membership.company_id,
    entity_id: id,
    entity_type: "hr_employee",
    event_type: "hr.employee_updated",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ ok: true });
}
