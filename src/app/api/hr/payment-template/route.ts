import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { generateSantanderTemplateFromRows, type SantanderBankPaymentRow } from "@/lib/payments/santander-template";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  glosaGlobal: z.string().trim().max(160).optional().default(""),
  paymentItemIds: z.array(z.string().uuid()).min(1),
  payDate: z.string().date().optional().or(z.literal("")).default(""),
  selectionFilters: z.record(z.unknown()).optional().default({}),
  trancheLabel: z.string().trim().max(120).optional().default("")
});

type InvalidHrPayment = {
  alerts: string[];
  employeeId: string;
  employeeName: string;
  itemId: string;
  rut: string;
};

const paymentLabels: Record<string, string> = {
  aguinaldo: "Aguinaldo",
  anticipo: "Anticipo",
  bono_compensatorio: "Bono compensatorio",
  bono_extra: "Bono extra",
  compensacion: "Compensacion",
  finiquito: "Finiquito",
  honorarios: "Honorarios",
  remuneracion_mensual: "Remuneracion"
};

function glosaFor(paymentType: string, period: string) {
  const [year, month] = period.split("-");
  const date = new Date(`${period}-01T00:00:00`);
  const monthName = Number.isNaN(date.valueOf()) ? month : date.toLocaleDateString("es-CL", { month: "long" });
  return `${paymentLabels[paymentType] ?? paymentType.replace(/_/g, " ")} ${monthName} ${year}`.trim();
}

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "hr_payment_template_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("hr_payment_items")
    .select("id,employee_id,payment_type,period,amount,glosa,status,bank_name,bank_code,account_type,account_number,payment_email,metadata,hr_employees(id,rut,full_name,status,payment_enabled,personal_email,work_email,hr_employee_bank_accounts(bank_name,bank_code,account_type,account_number,payment_email,account_holder_name,account_holder_rut,validation_status))")
    .eq("tenant_id", ctx.membership.tenant_id)
    .in("id", body.paymentItemIds);

  const invalid: InvalidHrPayment[] = [];
  const rows: SantanderBankPaymentRow[] = [];
  for (const item of data ?? []) {
    const employee = Array.isArray(item.hr_employees) ? item.hr_employees[0] : item.hr_employees;
    const bank = employee?.hr_employee_bank_accounts?.[0];
    const metadata = (item.metadata ?? {}) as Record<string, unknown>;
    const fallbackName = String(metadata.full_name ?? metadata.name ?? "");
    const fallbackRut = String(metadata.rut ?? "");
    const fallbackBank = {
      account_number: item.account_number ?? String(metadata.account_number ?? ""),
      account_type: item.account_type ?? String(metadata.account_type ?? ""),
      bank_code: item.bank_code ?? String(metadata.bank_code ?? ""),
      bank_name: item.bank_name ?? String(metadata.bank_name ?? ""),
      payment_email: item.payment_email ?? String(metadata.payment_email ?? "")
    };
    const payeeName = employee?.full_name ?? fallbackName;
    const payeeRut = employee?.rut ?? fallbackRut;
    const payeeBank = bank ?? fallbackBank;
    const alerts: string[] = [];
    if (!payeeRut) alerts.push("RUT");
    if (!payeeName) alerts.push("nombre");
    if (employee && employee.status !== "activo") alerts.push("trabajador no activo");
    if (employee && !employee.payment_enabled) alerts.push("pagos inhabilitados");
    if (!payeeBank?.bank_name) alerts.push("banco");
    if (!payeeBank?.bank_code) alerts.push("codigo banco");
    if (!payeeBank?.account_type) alerts.push("tipo cuenta");
    if (!payeeBank?.account_number) alerts.push("numero cuenta");
    if (!(payeeBank?.payment_email || employee?.work_email || employee?.personal_email)) alerts.push("email pago");
    if (Number(item.amount ?? 0) <= 0) alerts.push("monto");
    if (!["aprobado", "pendiente_pago"].includes(item.status)) alerts.push("no aprobado");
    if (alerts.length || !payeeBank) {
      invalid.push({ alerts, employeeId: employee?.id ?? "", employeeName: payeeName || "Trabajador sin ficha", itemId: item.id, rut: payeeRut });
      continue;
    }
    const glosa = item.glosa || body.glosaGlobal || glosaFor(item.payment_type, item.period);
    rows.push({
      amount: Number(item.amount),
      folio: item.period.replace("-", ""),
      glosa,
      payableId: item.id,
      supplier: {
        bankAccount: payeeBank.account_number ?? "",
        bankCode: payeeBank.bank_code ?? "",
        businessName: payeeName,
        code: "",
        email: payeeBank.payment_email || employee?.work_email || employee?.personal_email || "",
        rut: payeeRut
      }
    });
  }

  if (!rows.length) {
    return NextResponse.json({ ok: false, error: "hr_payment_validation_failed", invalid }, { status: 422 });
  }

  const buffer = generateSantanderTemplateFromRows(rows);
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const first = data?.[0];
  const batch = await supabase.from("hr_payment_batches").insert({
    generated_by: ctx.user.id,
    glosa_global: body.glosaGlobal || null,
    metadata: { payment_item_ids: rows.map((row) => row.payableId), tranche_label: body.trancheLabel || null },
    payment_type: first?.payment_type ?? null,
    period: first?.period ?? new Date().toISOString().slice(0, 7),
    selection_filters: body.selectionFilters,
    status: "generada",
    tenant_id: ctx.membership.tenant_id,
    total_amount: totalAmount,
    total_employees: rows.length,
    tranche_label: body.trancheLabel || null
  }).select("id").single();
  if (batch.data) {
    await supabase.from("hr_payment_batch_items").insert(rows.map((row) => ({
      amount: row.amount,
      batch_id: batch.data.id,
      employee_id: (data ?? []).find((item) => item.id === row.payableId)?.employee_id,
      glosa: row.glosa,
      payment_item_id: row.payableId,
      payment_type: (data ?? []).find((item) => item.id === row.payableId)?.payment_type ?? "otro",
      status: "en_nomina",
      tenant_id: ctx.membership.tenant_id
    })));
  }
  await supabase.from("hr_payment_items").update({ status: "en_nomina" }).in("id", rows.map((row) => row.payableId));
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { count: rows.length, invalid_count: invalid.length, total_amount: totalAmount },
    company_id: ctx.membership.company_id,
    entity_id: batch.data?.id ?? null,
    entity_type: "hr_payment_batch",
    event_type: "hr.payment_batch_generated",
    tenant_id: ctx.membership.tenant_id
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Disposition": 'attachment; filename="Template Pagos JESUS - RRHH.xlsx"',
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-HR-Payment-Excluded": String(invalid.length),
      "X-HR-Payment-Rows": String(rows.length)
    }
  });
}
