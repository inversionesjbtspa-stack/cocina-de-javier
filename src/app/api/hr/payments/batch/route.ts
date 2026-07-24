import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { validatePaymentBatchEmployee } from "@/lib/hr/payment-batch";
import { createAdminClient } from "@/lib/supabase/admin";

const itemSchema = z.object({
  amount: z.coerce.number().positive(),
  employeeId: z.string().uuid(),
  glosa: z.string().trim().max(240).optional().default("")
});

const batchSchema = z.object({
  conceptDescription: z.string().trim().max(160).optional().default(""),
  confirmDuplicates: z.coerce.boolean().optional().default(false),
  glosaGlobal: z.string().trim().max(240).optional().default(""),
  items: z.array(itemSchema).min(1),
  paymentType: z.string().trim().min(2).max(80),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  scheduledDate: z.string().date().optional().or(z.literal("")).default(""),
  status: z.enum(["borrador", "pendiente_pago", "aprobado"]).default("aprobado")
});

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = batchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "hr_payment_batch_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();

  const duplicateCheck = await supabase
    .from("hr_payment_items")
    .select("id,employee_id,payment_type,period,hr_employees(full_name,rut)")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("period", body.period)
    .eq("payment_type", body.paymentType)
    .in("employee_id", body.items.map((item) => item.employeeId))
    .neq("status", "anulado");

  const duplicates = duplicateCheck.data ?? [];
  if (duplicates.length && !body.confirmDuplicates) {
    return NextResponse.json({ ok: false, error: "hr_payment_duplicates_need_confirmation", duplicates }, { status: 409 });
  }

  const concept = await supabase
    .from("hr_payment_concepts")
    .select("code,active,requires_description")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("code", body.paymentType)
    .maybeSingle();
  if (!concept.data?.active) return NextResponse.json({ ok: false, error: "hr_payment_concept_invalid" }, { status: 422 });
  if (concept.data.requires_description && !body.conceptDescription) return NextResponse.json({ ok: false, error: "hr_payment_concept_description_required" }, { status: 422 });

  const employees = await supabase
    .from("hr_employees")
    .select("id,full_name,rut,status,payment_enabled,personal_email,work_email,hr_employee_bank_accounts(bank_name,bank_code,account_type,account_number,payment_email,account_holder_rut,validation_status)")
    .eq("tenant_id", ctx.membership.tenant_id)
    .in("id", body.items.map((item) => item.employeeId));

  const employeeById = new Map((employees.data ?? []).map((employee) => [employee.id, employee]));
  const invalid = body.items
    .map((item) => validatePaymentBatchEmployee(employeeById.get(item.employeeId), item.employeeId))
    .filter((item) => item !== null);
  if (invalid.length) {
    return NextResponse.json({ ok: false, error: "hr_payment_batch_invalid_rows", invalid }, { status: 422 });
  }

  const rows = body.items.map((item) => {
    const employee = employeeById.get(item.employeeId);
    const bank = Array.isArray(employee?.hr_employee_bank_accounts) ? employee?.hr_employee_bank_accounts[0] : null;
    return {
      amount: item.amount,
      account_number: bank?.account_number ?? null,
      account_type: bank?.account_type ?? null,
      approved_at: body.status === "aprobado" ? new Date().toISOString() : null,
      approved_by: body.status === "aprobado" ? ctx.user.id : null,
      bank_code: bank?.bank_code ?? null,
      bank_name: bank?.bank_name ?? null,
      created_by: ctx.user.id,
      employee_id: item.employeeId,
      glosa: item.glosa || body.glosaGlobal || null,
      metadata: { concept_description: body.conceptDescription || null, created_from: "selectable_payroll_batch" },
      payment_email: bank?.payment_email || employee?.work_email || employee?.personal_email || null,
      payment_type: body.paymentType,
      period: body.period,
      scheduled_date: body.scheduledDate || null,
      status: body.status,
      tenant_id: ctx.membership.tenant_id
    };
  });

  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  const created = await supabase.rpc("hr_create_payment_batch", {
    p_actor_role: ctx.membership.role,
    p_company_id: ctx.membership.company_id,
    p_items: rows,
    p_metadata: { concept_description: body.conceptDescription || null },
    p_payment_type: body.paymentType,
    p_period: body.period,
    p_tenant_id: ctx.membership.tenant_id,
    p_total_amount: totalAmount,
    p_user_id: ctx.user.id,
    p_glosa_global: body.glosaGlobal || null
  });
  if (created.error) return NextResponse.json({ ok: false, error: created.error.message }, { status: 422 });

  return NextResponse.json({ ok: true, batch: created.data, created: rows.length, invalid: [] });
}
