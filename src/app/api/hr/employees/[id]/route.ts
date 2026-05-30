import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { normalizeRut } from "@/lib/hr/utils";
import { createAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({
  address: z.string().trim().max(240).optional(),
  area: z.string().trim().max(120).optional(),
  bankAccount: z.string().trim().optional(),
  bankCode: z.string().trim().optional(),
  bankName: z.string().trim().optional(),
  commune: z.string().trim().max(120).optional(),
  costCenter: z.string().trim().max(120).optional(),
  emailPayment: z.string().trim().email().or(z.literal("")).optional(),
  fullName: z.string().trim().min(2).optional(),
  hireDate: z.string().date().or(z.literal("")).optional(),
  paymentEnabled: z.boolean().optional(),
  personalEmail: z.string().trim().email().or(z.literal("")).optional(),
  phone: z.string().trim().max(80).optional(),
  position: z.string().trim().max(160).optional(),
  reason: z.string().trim().max(500).optional(),
  salary: z.coerce.number().min(0).optional(),
  status: z.enum(["activo", "inactivo", "finiquitado", "suspendido"]).optional(),
  tipoCuenta: z.string().trim().optional(),
  titularCuenta: z.string().trim().optional(),
  titularRut: z.string().trim().optional(),
  workEmail: z.string().trim().email().or(z.literal("")).optional()
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
  if (body.address !== undefined) employeeUpdate.address = body.address || null;
  if (body.area !== undefined) employeeUpdate.area = body.area || null;
  if (body.commune !== undefined) employeeUpdate.commune = body.commune || null;
  if (body.costCenter !== undefined) employeeUpdate.cost_center = body.costCenter || null;
  if (body.fullName) employeeUpdate.full_name = body.fullName;
  if (body.hireDate !== undefined) employeeUpdate.hire_date = body.hireDate || null;
  if (body.personalEmail !== undefined) employeeUpdate.personal_email = body.personalEmail || null;
  if (body.phone !== undefined) employeeUpdate.phone = body.phone || null;
  if (body.position !== undefined) employeeUpdate.position = body.position || null;
  if (body.salary !== undefined) employeeUpdate.base_salary = body.salary;
  if (body.status) employeeUpdate.status = body.status;
  if (body.workEmail !== undefined) employeeUpdate.work_email = body.workEmail || null;
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
