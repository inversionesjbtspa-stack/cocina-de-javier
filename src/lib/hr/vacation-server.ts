import { companyConfigFromRow } from "./company-config.ts";
import {
  CHILE_HOLIDAYS_FIXTURE,
  calculateProjectedProportional,
  calculateVacationPreview,
  generateContractPeriods,
  type Holiday,
  type VacationPeriod
} from "./vacation-domain.ts";

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

export function buildFallbackPeriods(employee: { hire_date?: string | null; id: string; tenant_id?: string | null }, asOf: string) {
  if (!employee.hire_date) return [];
  return generateContractPeriods(employee.hire_date, asOf, 1).map((period) => ({
    ...period,
    employeeId: employee.id,
    tenantId: employee.tenant_id ?? undefined
  }));
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
    return: {
      effective_rest_end_date: input.preview.effectiveRestEndDate,
      last_counted_vacation_date: input.preview.lastCountedVacationDate,
      return_date_confirmed: input.preview.returnDateManuallyConfirmed,
      return_to_work_date: input.preview.returnToWorkDate,
      schedule_source: input.preview.scheduleSource
    }
  };
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
