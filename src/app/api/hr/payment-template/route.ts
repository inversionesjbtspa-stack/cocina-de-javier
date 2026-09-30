import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { buildHrTefPreview, generateHrTefWorkbook, type HrPaymentForTef } from "@/lib/hr/bank-tef";
import { isTechnicalValidationEmployee } from "@/lib/hr/employee-filters";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  glosaGlobal: z.string().trim().max(160).optional().default(""),
  mode: z.enum(["preview", "export"]).optional().default("export"),
  paymentItemIds: z.array(z.string().uuid()).optional().default([]),
  payDate: z.string().date().optional().or(z.literal("")).default(""),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  selectionFilters: z.record(z.unknown()).optional().default({}),
  trancheLabel: z.string().trim().max(120).optional().default("")
});

type PaymentRow = {
  account_number: string | null;
  account_type: string | null;
  amount: number | string;
  bank_code: string | null;
  bank_name: string | null;
  employee_id: string;
  glosa: string | null;
  id: string;
  payment_email: string | null;
  payment_type: string;
  period: string;
  status: string;
  hr_employees?: {
    full_name: string;
    rut: string;
    status: string;
    payment_enabled: boolean;
    personal_email: string | null;
    work_email: string | null;
    hr_employee_bank_accounts?: Array<{
      account_holder_name: string | null;
      account_holder_rut: string | null;
      account_number: string | null;
      account_type: string | null;
      bank_code: string | null;
      bank_name: string | null;
      payment_email: string | null;
      real_owner_name?: string | null;
      tef_display_name?: string | null;
      validation_status: string | null;
    }>;
  } | Array<{
    full_name: string;
    rut: string;
    status: string;
    payment_enabled: boolean;
    personal_email: string | null;
    work_email: string | null;
    hr_employee_bank_accounts?: Array<{
      account_holder_name: string | null;
      account_holder_rut: string | null;
      account_number: string | null;
      account_type: string | null;
      bank_code: string | null;
      bank_name: string | null;
      payment_email: string | null;
      real_owner_name?: string | null;
      tef_display_name?: string | null;
      validation_status: string | null;
    }>;
  }>;
};

function employeeFrom(row: PaymentRow) {
  return Array.isArray(row.hr_employees) ? row.hr_employees[0] : row.hr_employees;
}

function paymentRowsForPreview(rows: PaymentRow[], glosaGlobal = ""): HrPaymentForTef[] {
  return rows.filter((row) => {
    const employee = employeeFrom(row);
    return !isTechnicalValidationEmployee({ fullName: employee?.full_name, rut: employee?.rut });
  }).map((row) => {
    const employee = employeeFrom(row);
    const bank = employee?.hr_employee_bank_accounts?.[0];
    return {
      accountNumber: row.account_number ?? bank?.account_number ?? "",
      accountType: row.account_type ?? bank?.account_type ?? "",
      amount: Number(row.amount ?? 0),
      bankCode: row.bank_code ?? bank?.bank_code ?? "",
      bankName: row.bank_name ?? bank?.bank_name ?? "",
      employeeId: row.employee_id,
      employeeName: employee?.full_name ?? "Trabajador",
      employeeRut: employee?.rut ?? "",
      glosa: row.glosa || glosaGlobal,
      holderName: bank?.account_holder_name ?? employee?.full_name ?? "",
      holderRut: bank?.account_holder_rut ?? employee?.rut ?? "",
      id: row.id,
      paymentEmail: row.payment_email ?? bank?.payment_email ?? employee?.work_email ?? employee?.personal_email ?? "",
      paymentType: row.payment_type,
      period: row.period,
      realOwnerName: bank?.real_owner_name ?? bank?.account_holder_name ?? employee?.full_name ?? "",
      tefDisplayName: bank?.tef_display_name ?? bank?.account_holder_name ?? employee?.full_name ?? "",
      status: row.status
    };
  });
}

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "hr_payment_template_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();

  let query = supabase
    .from("hr_payment_items")
    .select("id,employee_id,payment_type,period,amount,glosa,status,bank_name,bank_code,account_type,account_number,payment_email,hr_employees(full_name,rut,status,payment_enabled,personal_email,work_email,hr_employee_bank_accounts(bank_name,bank_code,account_type,account_number,payment_email,account_holder_name,account_holder_rut,real_owner_name,tef_display_name,validation_status))")
    .eq("tenant_id", ctx.membership.tenant_id);
  if (body.paymentItemIds.length) query = query.in("id", body.paymentItemIds);
  else if (body.period) query = query.eq("period", body.period).eq("payment_type", "remuneracion_mensual").in("status", ["aprobado", "pendiente_pago"]);
  else return NextResponse.json({ ok: false, error: "hr_payment_template_selection_required" }, { status: 422 });

  const [{ data }, { data: activeBatchItems }] = await Promise.all([
    query,
    supabase.from("hr_payment_batch_items").select("payment_item_id,hr_payment_batches(status)").eq("tenant_id", ctx.membership.tenant_id)
  ]);
  const activePaymentIds = (activeBatchItems ?? []).filter((item) => {
    const batch = Array.isArray(item.hr_payment_batches) ? item.hr_payment_batches[0] : item.hr_payment_batches;
    return batch && !["cancelada", "pagada"].includes(batch.status);
  }).map((item) => String(item.payment_item_id));

  const preview = buildHrTefPreview(paymentRowsForPreview((data ?? []) as PaymentRow[], body.glosaGlobal), activePaymentIds);
  if (body.mode === "preview") {
    return NextResponse.json({ ok: true, preview });
  }
  if (!preview.rows.some((row) => row.status === "LISTO" || row.status === "CUENTA DE TERCERO / REVISAR")) {
    return NextResponse.json({ ok: false, error: "hr_payment_validation_failed", preview }, { status: 422 });
  }
  const blocking = preview.rows.filter((row) => row.status === "BANCO INCOMPLETO" || row.status === "DUPLICADO");
  if (blocking.length) {
    return NextResponse.json({ ok: false, error: "hr_payment_template_has_blocking_rows", preview }, { status: 422 });
  }

  const buffer = generateHrTefWorkbook(preview.rows);
  const first = (data ?? [])[0] as PaymentRow | undefined;
  const batch = await supabase.from("hr_payment_batches").insert({
    generated_by: ctx.user.id,
    glosa_global: body.glosaGlobal || null,
    metadata: {
      file_format: "TEF_A_K_PAGO",
      origin_account: "71068862",
      preview_summary: preview.summary,
      source_payment_item_ids: preview.rows.map((row) => row.itemId),
      tranche_label: body.trancheLabel || null
    },
    payment_type: first?.payment_type ?? "remuneracion_mensual",
    period: first?.period ?? body.period ?? new Date().toISOString().slice(0, 7),
    selection_filters: body.selectionFilters,
    status: "archivo_generado",
    tenant_id: ctx.membership.tenant_id,
    total_amount: preview.summary.totalAmount,
    total_employees: preview.summary.included,
    tranche_label: body.trancheLabel || null
  }).select("id").single();

  if (batch.data) {
    await supabase.from("hr_payment_batch_items").insert(preview.rows.filter((row) => row.status === "LISTO" || row.status === "CUENTA DE TERCERO / REVISAR").map((row) => ({
      amount: row.amount,
      account_holder_name_snapshot: row.holderName,
      account_number_snapshot: row.accountNumber,
      bank_code_snapshot: row.bankCode,
      batch_id: batch.data.id,
      employee_id: row.employeeId,
      employee_name_snapshot: row.employeeName,
      glosa: row.glosaTef,
      glosa_correo_snapshot: row.glosaCorreo,
      glosa_tef_snapshot: row.glosaTef,
      holder_rut_snapshot: row.holderRut,
      payment_email_snapshot: row.paymentEmail,
      real_owner_name_snapshot: row.realOwnerName,
      tef_display_name_snapshot: row.tefDisplayName,
      payment_item_id: row.itemId,
      payment_type: "remuneracion_mensual",
      snapshot: row,
      status: row.status === "CUENTA DE TERCERO / REVISAR" ? "en_nomina_revisar_tercero" : "en_nomina",
      tenant_id: ctx.membership.tenant_id
    })));
  }
  await supabase.from("hr_payment_items").update({ status: "en_nomina" }).in("id", preview.rows.filter((row) => row.status === "LISTO" || row.status === "CUENTA DE TERCERO / REVISAR").map((row) => row.itemId));
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { file_format: "TEF_A_K_PAGO", preview: preview.summary },
    company_id: ctx.membership.company_id,
    entity_id: batch.data?.id ?? null,
    entity_type: "hr_payment_batch",
    event_type: "hr.payment_batch_tef_generated",
    tenant_id: ctx.membership.tenant_id
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Disposition": `attachment; filename="Nomina bancaria RRHH ${first?.period ?? body.period ?? "periodo"}.xlsx"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-HR-Payment-Excluded": String(preview.summary.total - preview.summary.included),
      "X-HR-Payment-Rows": String(preview.summary.included)
    }
  });
}
