import { NextResponse } from "next/server";
import {
  movementTypeFor,
  parseVacationImportFile,
  previewVacationImport,
  sha256,
  type VacationImportKind,
  type VacationImportPreviewRow
} from "@/lib/hr/vacation-import";
import { requireHrContext } from "@/lib/hr/auth";
import { normalizeRut } from "@/lib/hr/utils";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type EmployeeRow = {
  full_name: string;
  id: string;
  rut: string;
};

type VacationPeriodRow = {
  advance_days: number | null;
  available_balance: number | null;
  employee_id: string;
  id: string;
  negative_adjustments: number | null;
  period_end: string;
  period_start: string;
  positive_adjustments: number | null;
  progressive_days: number | null;
  reserved_days: number | null;
  used_days: number | null;
};

function validImportType(value: string): value is VacationImportKind {
  return ["balances", "used_vacations", "movements"].includes(value);
}

function periodResolver(periods: VacationPeriodRow[]) {
  return (employeeId: string, date: string) => {
    const period = periods.find((item) => item.employee_id === employeeId && item.period_start <= date && date <= item.period_end);
    return period ? { id: period.id, periodEnd: period.period_end, periodStart: period.period_start } : null;
  };
}

function periodById(periods: VacationPeriodRow[], id: string | null) {
  return id ? periods.find((period) => period.id === id) ?? null : null;
}

function n(value: number | null | undefined) {
  return Number(value ?? 0);
}

async function applyVacationImportRow(input: {
  batchId: string;
  row: VacationImportPreviewRow;
  supabase: ReturnType<typeof createAdminClient>;
  tenantId: string;
  userId: string;
  periods: VacationPeriodRow[];
}) {
  const period = periodById(input.periods, input.row.periodId);
  if (!period || !input.row.employeeId || !input.row.effectiveDate) return { error: "period_not_resolved", ok: false };
  const current = n(period.available_balance);
  const movementType = movementTypeFor(input.row.importType, String(input.row.raw.Tipo ?? input.row.raw.tipo ?? ""));
  let patch: Record<string, number> = {};
  let movementDays = input.row.days;
  let resultingBalance = current;

  if (input.row.importType === "balances") {
    const delta = input.row.days - current;
    movementDays = delta;
    resultingBalance = input.row.days;
    patch = delta >= 0
      ? { positive_adjustments: n(period.positive_adjustments) + delta }
      : { negative_adjustments: n(period.negative_adjustments) + Math.abs(delta) };
  } else if (movementType === "used") {
    const used = Math.abs(input.row.days);
    movementDays = -used;
    resultingBalance = current - used;
    patch = { used_days: n(period.used_days) + used };
  } else if (movementType === "progressive") {
    const days = Math.abs(input.row.days);
    movementDays = days;
    resultingBalance = current + days;
    patch = { progressive_days: n(period.progressive_days) + days };
  } else {
    movementDays = input.row.days;
    resultingBalance = current + input.row.days;
    patch = input.row.days >= 0
      ? { positive_adjustments: n(period.positive_adjustments) + input.row.days }
      : { negative_adjustments: n(period.negative_adjustments) + Math.abs(input.row.days) };
  }

  const updated = await input.supabase
    .from("hr_vacation_periods")
    .update({ ...patch, updated_by: input.userId })
    .eq("tenant_id", input.tenantId)
    .eq("id", period.id)
    .select("id")
    .single();
  if (updated.error) return { error: updated.error.message, ok: false };

  const inserted = await input.supabase
    .from("hr_vacation_movements")
    .insert({
      created_by: input.userId,
      days: movementDays,
      effective_date: input.row.effectiveDate,
      employee_id: input.row.employeeId,
      import_batch_id: input.batchId,
      metadata: { raw: input.row.raw },
      movement_type: movementType,
      notes: input.row.notes,
      previous_balance: current,
      resulting_balance: resultingBalance,
      row_hash: input.row.rowHash,
      source: "accountant_import",
      source_reference: input.batchId,
      tenant_id: input.tenantId,
      vacation_period_id: period.id
    })
    .select("id")
    .single();
  if (inserted.error) {
    return { error: inserted.error.code === "23505" ? "duplicate_row_hash" : inserted.error.message, ok: false };
  }
  return { ok: true };
}

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const form = await request.formData();
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "preview");
  const importTypeRaw = String(form.get("importType") ?? "balances");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "vacation_import_file_required" }, { status: 422 });
  if (!validImportType(importTypeRaw)) return NextResponse.json({ ok: false, error: "vacation_import_type_invalid" }, { status: 422 });
  if (!["preview", "commit"].includes(mode)) return NextResponse.json({ ok: false, error: "vacation_import_mode_invalid" }, { status: 422 });
  if (!/\.(csv|xlsx)$/i.test(file.name)) return NextResponse.json({ ok: false, error: "vacation_import_file_type_invalid" }, { status: 422 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsedRows = parseVacationImportFile(buffer, file.name);
  const sourceHash = sha256(buffer);
  const supabase = createAdminClient();
  const [{ data: employees }, { data: periods }, { data: existingHashes }] = await Promise.all([
    supabase.from("hr_employees").select("id,rut,full_name").eq("tenant_id", ctx.membership.tenant_id).eq("status", "activo"),
    supabase.from("hr_vacation_periods").select("id,employee_id,period_start,period_end,available_balance,positive_adjustments,negative_adjustments,progressive_days,used_days,reserved_days,advance_days").eq("tenant_id", ctx.membership.tenant_id),
    supabase.from("hr_vacation_movements").select("row_hash").eq("tenant_id", ctx.membership.tenant_id).not("row_hash", "is", null)
  ]);

  const preview = previewVacationImport({
    employees: ((employees ?? []) as EmployeeRow[]).map((employee) => ({ fullName: employee.full_name, id: employee.id, rut: normalizeRut(employee.rut) })),
    existingRowHashes: (existingHashes ?? []) as Array<{ row_hash: string | null }>,
    importType: importTypeRaw,
    parsedRows,
    periodResolver: periodResolver((periods ?? []) as VacationPeriodRow[]),
    sourceHash
  });

  if (mode === "preview") return NextResponse.json({ ok: true, mode, preview });

  const readyRows = preview.rows.filter((row) => row.status === "LISTO");
  const batch = await supabase.from("hr_vacation_import_batches").upsert({
    created_by: ctx.user.id,
    duplicate_rows: preview.summary.duplicates,
    import_type: importTypeRaw,
    invalid_rows: preview.summary.invalid,
    metadata: { filename: file.name },
    ready_rows: preview.summary.ready,
    review_rows: preview.summary.review + preview.summary.notFound,
    source_filename: file.name,
    source_hash: sourceHash,
    status: "confirmed",
    tenant_id: ctx.membership.tenant_id,
    total_rows: preview.summary.total
  }, { onConflict: "tenant_id,source_hash,import_type" }).select("id").single();
  if (batch.error || !batch.data) return NextResponse.json({ ok: false, error: batch.error?.message ?? "vacation_import_batch_failed", preview }, { status: 422 });

  let created = 0;
  let failed = 0;
  const errors: Array<{ error: string; rowNumber: number }> = [];
  for (const row of readyRows) {
    const result = await applyVacationImportRow({
      batchId: batch.data.id,
      periods: (periods ?? []) as VacationPeriodRow[],
      row,
      supabase,
      tenantId: ctx.membership.tenant_id,
      userId: ctx.user.id
    });
    if (result.ok) created += 1;
    else {
      failed += 1;
      errors.push({ error: result.error ?? "unknown", rowNumber: row.rowNumber });
    }
  }

  await supabase.from("hr_vacation_import_batches").update({
    confirmed_at: new Date().toISOString(),
    confirmed_by: ctx.user.id,
    created_rows: created,
    failed_rows: failed,
    skipped_rows: preview.rows.length - readyRows.length
  }).eq("id", batch.data.id);

  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { created, failed, skipped: preview.rows.length - readyRows.length, summary: preview.summary },
    company_id: ctx.membership.company_id,
    entity_id: batch.data.id,
    entity_type: "hr_vacation_import_batch",
    event_type: "hr.vacation_import_confirmed",
    tenant_id: ctx.membership.tenant_id
  });

  return NextResponse.json({ ok: true, batchId: batch.data.id, created, errors, failed, mode, preview, skipped: preview.rows.length - readyRows.length });
}
