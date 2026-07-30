import { NextResponse } from "next/server";
import { buildPayslipPayrollImportItems, summarizePayslipPayrollImport } from "@/lib/hr/payslip-payroll-import";
import { sanitizePayslipFilename, validatePayslipUploadBatch, validatePayslipUploadFile } from "@/lib/hr/payslip-upload-policy";
import { requireHrContext } from "@/lib/hr/auth";
import { normalizeRut } from "@/lib/hr/utils";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function parseAssignments(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return new Map<string, string>();
  try {
    const parsed = JSON.parse(value) as Record<string, string>;
    return new Map(Object.entries(parsed).filter(([, employeeId]) => typeof employeeId === "string" && employeeId));
  } catch {
    return new Map<string, string>();
  }
}

function publicItem(item: Awaited<ReturnType<typeof buildPayslipPayrollImportItems>>[number]) {
  return {
    detectedName: item.detectedName,
    detectedPeriod: item.detectedPeriod,
    detectedRut: item.detectedRut,
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    fileName: item.fileName,
    fileSha256: item.fileSha256,
    glosa: item.glosa,
    importKey: item.importKey,
    matchLevel: item.matchLevel,
    matchMethod: item.matchMethod,
    netAmount: item.netAmount,
    originalFilename: item.originalFilename,
    page: item.page,
    paymentRequired: item.paymentRequired,
    period: item.period,
    reviewReason: item.reviewReason,
    status: item.status,
    warnings: item.warnings
  };
}

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const form = await request.formData();
  const mode = String(form.get("mode") ?? "preview");
  const fallbackPeriod = String(form.get("period") ?? "").trim();
  const assignments = parseAssignments(form.get("assignments"));
  const files = form.getAll("files").filter((file): file is File => file instanceof File);
  if (fallbackPeriod && !/^\d{4}-\d{2}$/.test(fallbackPeriod)) return NextResponse.json({ ok: false, error: "period_invalid" }, { status: 422 });
  if (!files.length) return NextResponse.json({ ok: false, error: "payslip_files_required" }, { status: 422 });
  const batchValidation = validatePayslipUploadBatch(files.map((file) => ({ size: file.size })));
  if (batchValidation.errors.length) return NextResponse.json({ ok: false, error: "payslip_batch_validation_failed", errors: batchValidation.errors }, { status: 422 });

  const supabase = createAdminClient();
  const { data: employeesRows } = await supabase
    .from("hr_employees")
    .select("id,rut,full_name,status,area,position,payment_enabled")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("status", "activo");

  const employees = (employeesRows ?? []).map((row) => ({
    fullName: row.full_name,
    id: row.id,
    rut: row.rut
  }));
  const employeeIds = new Set(employees.map((employee) => employee.id));

  const buffers: Array<{ buffer: Buffer; file: File }> = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const errors = validatePayslipUploadFile({ buffer, filename: file.name, mimeType: file.type, size: file.size });
    if (errors.length) return NextResponse.json({ ok: false, error: "payslip_file_validation_failed", errors }, { status: 422 });
    buffers.push({ buffer, file });
  }

  let firstPass: Awaited<ReturnType<typeof buildPayslipPayrollImportItems>>;
  try {
    firstPass = (await Promise.all(buffers.map(({ buffer, file }) =>
      buildPayslipPayrollImportItems({ buffer, employees, filename: file.name, manualAssignments: assignments })
    ))).flat();
  } catch {
    return NextResponse.json({ ok: false, error: "payslip_parse_failed" }, { status: 422 });
  }
  if (!firstPass.length) return NextResponse.json({ ok: false, error: "payslip_pages_not_detected" }, { status: 422 });
  const pageHashes = firstPass.map((item) => item.fileSha256);
  const repeatedHashes = new Set(pageHashes.filter((hash, index) => pageHashes.indexOf(hash) !== index));
  const existingHashes = pageHashes.length
    ? await supabase.from("hr_payslips").select("file_sha256").eq("tenant_id", ctx.membership.tenant_id).in("file_sha256", pageHashes)
    : { data: [] };
  const duplicateHashes = new Set([
    ...(existingHashes.data ?? []).map((row) => row.file_sha256).filter(Boolean),
    ...repeatedHashes
  ]);

  const results = firstPass.map((item) => {
    const invalidManualAssignment = Boolean(assignments.get(item.importKey) && !employeeIds.has(assignments.get(item.importKey) ?? ""));
    if (!duplicateHashes.has(item.fileSha256) && !invalidManualAssignment) return item;
    return {
      ...item,
      reviewReason: invalidManualAssignment ? "Trabajador manual no pertenece al tenant activo" : "Ya importada",
      status: invalidManualAssignment ? "requiere_revision" as const : "duplicado" as const
    };
  });
  const summary = summarizePayslipPayrollImport(results);

  if (mode !== "commit") {
    return NextResponse.json({ ok: true, mode: "preview", results: results.map(publicItem), summary });
  }

  const unresolved = results.filter((item) => item.status === "requiere_revision" || item.status === "duplicado" || !item.employeeId);
  if (unresolved.length) {
    return NextResponse.json({ ok: false, error: "payslip_manual_review_required", results: results.map(publicItem), summary, unresolved: unresolved.map(publicItem) }, { status: 422 });
  }

  const batchPeriods = Array.from(new Set(results.map((item) => item.period).filter(Boolean)));
  const batch = await supabase.from("hr_payslip_import_batches").insert({
    auto_matched: summary.ready + summary.zeroNet,
    duplicated: summary.duplicates,
    errors: summary.needsReview,
    needs_review: summary.needsReview,
    period: batchPeriods.length === 1 ? batchPeriods[0] : (fallbackPeriod || batchPeriods[0] || "multi"),
    status: "confirmed",
    tenant_id: ctx.membership.tenant_id,
    total_files: summary.total,
    uploaded_by: ctx.user.id
  }).select("id").single();

  let paymentsCreated = 0;
  let saved = 0;
  let zeroNet = 0;
  const savedIds: string[] = [];
  const paymentIds: string[] = [];
  for (const item of results) {
    if (!item.employeeId || item.status === "duplicado" || item.status === "requiere_revision") continue;
    const path = `${ctx.membership.tenant_id}/${item.period}/${item.employeeId}/${Date.now()}-${sanitizePayslipFilename(item.fileName)}`;
    const upload = await supabase.storage.from("hr-payslips").upload(path, item.pagePdf, {
      contentType: "application/pdf",
      upsert: false
    });
    if (upload.error) continue;

    const insert = await supabase.from("hr_payslips").insert({
      batch_id: batch.data?.id ?? null,
      detected_name: item.detectedName || null,
      detected_period: item.period,
      detected_rut: item.detectedRut ? normalizeRut(item.detectedRut) : null,
      employee_id: item.employeeId,
      employee_name: item.employeeName,
      employee_rut: item.detectedRut ? normalizeRut(item.detectedRut) : null,
      file_sha256: item.fileSha256,
      match_level: item.matchLevel,
      match_method: item.matchMethod,
      metadata: {
        glosa: item.glosa,
        import_mode: "multipage_pdf",
        original_filename: item.originalFilename,
        original_page: item.page,
        payroll_auto_create: item.paymentRequired
      },
      net_amount: item.netAmount,
      original_filename: item.fileName,
      period: item.period,
      review_reason: item.reviewReason || null,
      source_file: item.originalFilename,
      status: "cargada",
      storage_bucket: "hr-payslips",
      storage_path: path,
      tenant_id: ctx.membership.tenant_id,
      uploaded_by: ctx.user.id
    }).select("id").single();
    if (!insert.data?.id) continue;

    saved += 1;
    savedIds.push(insert.data.id);

    if (!item.paymentRequired) {
      zeroNet += 1;
      continue;
    }

    const payment = await supabase.from("hr_payment_items").insert({
      amount: item.netAmount,
      created_by: ctx.user.id,
      employee_id: item.employeeId,
      glosa: item.glosa,
      metadata: {
        import_batch_id: batch.data?.id ?? null,
        original_filename: item.originalFilename,
        original_page: item.page
      },
      payslip_id: insert.data.id,
      payment_type: "remuneracion_mensual",
      period: item.period,
      source_id: insert.data.id,
      source_type: "payslip_import",
      status: "pendiente_pago",
      tenant_id: ctx.membership.tenant_id
    }).select("id").single();

    if (payment.error) return NextResponse.json({ ok: false, error: "payment_item_insert_failed", saved, savedIds }, { status: 409 });

    paymentsCreated += 1;
    paymentIds.push(payment.data.id);
  }

  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { periods: batchPeriods, paymentsCreated, saved, summary, zeroNet },
    company_id: ctx.membership.company_id,
    entity_id: batch.data?.id ?? null,
    entity_type: "hr_payslip_import_batch",
    event_type: "hr.payslip_multipage_imported",
    tenant_id: ctx.membership.tenant_id
  });

  return NextResponse.json({
    ok: true,
    batchId: batch.data?.id,
    mode: "commit",
    paymentsCreated,
    paymentIds,
    results: results.map(publicItem),
    saved,
    savedIds,
    summary,
    zeroNet
  });
}
