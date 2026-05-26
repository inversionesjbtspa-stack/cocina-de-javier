import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const form = await request.formData();
  const file = form.get("file");
  const period = String(form.get("period") ?? "").trim();
  const employeeId = String(form.get("employeeId") ?? "").trim() || null;
  const netAmount = Number(form.get("netAmount") ?? 0);
  if (!(file instanceof File) || file.type !== "application/pdf") {
    return NextResponse.json({ ok: false, error: "payslip_pdf_required" }, { status: 422 });
  }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ ok: false, error: "period_required" }, { status: 422 });
  }

  const supabase = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${ctx.membership.tenant_id}/${period}/${employeeId ?? "revision"}/${Date.now()}-${safeName}`;
  const upload = await supabase.storage.from("hr-payslips").upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: "application/pdf",
    upsert: false
  });
  if (upload.error) return NextResponse.json({ ok: false, error: upload.error.message }, { status: 422 });

  const { data, error } = await supabase.from("hr_payslips").upsert({
    employee_id: employeeId,
    net_amount: Number.isFinite(netAmount) ? netAmount : 0,
    original_filename: file.name,
    period,
    source_file: file.name,
    status: employeeId ? "cargada" : "pendiente_revision",
    storage_bucket: "hr-payslips",
    storage_path: path,
    tenant_id: ctx.membership.tenant_id,
    uploaded_by: ctx.user.id
  }, { onConflict: "tenant_id,employee_id,period" }).select("id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { employee_id: employeeId, filename: file.name, period },
    company_id: ctx.membership.company_id,
    entity_id: data.id,
    entity_type: "hr_payslip",
    event_type: "hr.payslip_uploaded",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ ok: true, payslip: data });
}
