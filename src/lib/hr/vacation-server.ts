import { companyConfigFromRow, mergeCompanyConfig } from "./company-config.ts";
import {
  CHILE_HOLIDAYS_FIXTURE,
  calculateProjectedProportional,
  calculateProgressiveDays,
  calculateVacationPreview,
  generateContractPeriods,
  type Holiday,
  type ProgressiveRecord,
  type VacationPeriod,
  type VacationSchedule
} from "./vacation-domain.ts";
import { buildVacationReceiptModel, renderVacationReceiptPdf, vacationReceiptHash, type VacationPeriodAllocation } from "./vacation-receipt.ts";
import { previewVacationPeriodBackfill } from "./vacation-persistence.ts";

export type HrVacationContext = {
  companyId: string;
  tenantId: string;
  userId: string;
};

export function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function mapHolidayRow(row: Record<string, unknown>): Holiday {
  return {
    communeCode: row.commune_code as string | null,
    date: String(row.holiday_date),
    mandatory: Boolean(row.mandatory),
    name: String(row.name ?? "Feriado"),
    regionCode: row.region_code as string | null,
    scope: (row.scope as Holiday["scope"]) ?? "national",
    status: (row.status as Holiday["status"]) ?? "active"
  };
}

export function mapPeriodRow(row: Record<string, unknown>): VacationPeriod {
  return {
    advanceDays: Number(row.advance_days ?? 0),
    availableBalance: Number(row.available_balance ?? 0),
    baseDays: Number(row.base_days ?? 15),
    continuousBlockRequired: Number(row.continuous_block_required ?? 10),
    continuousBlockUsed: Number(row.continuous_block_used ?? 0),
    employeeId: row.employee_id as string,
    id: row.id as string,
    negativeAdjustments: Number(row.negative_adjustments ?? 0),
    periodEnd: String(row.period_end),
    periodStart: String(row.period_start),
    positiveAdjustments: Number(row.positive_adjustments ?? 0),
    progressiveDays: Number(row.progressive_days ?? 0),
    reservedDays: Number(row.reserved_days ?? 0),
    status: (row.status as VacationPeriod["status"]) ?? "open",
    tenantId: row.tenant_id as string,
    usedDays: Number(row.used_days ?? 0),
    version: Number(row.version ?? 1)
  };
}

export function parseVacationWorkSchedule(value: unknown): VacationSchedule {
  if (!value) return { source: "default" };
  if (typeof value === "object" && value !== null && "workingWeekdays" in value) {
    const workingWeekdays = (value as { workingWeekdays?: unknown }).workingWeekdays;
    return Array.isArray(workingWeekdays) ? { source: "employee_override", workingWeekdays: workingWeekdays.map(Number) } : { source: "employee_override" };
  }
  const text = String(value).trim().toLowerCase();
  if (!text) return { source: "default" };
  try {
    const parsed = JSON.parse(text) as { workingWeekdays?: unknown };
    if (Array.isArray(parsed.workingWeekdays)) return { source: "employee_override", workingWeekdays: parsed.workingWeekdays.map(Number) };
  } catch {
    // Plain text schedules are common in legacy HR records.
  }
  if (/lun(?:es)?\s*[-a]\s*s.{0,2}b|lunes a sab|lun-sab|6x1|seis/.test(text)) return { source: "employee_override", workingWeekdays: [1, 2, 3, 4, 5, 6] };
  if (/lun(?:es)?\s*[-a]\s*vie|lunes a vie|lun-vie|5x2|cinco/.test(text)) return { source: "employee_override", workingWeekdays: [1, 2, 3, 4, 5] };
  return { source: "employee_override" };
}

export function buildFallbackPeriods(employee: { hire_date?: string | null; id: string; tenant_id?: string | null }, asOf: string) {
  if (!employee.hire_date) return [];
  return generateContractPeriods(employee.hire_date, asOf, 1).map((period) => ({
    ...period,
    employeeId: employee.id,
    tenantId: employee.tenant_id ?? undefined
  }));
}

export function mapProgressiveRecord(row: Record<string, unknown>): ProgressiveRecord {
  return {
    accreditationDate: row.accreditation_date as string | null,
    creditedMonths: Number(row.credited_months ?? 0),
    effectiveFrom: row.effective_from as string | null,
    previousEmployerYears: Number(row.previous_employer_years ?? 0),
    recognizedDays: Number(row.recognized_days ?? 0),
    status: row.status as ProgressiveRecord["status"]
  };
}

export async function ensureVacationPeriodsForEmployee(input: {
  asOf: string;
  employee: { hire_date?: string | null; id: string; tenant_id?: string | null };
  progressiveRecords?: ProgressiveRecord[];
  supabase: unknown;
  userId: string;
  yearsForward?: number;
}) {
  if (!input.employee.hire_date || !input.employee.tenant_id) return { created: 0, periods: [] as VacationPeriod[], usedFallback: true };
  const supabase = input.supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => { eq: (column: string, value: string) => PromiseLike<{ data: Array<Record<string, unknown>> | null; error?: { message: string } | null }> };
      };
      upsert: (rows: unknown[], options: { ignoreDuplicates?: boolean; onConflict: string }) => {
        select: (columns: string) => PromiseLike<{ data: unknown[] | null; error?: { message: string } | null }>;
      };
    };
  };
  const existingResult = await supabase
    .from("hr_vacation_periods")
    .select("*")
    .eq("tenant_id", input.employee.tenant_id)
    .eq("employee_id", input.employee.id);
  const existing = existingResult.data ?? [];
  const preview = previewVacationPeriodBackfill({
    asOf: input.asOf,
    employeeId: input.employee.id,
    existingPeriods: existing.map((period) => ({
      period_end: String(period.period_end),
      period_start: String(period.period_start)
    })),
    hireDate: input.employee.hire_date,
    yearsForward: input.yearsForward ?? 1
  });
  if (preview.conflicts.length) return { conflicts: preview.conflicts, created: 0, periods: existing.map(mapPeriodRow), usedFallback: false };
  if (!preview.missing.length) return { created: 0, periods: existing.map(mapPeriodRow), usedFallback: false };
  const progressiveDays = calculateProgressiveDays(input.employee.hire_date, input.asOf, input.progressiveRecords ?? []);
  const rows = preview.missing.map((period) => ({
    base_days: period.baseDays,
    created_by: input.userId,
    employee_id: input.employee.id,
    period_end: period.periodEnd,
    period_start: period.periodStart,
    progressive_days: progressiveDays,
    status: period.status,
    tenant_id: input.employee.tenant_id,
    updated_by: input.userId
  }));
  const inserted = await supabase
    .from("hr_vacation_periods")
    .upsert(rows, { ignoreDuplicates: true, onConflict: "tenant_id,employee_id,period_start,period_end" })
    .select("*");
  if (inserted.error) return { created: 0, error: inserted.error.message, periods: existing.map(mapPeriodRow), usedFallback: false };
  const combined = [...existing, ...((inserted.data ?? []) as Array<Record<string, unknown>>)];
  return { created: inserted.data?.length ?? 0, periods: combined.map(mapPeriodRow), usedFallback: false };
}

export function buildVacationSnapshot(input: {
  companyRow: unknown;
  employee: Record<string, unknown>;
  holidays: Holiday[];
  note?: string | null;
  observation?: string | null;
  periods: VacationPeriod[];
  preview: ReturnType<typeof calculateVacationPreview>;
}) {
  return {
    allocations: input.preview.allocations,
    annual_entitlement: input.preview.annualEntitlement,
    calendarStatus: input.preview.calendarStatus,
    calendarWarnings: input.preview.calendarWarnings,
    company: companyConfigFromRow(input.companyRow),
    employee: {
      area: input.employee.area ?? null,
      contractType: input.employee.contract_type ?? null,
      costCenter: input.employee.cost_center ?? null,
      fullName: input.employee.full_name ?? "Trabajador",
      hireDate: input.employee.hire_date ?? null,
      id: input.employee.id,
      position: input.employee.position ?? null,
      rut: input.employee.rut ?? ""
    },
    fractionation: input.preview.fractionation,
    holidays: input.holidays,
    holidaysApplied: input.preview.holidaysApplied,
    note: input.note ?? null,
    observation: input.observation ?? null,
    periods: input.periods,
    projected_proportional: input.preview.projectedProportional,
    workCalendar: {
      calendar_days: input.preview.calendarDays,
      non_business: input.preview.nonBusiness,
      schedule_review_required: input.preview.scheduleReviewRequired,
      schedule_source: input.preview.scheduleSource
    },
    balance: {
      as_of: input.preview.effectiveRestEndDate,
      before: input.preview.totalAvailable,
      projected_proportional: input.preview.projectedProportional,
      after_request: input.preview.totalAfterRequest
    },
    return: {
      effective_rest_end_date: input.preview.effectiveRestEndDate,
      last_counted_vacation_date: input.preview.lastCountedVacationDate,
      return_date_confirmed: input.preview.returnDateManuallyConfirmed,
      return_to_work_date: input.preview.returnToWorkDate,
      schedule_source: input.preview.scheduleSource
    }
  };
}

type ReceiptSelectBuilder = {
  eq: (column: string, value: string) => ReceiptSelectBuilder;
  maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error?: { message: string } | null }>;
};

type ReceiptTableBuilder = {
  select: (columns: string) => ReceiptSelectBuilder;
  upsert: (payload: Record<string, unknown>, options: { onConflict: string }) => PromiseLike<{ error?: { message: string } | null }>;
};

export type VacationReceiptPersistenceClient = {
  from: (table: string) => ReceiptTableBuilder;
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Buffer, options: { contentType: string; upsert: boolean }) => PromiseLike<{ error?: { message: string } | null }>;
    };
  };
};

function mapVacationAllocationRow(row: Record<string, unknown>, periods: Map<string, { periodEnd: string | null; periodStart: string | null }>): VacationPeriodAllocation {
  const periodId = String(row.vacation_period_id ?? row.period_id ?? "");
  const period = periods.get(periodId);
  return {
    allocatedDays: Number(row.allocated_days ?? row.days_used ?? 0),
    allocationOrder: Number(row.allocation_order ?? 0),
    balanceAfter: Number(row.resulting_balance ?? row.balance_after ?? 0),
    balanceBefore: Number(row.previous_balance ?? row.balance_before ?? 0),
    periodEnd: period?.periodEnd ?? null,
    periodStart: period?.periodStart ?? null
  };
}

export async function fetchVacationReceiptAllocations(supabase: unknown, tenantId: string, requestId: string) {
  const client = supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => unknown;
      };
    };
  };
  const allocationQuery = client
    .from("hr_vacation_allocations")
    .select("*")
    .eq("tenant_id", tenantId) as {
      eq: (column: string, value: string) => {
        order: (column: string, options?: { ascending?: boolean }) => PromiseLike<{ data: Array<Record<string, unknown>> | null; error?: { message: string } | null }>;
      };
    };
  const allocationResult = await allocationQuery.eq("request_id", requestId).order("allocation_order", { ascending: true });
  const allocations = allocationResult.data ?? [];
  if (!allocations.length) return [];

  const periodIds = Array.from(new Set(allocations.map((row) => String(row.vacation_period_id ?? row.period_id ?? "")).filter(Boolean)));
  const periodMap = new Map<string, { periodEnd: string | null; periodStart: string | null }>();
  if (periodIds.length) {
    const periodQuery = client
      .from("hr_vacation_periods")
      .select("id,period_start,period_end")
      .eq("tenant_id", tenantId) as {
        in: (column: string, values: string[]) => PromiseLike<{ data: Array<Record<string, unknown>> | null; error?: { message: string } | null }>;
      };
    const periodResult = await periodQuery.in("id", periodIds);
    (periodResult.data ?? []).forEach((row) => {
      periodMap.set(String(row.id), {
        periodEnd: row.period_end ? String(row.period_end) : null,
        periodStart: row.period_start ? String(row.period_start) : null
      });
    });
  }
  return allocations.map((row) => mapVacationAllocationRow(row, periodMap));
}

export async function persistVacationReceiptForRequest(input: {
  companyId: string;
  requestId: string;
  supabase: VacationReceiptPersistenceClient;
  tenantId: string;
  userId: string;
}) {
  const [{ data }, company, receiptAllocations] = await Promise.all([
    input.supabase
      .from("hr_vacation_requests")
      .select("*,hr_employees(id,full_name,rut,position,area,cost_center,hire_date,contract_type)")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.requestId)
      .maybeSingle(),
    input.supabase
      .from("companies")
      .select("legal_name,name,rut,address,phone")
      .eq("id", input.companyId)
      .maybeSingle(),
    fetchVacationReceiptAllocations(input.supabase, input.tenantId, input.requestId)
  ]);
  if (!data) return { ok: false as const, error: "vacation_not_found" };
  if (data.status !== "aprobada") return { ok: false as const, error: "vacation_not_approved" };

  const snapshot = data.receipt_snapshot as Record<string, unknown> | null | undefined ?? data.snapshot as Record<string, unknown> | null | undefined;
  const snapshotEmployee = snapshot?.employee as Record<string, string | null> | undefined;
  const snapshotCompany = snapshot?.company;
  const companyConfig = mergeCompanyConfig(companyConfigFromRow(company.data), snapshotCompany ? companyConfigFromRow(snapshotCompany) : companyConfigFromRow(null));
  const employee = firstRelation(data.hr_employees as Array<Record<string, string | null>> | Record<string, string | null> | null);
  const allocations = receiptAllocations.length ? receiptAllocations : (snapshot?.allocations as Parameters<typeof buildVacationReceiptModel>[0]["allocations"]) ?? [];
  const firstAllocation = allocations[0];
  const model = buildVacationReceiptModel({
    allocations,
    approvedByName: data.approved_by_name as string | undefined,
    businessDays: Number(data.business_days ?? 0),
    company: companyConfig,
    contractPeriodEnd: (data.contract_period_end as string | null) ?? firstAllocation?.periodEnd ?? null,
    contractPeriodStart: (data.contract_period_start as string | null) ?? firstAllocation?.periodStart ?? null,
    documentDate: data.document_date as string | null,
    employee: {
      area: snapshotEmployee?.area ?? employee?.area ?? null,
      contractType: snapshotEmployee?.contractType ?? employee?.contract_type ?? null,
      costCenter: snapshotEmployee?.costCenter ?? employee?.cost_center ?? null,
      fullName: snapshotEmployee?.fullName ?? employee?.full_name ?? "Trabajador",
      hireDate: snapshotEmployee?.hireDate ?? employee?.hire_date ?? null,
      id: snapshotEmployee?.id ?? employee?.id ?? null,
      position: snapshotEmployee?.position ?? employee?.position ?? null,
      rut: snapshotEmployee?.rut ?? employee?.rut ?? ""
    },
    endDate: (data.effective_rest_end_date ?? data.end_date) as string,
    fractionalVacation: data.fractional_vacation as boolean | null,
    id: input.requestId,
    nonBusinessDays: data.non_business_days as number | null,
    note: data.note as string | null,
    previousBalance: Number(data.previous_balance ?? 0),
    progressiveDays: Number(data.progressive_days ?? 0),
    projectedProportional: Number(snapshot?.projected_proportional ?? data.projected_business_days ?? 0),
    receiptNumber: (data.document_number ?? data.receipt_number) as string | null,
    returnToWorkDate: (data.return_to_work_date ?? (snapshot?.return as Record<string, unknown> | undefined)?.return_to_work_date) as string | null,
    requestedStatus: data.status as string,
    resultingBalance: Number(data.resulting_balance ?? 0),
    startDate: data.start_date as string
  });
  const pdf = renderVacationReceiptPdf(model);
  const storagePath = `tenants/${input.tenantId}/employees/${employee?.id ?? "sin-empleado"}/vacations/${input.requestId}/${model.receiptNumber ?? "sin-correlativo"}.pdf`;
  const upload = await input.supabase.storage.from("hr-vacation-documents").upload(storagePath, pdf, {
    contentType: "application/pdf",
    upsert: true
  });
  if (upload.error) return { ok: false as const, error: upload.error.message };
  const document = await input.supabase.from("hr_vacation_documents").upsert({
    document_status: data.receipt_status ?? "vigente",
    document_type: "comprobante_feriado",
    employee_id: employee?.id,
    file_name: model.filename,
    file_sha256: vacationReceiptHash(pdf),
    file_size: pdf.byteLength,
    generated_by: input.userId,
    immutable_snapshot: model,
    mime_type: "application/pdf",
    storage_bucket: "hr-vacation-documents",
    storage_path: storagePath,
    tenant_id: input.tenantId,
    vacation_request_id: input.requestId
  }, { onConflict: "tenant_id,vacation_request_id,document_type" });
  if (document.error) return { ok: false as const, error: document.error.message };
  return { ok: true as const, filename: model.filename, storagePath };
}

export function safeVacationHolidays(rows: Array<Record<string, unknown>> | null | undefined) {
  return rows?.length ? rows.map(mapHolidayRow) : CHILE_HOLIDAYS_FIXTURE;
}

export function projectedByEmployee(periods: VacationPeriod[]) {
  const map = new Map<string, number>();
  periods.forEach((period) => {
    if (!period.employeeId) return;
    map.set(period.employeeId, calculateProjectedProportional((period.baseDays ?? 15) + (period.progressiveDays ?? 0)));
  });
  return map;
}

export function assertEmployeeInTenant<T extends { id?: string; tenant_id?: string | null }>(employee: T | null | undefined, tenantId: string) {
  if (!employee || employee.tenant_id !== tenantId) {
    return { ok: false as const, error: "employee_not_in_tenant" };
  }
  return { ok: true as const, employee };
}

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => SupabaseFilterLike;
    };
  };
};

type SupabaseFilterLike = {
  eq: (column: string, value: string) => SupabaseFilterLike;
  maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error?: { message: string } | null }>;
};

export async function getEmployeeForHrTenant(supabase: SupabaseLike, tenantId: string, employeeId: string, columns = "*") {
  const result = await supabase
    .from("hr_employees")
    .select(columns)
    .eq("tenant_id", tenantId)
    .eq("id", employeeId)
    .maybeSingle();
  const checked = assertEmployeeInTenant(result.data as { id?: string; tenant_id?: string | null } | null, tenantId);
  return { ...result, checked };
}

export async function getVacationRequestForTenant(supabase: SupabaseLike, tenantId: string, requestId: string, columns = "*") {
  const result = await supabase
    .from("hr_vacation_requests")
    .select(columns)
    .eq("tenant_id", tenantId)
    .eq("id", requestId)
    .maybeSingle();
  if (!result.data || result.data.tenant_id !== tenantId) {
    return { ...result, ok: false as const, errorCode: "vacation_not_found" };
  }
  return { ...result, ok: true as const, vacation: result.data };
}

export function requireVacationPermission(role: string | null | undefined) {
  return role === "owner" || role === "admin" || role === "finance_manager";
}
