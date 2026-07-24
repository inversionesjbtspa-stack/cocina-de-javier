import { NextResponse } from "next/server";
import { classifyPayslipPdf } from "@/lib/hr/payslip-classifier";
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

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const form = await request.formData();
  const mode = String(form.get("mode") ?? "preview");
  const period = String(form.get("period") ?? "").trim();
  const assignments = parseAssignments(form.get("assignments"));
  const files = form.getAll("files").filter((file): file is File => file instanceof File);
  if (!/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ ok: false, error: "period_required" }, { status: 422 });
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

  const hashes: string[] = [];
  const buffers: Array<{ buffer: Buffer; file: File }> = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const errors = validatePayslipUploadFile({ buffer, filename: file.name, mimeType: file.type, size: file.size });
    if (errors.length) return NextResponse.json({ ok: false, error: "payslip_file_validation_failed", errors }, { status: 422 });
    buffers.push({ buffer, file });
    hashes.push(classifyPayslipPdf(buffer, employees, period).fileSha256);
  }

  const batchDuplicates = new Set(hashes.filter((hash, index) => hashes.indexOf(hash) !== index));
  const existingHashes = hashes.length
    ? await supabase.from("hr_payslips").select("file_sha256").eq("tenant_id", ctx.membership.tenant_id).in("file_sha256", hashes)
    : { data: [] };
  const duplicates = new Set((existingHashes.data ?? []).map((row) => row.file_sha256).filter(Boolean));

  const results = buffers.map(({ buffer, file }) => {
    const classification = classifyPayslipPdf(buffer, employees, period);
    const manualEmployeeId = assignments.get(file.name) ?? null;
    const manualEmployee = manualEmployeeId ? employees.find((employee) => employee.id === manualEmployeeId) : null;
    const duplicate = duplicates.has(classification.fileSha256) || batchDuplicates.has(classification.fileSha256);
    const manuallyAssigned = Boolean(manualEmployee);
    const invalidManualAssignment = Boolean(manualEmployeeId && !employeeIds.has(manualEmployeeId));
    const status = duplicate
      ? "requiere_revision"
      : manuallyAssigned
        ? "auto_asociada"
        : classification.status;
    return {
      ...classification,
      duplicate,
      employeeId: manualEmployee ? manualEmployee.id : classification.employeeId,
      employeeName: manualEmployee ? manualEmployee.fullName : classification.employeeName,
      fileName: file.name,
      filename: file.name,
      invalidManualAssignment,
      manualEmployeeId,
      safeFilename: sanitizePayslipFilename(file.name),
      size: file.size,
      status,
      matchLevel: manuallyAssigned ? "media" : classification.matchLevel,
      matchMethod: manuallyAssigned ? "revision_manual" : classification.matchMethod,
      reviewReason: duplicate
        ? "Archivo duplicado por SHA-256"
        : invalidManualAssignment
          ? "Trabajador manual no pertenece al tenant activo"
          : manuallyAssigned
            ? "Asignacion manual confirmada"
            : classification.reviewReason
    };
  });

  const summary = {
    autoMatched: results.filter((item) => item.status === "auto_asociada").length,
    duplicates: results.filter((item) => item.duplicate).length,
    errors: 0,
    needsReview: results.filter((item) => item.status !== "auto_asociada").length,
    total: results.length
  };

  if (mode !== "commit") {
    return NextResponse.json({ ok: true, mode: "preview", results, summary });
  }

  const unresolved = results.filter((item) => item.status !== "auto_asociada" || !item.employeeId || item.invalidManualAssignment);
  if (unresolved.length) {
    return NextResponse.json({ ok: false, error: "payslip_manual_review_required", results, summary, unresolved }, { status: 422 });
  }

  const batch = await supabase.from("hr_payslip_import_batches").insert({
    auto_matched: summary.autoMatched,
    duplicated: summary.duplicates,
    errors: summary.errors,
    needs_review: summary.needsReview,
    period,
    status: "confirmed",
    tenant_id: ctx.membership.tenant_id,
    total_files: summary.total,
    uploaded_by: ctx.user.id
  }).select("id").single();

  let saved = 0;
  const savedIds: string[] = [];
  for (const item of results) {
    const source = buffers.find(({ file }) => file.name === item.filename);
    if (!source || item.duplicate) continue;
    const folderEmployee = item.employeeId ?? "revision";
    const path = `${ctx.membership.tenant_id}/${period}/${folderEmployee}/${Date.now()}-${item.safeFilename}`;
    if (item.status === "auto_asociada") {
      const upload = await supabase.storage.from("hr-payslips").upload(path, source.buffer, {
        contentType: "application/pdf",
        upsert: false
      });
      if (upload.error) continue;
      const insert = await supabase.from("hr_payslips").upsert({
        batch_id: batch.data?.id ?? null,
        detected_name: item.detectedName || null,
        detected_period: item.detectedPeriod || period,
        detected_rut: item.detectedRut ? normalizeRut(item.detectedRut) : null,
        employee_id: item.employeeId,
        employee_name: item.employeeName,
        employee_rut: item.detectedRut ? normalizeRut(item.detectedRut) : null,
        file_sha256: item.fileSha256,
        match_level: item.matchLevel,
        match_method: item.matchMethod,
        metadata: { import_mode: "bulk", original_size: item.size },
        net_amount: item.netAmount,
        original_filename: item.filename,
        period,
        review_reason: item.reviewReason || null,
        source_file: item.filename,
        status: "cargada",
        storage_bucket: "hr-payslips",
        storage_path: path,
        tenant_id: ctx.membership.tenant_id,
        uploaded_by: ctx.user.id
      }, { onConflict: "tenant_id,employee_id,period" }).select("id").single();
      if (insert.data?.id) {
        saved += 1;
        savedIds.push(insert.data.id);
      }
    }
  }

  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { period, saved, summary },
    company_id: ctx.membership.company_id,
    entity_id: batch.data?.id ?? null,
    entity_type: "hr_payslip_import_batch",
    event_type: "hr.payslip_bulk_imported",
    tenant_id: ctx.membership.tenant_id
  });

  return NextResponse.json({ ok: true, batchId: batch.data?.id, mode: "commit", results, saved, savedIds, summary });
}
