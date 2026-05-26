import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { normalizeRut } from "@/lib/hr/utils";
import { createAdminClient } from "@/lib/supabase/admin";

const employeeSchema = z.object({
  address: z.string().trim().max(240).optional().default(""),
  afp: z.string().trim().max(120).optional().default(""),
  area: z.string().trim().max(120).optional().default(""),
  bankAccount: z.string().trim().max(80).optional().default(""),
  bankCode: z.string().trim().max(40).optional().default(""),
  bankName: z.string().trim().max(160).optional().default(""),
  birthDate: z.string().trim().optional().default(""),
  commune: z.string().trim().max(120).optional().default(""),
  contractType: z.enum(["contratado", "part_time", "honorarios"]).default("contratado"),
  costCenter: z.string().trim().max(120).optional().default(""),
  emailPayment: z.string().trim().email().or(z.literal("")).optional().default(""),
  familyAllowances: z.coerce.number().int().min(0).max(20).optional().default(0),
  fullName: z.string().trim().min(2).max(240),
  healthPlan: z.string().trim().max(120).optional().default(""),
  healthSystem: z.string().trim().max(120).optional().default(""),
  hireDate: z.string().trim().optional().default(""),
  nationality: z.string().trim().max(120).optional().default(""),
  paymentEnabled: z.coerce.boolean().optional().default(false),
  personalEmail: z.string().trim().email().or(z.literal("")).optional().default(""),
  phone: z.string().trim().max(80).optional().default(""),
  position: z.string().trim().max(160).optional().default(""),
  rut: z.string().trim().min(7).max(14),
  salary: z.coerce.number().min(0).optional().default(0),
  status: z.enum(["activo", "inactivo", "finiquitado", "suspendido"]).default("activo"),
  titularCuenta: z.string().trim().max(240).optional().default(""),
  titularRut: z.string().trim().max(14).optional().default(""),
  tipoCuenta: z.string().trim().max(80).optional().default(""),
  unemploymentInsurance: z.coerce.boolean().optional().default(true),
  workEmail: z.string().trim().email().or(z.literal("")).optional().default(""),
  workSchedule: z.string().trim().max(120).optional().default("")
});

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = employeeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "employee_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const body = parsed.data;
  const supabase = createAdminClient();
  const rut = normalizeRut(body.rut);
  const duplicate = await supabase.from("hr_employees").select("id").eq("tenant_id", ctx.membership.tenant_id).eq("rut", rut).maybeSingle();
  if (duplicate.data) return NextResponse.json({ ok: false, error: "employee_rut_exists" }, { status: 409 });

  const { data: employee, error } = await supabase.from("hr_employees").insert({
    address: body.address || null,
    afp: body.afp || null,
    area: body.area || null,
    base_salary: body.salary,
    birth_date: body.birthDate || null,
    commune: body.commune || null,
    company_id: ctx.membership.company_id,
    contract_type: body.contractType,
    cost_center: body.costCenter || null,
    created_by: ctx.user.id,
    family_allowances: body.familyAllowances,
    full_name: body.fullName,
    health_plan: body.healthPlan || null,
    health_system: body.healthSystem || null,
    hire_date: body.hireDate || null,
    nationality: body.nationality || null,
    payment_enabled: body.paymentEnabled && body.status === "activo",
    payment_enabled_at: body.paymentEnabled && body.status === "activo" ? new Date().toISOString() : null,
    payment_enabled_by: body.paymentEnabled && body.status === "activo" ? ctx.user.id : null,
    personal_email: body.personalEmail || null,
    phone: body.phone || null,
    position: body.position || null,
    rut,
    status: body.status,
    tenant_id: ctx.membership.tenant_id,
    unemployment_insurance: body.unemploymentInsurance,
    work_email: body.workEmail || null,
    work_schedule: body.workSchedule || null
  }).select("id,tenant_id,company_id,rut,full_name").single();

  if (error || !employee) return NextResponse.json({ ok: false, error: error?.message ?? "employee_create_failed" }, { status: 422 });

  if (body.bankName || body.bankAccount || body.bankCode) {
    await supabase.from("hr_employee_bank_accounts").insert({
      account_holder_name: body.titularCuenta || body.fullName,
      account_holder_rut: normalizeRut(body.titularRut || body.rut),
      account_number: body.bankAccount || null,
      account_type: body.tipoCuenta || null,
      bank_code: body.bankCode || null,
      bank_name: body.bankName || null,
      created_by: ctx.user.id,
      employee_id: employee.id,
      payment_email: body.emailPayment || body.workEmail || body.personalEmail || null,
      tenant_id: ctx.membership.tenant_id,
      validation_status: body.bankName && body.bankCode && body.bankAccount ? "validated" : "pending"
    });
  }

  await supabase.from("hr_vacation_balances").insert({
    created_by: ctx.user.id,
    employee_id: employee.id,
    tenant_id: ctx.membership.tenant_id
  });
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: body,
    company_id: ctx.membership.company_id,
    entity_id: employee.id,
    entity_type: "hr_employee",
    event_type: "hr.employee_created",
    tenant_id: ctx.membership.tenant_id
  });

  return NextResponse.json({ ok: true, employee });
}
