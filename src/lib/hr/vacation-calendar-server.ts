import {
  addLocalDays,
  compareIsoDate,
  holidayForDate,
  localWeekday,
  type Holiday,
  type VacationSchedule
} from "./vacation-domain.ts";
import { parseVacationWorkSchedule } from "./vacation-server.ts";

export type VacationCalendarPolicy = {
  active: boolean;
  mondayClosed: boolean;
  monthlySundaysOff: number;
  publicHolidaysWorking: boolean;
  sundayWorkingDefault: boolean;
  tenantId: string;
  thursdayWorking: boolean;
  timezone: string;
  tuesdayWorking: boolean;
  wednesdayWorking: boolean;
  fridayWorking: boolean;
  saturdayWorking: boolean;
};

export type ResolvedEmployeeCalendarDay = {
  date: string;
  working: boolean;
  reason: "MONDAY_CLOSED" | "NORMAL_WORKING_DAY" | "PUBLIC_HOLIDAY_WORKED" | "SCHEDULED_SUNDAY_OFF" | "COMPANY_CLOSED" | "INDIVIDUAL_OVERRIDE_WORKING" | "INDIVIDUAL_OVERRIDE_NON_WORKING";
  source: "company_policy" | "employee_monthly_schedule" | "company_calendar_exception" | "employee_override";
};

type SupabaseLike = {
  from: (table: string) => {
    delete: () => { eq: (column: string, value: string) => unknown };
    insert: (rows: unknown[]) => PromiseLike<{ error?: { message: string } | null }>;
    select: (columns: string) => {
      eq: (column: string, value: string | boolean) => unknown;
    };
  };
};

type QueryResult = { data: Array<Record<string, unknown>> | null; error?: { message: string } | null };

const DEFAULT_COMPANY_POLICY: Omit<VacationCalendarPolicy, "tenantId"> = {
  active: true,
  fridayWorking: true,
  mondayClosed: true,
  monthlySundaysOff: 2,
  publicHolidaysWorking: true,
  saturdayWorking: true,
  sundayWorkingDefault: true,
  thursdayWorking: true,
  timezone: "America/Santiago",
  tuesdayWorking: true,
  wednesdayWorking: true
};

function mapPolicy(row: Record<string, unknown> | null | undefined, tenantId: string): VacationCalendarPolicy {
  return {
    active: Boolean(row?.active ?? DEFAULT_COMPANY_POLICY.active),
    fridayWorking: Boolean(row?.friday_working ?? DEFAULT_COMPANY_POLICY.fridayWorking),
    mondayClosed: Boolean(row?.monday_closed ?? DEFAULT_COMPANY_POLICY.mondayClosed),
    monthlySundaysOff: Number(row?.monthly_sundays_off ?? DEFAULT_COMPANY_POLICY.monthlySundaysOff),
    publicHolidaysWorking: Boolean(row?.public_holidays_working ?? DEFAULT_COMPANY_POLICY.publicHolidaysWorking),
    saturdayWorking: Boolean(row?.saturday_working ?? DEFAULT_COMPANY_POLICY.saturdayWorking),
    sundayWorkingDefault: Boolean(row?.sunday_working_default ?? DEFAULT_COMPANY_POLICY.sundayWorkingDefault),
    tenantId,
    thursdayWorking: Boolean(row?.thursday_working ?? DEFAULT_COMPANY_POLICY.thursdayWorking),
    timezone: String(row?.timezone ?? DEFAULT_COMPANY_POLICY.timezone),
    tuesdayWorking: Boolean(row?.tuesday_working ?? DEFAULT_COMPANY_POLICY.tuesdayWorking),
    wednesdayWorking: Boolean(row?.wednesday_working ?? DEFAULT_COMPANY_POLICY.wednesdayWorking)
  };
}

function policyWorkingWeekdays(policy: VacationCalendarPolicy) {
  const weekdays: number[] = [];
  if (!policy.mondayClosed) weekdays.push(1);
  if (policy.tuesdayWorking) weekdays.push(2);
  if (policy.wednesdayWorking) weekdays.push(3);
  if (policy.thursdayWorking) weekdays.push(4);
  if (policy.fridayWorking) weekdays.push(5);
  if (policy.saturdayWorking) weekdays.push(6);
  if (policy.sundayWorkingDefault) weekdays.push(0);
  return weekdays;
}

function hasExplicitOverride(value: unknown) {
  if (!value) return false;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Boolean((parsed as { overrideEnabled?: unknown; useAsVacationOverride?: unknown }).overrideEnabled ?? (parsed as { useAsVacationOverride?: unknown }).useAsVacationOverride);
  } catch {
    return false;
  }
}

async function queryRows(builder: unknown): Promise<QueryResult> {
  return await (builder as PromiseLike<QueryResult>);
}

export function buildCompanyPolicyCalendar(input: {
  companyExceptions?: Array<{ date: string; type: string }>;
  employeeSchedule?: unknown;
  holidays?: Holiday[];
  monthlyDaysOff?: Array<{ date: string; type: string }>;
  policy: VacationCalendarPolicy;
  startDate: string;
  endDate: string;
}) {
  const explicitOverride = hasExplicitOverride(input.employeeSchedule);
  const parsedOverride = explicitOverride ? parseVacationWorkSchedule(input.employeeSchedule) : null;
  if (explicitOverride && parsedOverride?.workingWeekdays?.length) {
    return {
      days: [] as ResolvedEmployeeCalendarDay[],
      schedule: { ...parsedOverride, source: "employee_override" as const },
      source: "employee_override" as const
    };
  }

  const sundayOff = new Set((input.monthlyDaysOff ?? []).filter((item) => item.type === "SUNDAY_OFF").map((item) => item.date));
  const companyClosed = new Set((input.companyExceptions ?? []).filter((item) => item.type === "COMPANY_CLOSED").map((item) => item.date));
  const days: ResolvedEmployeeCalendarDay[] = [];
  const dateOverrides: NonNullable<VacationSchedule["dateOverrides"]> = {};
  for (let cursor = input.startDate; compareIsoDate(cursor, input.endDate) <= 0; cursor = addLocalDays(cursor, 1)) {
    const weekday = localWeekday(cursor);
    const holiday = holidayForDate(cursor, input.holidays ?? []);
    let day: ResolvedEmployeeCalendarDay;
    if (companyClosed.has(cursor)) {
      day = { date: cursor, reason: "COMPANY_CLOSED", source: "company_calendar_exception", working: false };
    } else if (weekday === 1 && input.policy.mondayClosed) {
      day = { date: cursor, reason: "MONDAY_CLOSED", source: "company_policy", working: false };
    } else if (weekday === 0 && sundayOff.has(cursor)) {
      day = { date: cursor, reason: "SCHEDULED_SUNDAY_OFF", source: "employee_monthly_schedule", working: false };
    } else {
      const working = policyWorkingWeekdays(input.policy).includes(weekday);
      day = {
        date: cursor,
        reason: holiday && input.policy.publicHolidaysWorking && working ? "PUBLIC_HOLIDAY_WORKED" : "NORMAL_WORKING_DAY",
        source: "company_policy",
        working
      };
    }
    days.push(day);
    dateOverrides[cursor] = { holidayName: holiday?.name ?? null, reason: day.reason, source: day.source, working: day.working };
  }

  return {
    days,
    schedule: {
      dateOverrides,
      holidaysAreWorking: input.policy.publicHolidaysWorking,
      source: "company_policy" as const,
      workingWeekdays: policyWorkingWeekdays(input.policy)
    },
    source: "company_policy" as const
  };
}

export async function resolveEmployeeWorkingCalendar(input: {
  employeeId: string;
  employeeSchedule?: unknown;
  fromDate: string;
  holidays?: Holiday[];
  manualClosedDays?: Array<{ date: string; reason?: string }>;
  supabase: unknown;
  tenantId: string;
  toDate: string;
}) {
  const supabase = input.supabase as SupabaseLike;
  const [policyResult, daysOffResult, exceptionsResult] = await Promise.all([
    queryRows((supabase.from("hr_vacation_calendar_policies").select("*").eq("tenant_id", input.tenantId) as { eq: (column: string, value: boolean) => PromiseLike<QueryResult> }).eq("active", true)),
    queryRows((((supabase.from("hr_employee_monthly_days_off").select("off_date,day_type").eq("tenant_id", input.tenantId) as { eq: (column: string, value: string) => unknown }).eq("employee_id", input.employeeId) as { gte?: unknown; lte?: unknown; eq: (column: string, value: string) => PromiseLike<QueryResult> }).eq("day_type", "SUNDAY_OFF"))),
    queryRows((supabase.from("hr_company_calendar_exceptions").select("exception_date,exception_type").eq("tenant_id", input.tenantId) as PromiseLike<QueryResult>))
  ]).catch(() => [{ data: null }, { data: null }, { data: null }] as QueryResult[]);

  const policy = mapPolicy(policyResult.data?.[0], input.tenantId);
  const monthlyDaysOff = (daysOffResult.data ?? []).map((row) => ({ date: String(row.off_date), type: String(row.day_type) }))
    .filter((item) => item.date >= input.fromDate && item.date <= input.toDate);
  const companyExceptions = [
    ...(exceptionsResult.data ?? []).map((row) => ({ date: String(row.exception_date), type: String(row.exception_type) })),
    ...(input.manualClosedDays ?? []).map((day) => ({ date: day.date, type: "COMPANY_CLOSED" }))
  ].filter((item) => item.date >= input.fromDate && item.date <= input.toDate);

  return {
    policy,
    ...buildCompanyPolicyCalendar({
      companyExceptions,
      employeeSchedule: input.employeeSchedule,
      endDate: input.toDate,
      holidays: input.holidays,
      monthlyDaysOff,
      policy,
      startDate: input.fromDate
    })
  };
}

export function validateMonthlySundayOffDates(month: string, dates: string[]) {
  const clean = dates.filter(Boolean);
  const unique = new Set(clean);
  if (unique.size !== clean.length) return { ok: false as const, error: "duplicate_sunday_off" };
  if (clean.length > 2) return { ok: false as const, error: "too_many_sundays_off" };
  for (const date of clean) {
    if (!date.startsWith(`${month}-`)) return { ok: false as const, error: "sunday_off_outside_month" };
    if (localWeekday(date) !== 0) return { ok: false as const, error: "sunday_off_not_sunday" };
  }
  return { ok: true as const, dates: clean };
}
