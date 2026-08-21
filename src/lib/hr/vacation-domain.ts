export const VACATION_TIMEZONE = "America/Santiago";
export const BASE_ANNUAL_ENTITLEMENT = 15;
export const CONTINUOUS_BLOCK_MINIMUM_DAYS = 10;

export type VacationStatus = "borrador" | "solicitada" | "pendiente" | "aprobada" | "rechazada" | "anulada" | "en_curso" | "finalizada";
export type VacationPeriodStatus = "open" | "closed" | "future";
export type VacationAllocationType = "earned" | "reserved" | "advance" | "reversal";
export type VacationSchedule = {
  dateOverrides?: Record<string, { holidayName?: string | null; reason?: string; source?: string; working: boolean }>;
  holidaysAreWorking?: boolean;
  workingWeekdays?: number[];
  source?: "employee" | "contract" | "default" | "manual" | "company_policy" | "employee_override";
};
export type WorkCalendarDayType = "WORKING_DAY" | "WEEKEND" | "HOLIDAY" | "OTHER_NON_WORKING_DAY";
export type WorkCalendarDay = {
  date: string;
  type: WorkCalendarDayType;
  weekday: number;
  holidayName?: string | null;
  reason?: string | null;
  source?: string | null;
};
export type Holiday = {
  communeCode?: string | null;
  date: string;
  mandatory?: boolean;
  name: string;
  regionCode?: string | null;
  scope: "national" | "region" | "commune" | "tenant";
  status?: "active" | "inactive";
};
export type HolidayCalendarStatus = "verified" | "incomplete" | "missing";
export type ProgressiveRecord = {
  accreditationDate?: string | null;
  creditedMonths?: number;
  effectiveFrom?: string | null;
  previousEmployerYears?: number;
  recognizedDays?: number;
  status: "pendiente" | "en_revision" | "acreditado" | "rechazado" | "vencido" | "reemplazado";
};
export type ProgressiveVacationCalculation = {
  currentEmployerServiceYears: number;
  progressiveDays: number;
  recognizedPreviousServiceYears: number;
  totalRecognizedYears: number;
};
export type VacationPeriod = {
  advanceDays?: number;
  availableBalance?: number;
  baseDays: number;
  continuousBlockRequired?: number;
  continuousBlockUsed?: number;
  employeeId?: string;
  id?: string;
  negativeAdjustments?: number;
  periodEnd: string;
  periodStart: string;
  positiveAdjustments?: number;
  progressiveDays?: number;
  reservedDays?: number;
  status?: VacationPeriodStatus;
  tenantId?: string;
  usedDays?: number;
  version?: number;
};
export type VacationAllocation = {
  allocationOrder: number;
  allocationType: VacationAllocationType;
  days: number;
  periodEnd: string;
  periodId?: string;
  periodStart: string;
  previousBalance: number;
  resultingBalance: number;
};
export type FractionationInput = {
  agreementAccepted?: boolean;
  requestedDays: number;
  periods: VacationPeriod[];
};
export type AdvanceVacationInput = {
  advanceAuthorized?: boolean;
  availableDays: number;
  projectedProportionalDays: number;
  requestedDays: number;
};
export type VacationPreviewInput = {
  advanceAuthorized?: boolean;
  agreementAccepted?: boolean;
  asOf?: string;
  calendarStatusByYear?: Record<string, HolidayCalendarStatus>;
  employeeId?: string;
  endDate?: string | null;
  holidays?: Holiday[];
  hireDate: string;
  manualNonWorkingDays?: Array<{ date: string; reason?: string | null }>;
  periods?: VacationPeriod[];
  previousEmployerYears?: number;
  progressiveRecords?: ProgressiveRecord[];
  regionCode?: string | null;
  requestedBusinessDays?: number | null;
  schedule?: VacationSchedule;
  startDate: string;
};

const MS_PER_DAY = 86400000;

function parts(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return { day, month, year };
}

function utcDate(value: string) {
  const { day, month, year } = parts(value);
  return new Date(Date.UTC(year, month - 1, day));
}

export function compareIsoDate(a: string, b: string) {
  return a.slice(0, 10).localeCompare(b.slice(0, 10));
}

export function isoFromUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addLocalDays(value: string, days: number) {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoFromUtcDate(date);
}

export function daysBetweenInclusive(startDate: string, endDate: string) {
  if (compareIsoDate(endDate, startDate) < 0) return 0;
  return Math.floor((utcDate(endDate).getTime() - utcDate(startDate).getTime()) / MS_PER_DAY) + 1;
}

export function localWeekday(value: string) {
  return utcDate(value).getUTCDay();
}

export function ageInCompletedYears(startDate: string, asOf: string) {
  const start = parts(startDate);
  const end = parts(asOf);
  let years = end.year - start.year;
  if (end.month < start.month || (end.month === start.month && end.day < start.day)) years -= 1;
  return Math.max(0, years);
}

export function generateContractPeriods(hireDate: string, asOf = isoFromUtcDate(new Date()), yearsForward = 1): VacationPeriod[] {
  const hire = parts(hireDate);
  const startYear = hire.year;
  const currentYears = ageInCompletedYears(hireDate, asOf);
  const count = Math.max(1, currentYears + yearsForward + 1);
  return Array.from({ length: count }, (_, index) => {
    const periodStart = `${startYear + index}-${String(hire.month).padStart(2, "0")}-${String(hire.day).padStart(2, "0")}`;
    const nextStart = `${startYear + index + 1}-${String(hire.month).padStart(2, "0")}-${String(hire.day).padStart(2, "0")}`;
    const periodEnd = addLocalDays(nextStart, -1);
    const status: VacationPeriodStatus = compareIsoDate(periodEnd, asOf) < 0 ? "closed" : compareIsoDate(periodStart, asOf) <= 0 ? "open" : "future";
    return {
      advanceDays: 0,
      availableBalance: status === "closed" ? BASE_ANNUAL_ENTITLEMENT : 0,
      baseDays: BASE_ANNUAL_ENTITLEMENT,
      continuousBlockRequired: CONTINUOUS_BLOCK_MINIMUM_DAYS,
      continuousBlockUsed: 0,
      negativeAdjustments: 0,
      periodEnd,
      periodStart,
      positiveAdjustments: 0,
      progressiveDays: 0,
      reservedDays: 0,
      status,
      usedDays: 0,
      version: 1
    };
  });
}

export function calculateProgressiveVacationDays(input: {
  asOfDate?: string;
  currentEmployerServiceYears: number;
  recognizedPreviousServiceYears: number;
}): ProgressiveVacationCalculation {
  void input.asOfDate;
  if (!Number.isFinite(input.currentEmployerServiceYears) || input.currentEmployerServiceYears < 0) {
    throw new RangeError("current_employer_service_years_invalid");
  }
  if (!Number.isFinite(input.recognizedPreviousServiceYears) || input.recognizedPreviousServiceYears < 0 || input.recognizedPreviousServiceYears > 10) {
    throw new RangeError("recognized_previous_service_years_must_be_between_0_and_10");
  }
  const currentEmployerServiceYears = Math.floor(input.currentEmployerServiceYears);
  const recognizedPreviousServiceYears = Math.floor(input.recognizedPreviousServiceYears);
  const totalRecognizedYears = currentEmployerServiceYears + recognizedPreviousServiceYears;
  const progressiveDays = totalRecognizedYears < 13 ? 0 : Math.floor((totalRecognizedYears - 10) / 3);
  return {
    currentEmployerServiceYears,
    progressiveDays,
    recognizedPreviousServiceYears,
    totalRecognizedYears
  };
}

export function calculateProgressiveDays(currentEmployerHireDate: string, asOf: string, records: ProgressiveRecord[] = []) {
  const accredited = records
    .filter((record) => record.status === "acreditado" && (!record.effectiveFrom || compareIsoDate(record.effectiveFrom, asOf) <= 0))
    .sort((a, b) => compareIsoDate(b.effectiveFrom ?? b.accreditationDate ?? "", a.effectiveFrom ?? a.accreditationDate ?? ""))[0];
  if (!accredited) return 0;
  const previousYears = accredited.previousEmployerYears ?? Math.floor((accredited.creditedMonths ?? 0) / 12);
  const currentYears = ageInCompletedYears(currentEmployerHireDate, asOf);
  return calculateProgressiveVacationDays({
    asOfDate: asOf,
    currentEmployerServiceYears: currentYears,
    recognizedPreviousServiceYears: previousYears
  }).progressiveDays;
}

export function calculateAnnualEntitlement(input: { asOf?: string; hireDate?: string; progressiveDays?: number; progressiveRecords?: ProgressiveRecord[] }) {
  const progressive = input.progressiveDays ?? (input.hireDate && input.asOf ? calculateProgressiveDays(input.hireDate, input.asOf, input.progressiveRecords) : 0);
  return BASE_ANNUAL_ENTITLEMENT + progressive;
}

export function calculateProjectedProportional(annualEntitlement: number, months = 1) {
  return (annualEntitlement / 12) * months;
}

export function calculatePeriodBalance(period: VacationPeriod) {
  const earned = period.baseDays + (period.progressiveDays ?? 0) + (period.positiveAdjustments ?? 0);
  const deductions = (period.negativeAdjustments ?? 0) + (period.usedDays ?? 0) + (period.reservedDays ?? 0) + (period.advanceDays ?? 0);
  return Math.round((earned - deductions) * 1000000) / 1000000;
}

function holidayMatches(holiday: Holiday, regionCode?: string | null, communeCode?: string | null) {
  if (holiday.status === "inactive") return false;
  if (holiday.scope === "national" || holiday.scope === "tenant") return true;
  if (holiday.scope === "region") return !holiday.regionCode || holiday.regionCode === regionCode;
  if (holiday.scope === "commune") return !holiday.communeCode || holiday.communeCode === communeCode;
  return false;
}

export function isLegalHoliday(value: string, holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null) {
  return holidays.some((holiday) => holiday.date === value && holidayMatches(holiday, regionCode, communeCode));
}

export function holidayForDate(value: string, holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null) {
  return holidays.find((holiday) => holiday.date === value && holidayMatches(holiday, regionCode, communeCode)) ?? null;
}

export function normalizeVacationSchedule(schedule: VacationSchedule = {}) {
  const workingWeekdays = schedule.workingWeekdays?.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return {
    dateOverrides: schedule.dateOverrides ?? {},
    holidaysAreWorking: schedule.holidaysAreWorking ?? false,
    source: schedule.source ?? (workingWeekdays?.length ? "employee" : "default"),
    workingWeekdays: workingWeekdays?.length ? Array.from(new Set(workingWeekdays)).sort() : [1, 2, 3, 4, 5]
  };
}

export function classifyWorkCalendarDay(value: string, holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null, schedule: VacationSchedule = {}): WorkCalendarDay {
  const weekday = localWeekday(value);
  const holiday = holidayForDate(value, holidays, regionCode, communeCode);
  const normalized = normalizeVacationSchedule(schedule);
  const override = normalized.dateOverrides[value];
  if (override) {
    return {
      date: value,
      holidayName: override.holidayName ?? holiday?.name ?? null,
      reason: override.reason ?? null,
      source: override.source ?? null,
      type: override.working ? "WORKING_DAY" : "OTHER_NON_WORKING_DAY",
      weekday
    };
  }
  if (holiday && !normalized.holidaysAreWorking) return { date: value, holidayName: holiday.name, reason: "PUBLIC_HOLIDAY", source: "holiday_calendar", type: "HOLIDAY", weekday };
  if (normalized.workingWeekdays.includes(weekday)) {
    return {
      date: value,
      holidayName: holiday?.name ?? null,
      reason: holiday && normalized.holidaysAreWorking ? "PUBLIC_HOLIDAY_WORKED" : "NORMAL_WORKING_DAY",
      source: normalized.source,
      type: "WORKING_DAY",
      weekday
    };
  }
  if (weekday === 0 || weekday === 6) return { date: value, reason: "WEEKEND", source: normalized.source, type: "WEEKEND", weekday };
  return { date: value, reason: "NON_WORKING_WEEKDAY", source: normalized.source, type: "OTHER_NON_WORKING_DAY", weekday };
}

export function isVacationBusinessDay(value: string, holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null, schedule: VacationSchedule = {}) {
  return classifyWorkCalendarDay(value, holidays, regionCode, communeCode, schedule).type === "WORKING_DAY";
}

export type LegalVacationDaysResult = {
  calendarDays: number;
  daysToDeduct: number;
  legalHolidays: number;
  legalHolidayDates: string[];
  legalWorkingDays: number;
  manualNonWorkingDays: number;
  manualNonWorkingDayDates: string[];
  saturdays: number;
  sundays: number;
};

function legalHolidayDateSet(holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null) {
  return new Set(holidays.filter((holiday) => holidayMatches(holiday, regionCode, communeCode)).map((holiday) => holiday.date));
}

export function calculateLegalVacationDays(input: {
  endDate: string;
  legalHolidays?: Holiday[];
  manualNonWorkingDays?: Array<{ date: string; reason?: string | null }>;
  regionCode?: string | null;
  communeCode?: string | null;
  startDate: string;
}): LegalVacationDaysResult {
  if (compareIsoDate(input.endDate, input.startDate) < 0) {
    return {
      calendarDays: 0,
      daysToDeduct: 0,
      legalHolidays: 0,
      legalHolidayDates: [],
      legalWorkingDays: 0,
      manualNonWorkingDays: 0,
      manualNonWorkingDayDates: [],
      saturdays: 0,
      sundays: 0
    };
  }
  const holidayDates = legalHolidayDateSet(input.legalHolidays, input.regionCode, input.communeCode);
  const manualDates = new Set((input.manualNonWorkingDays ?? []).map((day) => day.date));
  const legalHolidayDates = new Set<string>();
  const manualNonWorkingDayDates = new Set<string>();
  let legalWorkingDays = 0;
  let saturdays = 0;
  let sundays = 0;
  for (let cursor = input.startDate; compareIsoDate(cursor, input.endDate) <= 0; cursor = addLocalDays(cursor, 1)) {
    const weekday = localWeekday(cursor);
    if (weekday === 6) {
      saturdays += 1;
      continue;
    }
    if (weekday === 0) {
      sundays += 1;
      continue;
    }
    if (holidayDates.has(cursor)) {
      legalHolidayDates.add(cursor);
      continue;
    }
    if (manualDates.has(cursor)) {
      manualNonWorkingDayDates.add(cursor);
      continue;
    }
    legalWorkingDays += 1;
  }
  return {
    calendarDays: daysBetweenInclusive(input.startDate, input.endDate),
    daysToDeduct: legalWorkingDays,
    legalHolidays: legalHolidayDates.size,
    legalHolidayDates: Array.from(legalHolidayDates),
    legalWorkingDays,
    manualNonWorkingDays: manualNonWorkingDayDates.size,
    manualNonWorkingDayDates: Array.from(manualNonWorkingDayDates),
    saturdays,
    sundays
  };
}

export function calculateVacationBusinessDays(startDate: string, endDate: string, holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null, schedule: VacationSchedule = {}) {
  void schedule;
  return calculateLegalVacationDays({ communeCode, endDate, legalHolidays: holidays, regionCode, startDate }).daysToDeduct;
}

export function calculateVacationOperationalBusinessDays(startDate: string, endDate: string, holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null, schedule: VacationSchedule = {}) {
  if (compareIsoDate(endDate, startDate) < 0) return 0;
  let count = 0;
  for (let cursor = startDate; compareIsoDate(cursor, endDate) <= 0; cursor = addLocalDays(cursor, 1)) {
    if (isVacationBusinessDay(cursor, holidays, regionCode, communeCode, schedule)) count += 1;
  }
  return count;
}

export function countNonBusinessBreakdown(startDate: string, endDate: string, holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null, schedule: VacationSchedule = {}, manualNonWorkingDays: Array<{ date: string; reason?: string | null }> = []) {
  const legal = calculateLegalVacationDays({ communeCode, endDate, legalHolidays: holidays, manualNonWorkingDays, regionCode, startDate });
  const holidayDates = new Set<string>();
  const workCalendar: WorkCalendarDay[] = [];
  let companyClosed = 0;
  let mondayClosed = 0;
  let publicHolidaysWorked = 0;
  let scheduledSundayOff = 0;
  const workedHolidayDates = new Set<string>();
  for (let cursor = startDate; compareIsoDate(cursor, endDate) <= 0; cursor = addLocalDays(cursor, 1)) {
    const day = classifyWorkCalendarDay(cursor, holidays, regionCode, communeCode, schedule);
    workCalendar.push(day);
    if (day.type === "HOLIDAY") holidayDates.add(cursor);
    if (day.reason === "PUBLIC_HOLIDAY_WORKED") workedHolidayDates.add(cursor);
    if (day.reason === "MONDAY_CLOSED") mondayClosed += 1;
    if (day.reason === "SCHEDULED_SUNDAY_OFF") scheduledSundayOff += 1;
    if (day.reason === "COMPANY_CLOSED") companyClosed += 1;
    if (day.reason === "PUBLIC_HOLIDAY_WORKED") publicHolidaysWorked += 1;
  }
  return {
    companyClosed,
    daysToDeduct: legal.daysToDeduct,
    holidays: legal.legalHolidays,
    holidayDates: legal.legalHolidayDates,
    legalHolidays: legal.legalHolidays,
    legalWorkingDays: legal.legalWorkingDays,
    mondayClosed,
    otherNonWorkingDays: legal.manualNonWorkingDays,
    manualNonWorkingDays: legal.manualNonWorkingDays,
    manualNonWorkingDayDates: legal.manualNonWorkingDayDates,
    publicHolidaysWorked,
    saturdays: legal.saturdays,
    scheduledSundayOff,
    sundays: legal.sundays,
    workedHolidayDates: Array.from(workedHolidayDates),
    workCalendar
  };
}

export function yearsInRange(startDate: string, endDate: string) {
  const start = parts(startDate).year;
  const end = parts(endDate).year;
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

export function evaluateHolidayCalendarStatus(startDate: string, endDate: string, statusByYear: Record<string, HolidayCalendarStatus> = {}) {
  const years = yearsInRange(startDate, endDate);
  const statuses = years.map((year) => statusByYear[String(year)] ?? "missing");
  const calendarStatus: HolidayCalendarStatus = statuses.includes("missing") ? "missing" : statuses.includes("incomplete") ? "incomplete" : "verified";
  const calendarWarnings = years
    .map((year, index) => ({ status: statuses[index], year }))
    .filter((item) => item.status !== "verified")
    .map((item) => `Calendario ${item.year}: ${item.status === "missing" ? "no configurado" : "incompleto"}`);
  return { calendarStatus, calendarWarnings, years };
}

export function calculateVacationEndDate(startDate: string, requestedBusinessDays: number, holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null, schedule: VacationSchedule = {}, manualNonWorkingDays: Array<{ date: string; reason?: string | null }> = []) {
  void schedule;
  if (requestedBusinessDays <= 0) return startDate;
  let counted = 0;
  let cursor = startDate;
  while (counted < requestedBusinessDays) {
    if (calculateLegalVacationDays({ communeCode, endDate: cursor, legalHolidays: holidays, manualNonWorkingDays, regionCode, startDate: cursor }).daysToDeduct === 1) counted += 1;
    if (counted < requestedBusinessDays) cursor = addLocalDays(cursor, 1);
  }
  return cursor;
}

export function calculateEffectiveRestEnd(startDate: string, lastCountedVacationDate: string) {
  let cursor = lastCountedVacationDate;
  while (localWeekday(addLocalDays(cursor, 1)) === 0 || localWeekday(addLocalDays(cursor, 1)) === 6) {
    cursor = addLocalDays(cursor, 1);
  }
  return compareIsoDate(cursor, startDate) < 0 ? startDate : cursor;
}

export function calculateReturnToWorkDate(lastRestDate: string, schedule: VacationSchedule = {}) {
  let cursor = addLocalDays(lastRestDate, 1);
  for (let guard = 0; guard < 14; guard += 1) {
    if (classifyWorkCalendarDay(cursor, [], null, null, schedule).type === "WORKING_DAY") {
      return {
        returnDate: cursor,
        returnDateManuallyConfirmed: Boolean(schedule.workingWeekdays?.length),
        scheduleSource: schedule.source ?? (schedule.workingWeekdays?.length ? "employee" : "default"),
        requiresConfirmation: !schedule.workingWeekdays?.length
      };
    }
    cursor = addLocalDays(cursor, 1);
  }
  return { returnDate: cursor, returnDateManuallyConfirmed: false, requiresConfirmation: true, scheduleSource: "default" as const };
}

export function allocateVacationFifo(periods: VacationPeriod[], requestedDays: number, options: { allowAdvance?: boolean } = {}) {
  let remaining = requestedDays;
  const allocations: VacationAllocation[] = [];
  const sorted = periods
    .map((period) => ({ ...period, availableBalance: period.availableBalance ?? calculatePeriodBalance(period) }))
    .sort((a, b) => compareIsoDate(a.periodStart, b.periodStart));

  sorted.forEach((period) => {
    if (remaining <= 0) return;
    const available = Math.max(0, period.availableBalance ?? 0);
    const days = Math.min(available, remaining);
    if (days > 0) {
      allocations.push({
        allocationOrder: allocations.length + 1,
        allocationType: "earned",
        days,
        periodEnd: period.periodEnd,
        periodId: period.id,
        periodStart: period.periodStart,
        previousBalance: available,
        resultingBalance: Math.round((available - days) * 1000000) / 1000000
      });
      remaining = Math.round((remaining - days) * 1000000) / 1000000;
    }
  });

  if (remaining > 0 && options.allowAdvance) {
    const future = sorted.find((period) => period.status === "future") ?? sorted[sorted.length - 1];
    if (future) {
      allocations.push({
        allocationOrder: allocations.length + 1,
        allocationType: "advance",
        days: remaining,
        periodEnd: future.periodEnd,
        periodId: future.id,
        periodStart: future.periodStart,
        previousBalance: 0,
        resultingBalance: -remaining
      });
      remaining = 0;
    }
  }

  return { allocations, remainingDays: Math.round(remaining * 1000000) / 1000000 };
}

export function validateContinuousBlock(period: VacationPeriod, requestedDays: number) {
  const required = period.continuousBlockRequired ?? CONTINUOUS_BLOCK_MINIMUM_DAYS;
  const used = period.continuousBlockUsed ?? 0;
  const available = period.availableBalance ?? calculatePeriodBalance(period);
  if (requestedDays >= required) return { ok: true, reason: null, remainingProtectedBlock: 0 };
  if (used >= required) return { ok: true, reason: null, remainingProtectedBlock: 0 };
  const remainingAfter = available - requestedDays;
  const remainingProtectedBlock = Math.max(0, required - used);
  if (remainingAfter >= remainingProtectedBlock) return { ok: true, reason: null, remainingProtectedBlock };
  return { ok: false, reason: "continuous_block_would_be_broken", remainingProtectedBlock };
}

export function validateFractionation(input: FractionationInput) {
  if (input.requestedDays >= CONTINUOUS_BLOCK_MINIMUM_DAYS) return { ok: true, reason: null };
  const invalid = input.periods
    .map((period) => validateContinuousBlock(period, input.requestedDays))
    .find((result) => !result.ok);
  if (invalid) return invalid;
  return invalid ?? { ok: true, reason: null };
}

export function validateAdvanceVacation(input: AdvanceVacationInput) {
  const shortage = Math.max(0, input.requestedDays - input.availableDays);
  if (shortage <= 0) return { ok: true, advanceDays: 0, reason: null };
  if (!input.advanceAuthorized) return { ok: false, advanceDays: shortage, reason: "advance_vacation_requires_explicit_authorization" };
  if (shortage > input.projectedProportionalDays) return { ok: false, advanceDays: shortage, reason: "advance_exceeds_projected_proportional" };
  return { ok: true, advanceDays: shortage, reason: null };
}

export function reverseVacationAllocation(allocations: VacationAllocation[]) {
  return allocations.map((allocation) => ({
    ...allocation,
    allocationType: "reversal" as const,
    days: -allocation.days,
    previousBalance: allocation.resultingBalance,
    resultingBalance: allocation.previousBalance
  }));
}

export function findVacationPeriodReviewReasons(periods: VacationPeriod[]) {
  const reasons: string[] = [];
  const sorted = [...periods].sort((a, b) => compareIsoDate(a.periodStart, b.periodStart));
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (compareIsoDate(previous.periodEnd, current.periodStart) >= 0) {
      reasons.push("vacation_period_ambiguous");
      break;
    }
  }
  return reasons;
}

export function uniqueReasons(reasons: Array<string | null | undefined>) {
  return [...new Set(reasons.filter((reason): reason is string => Boolean(reason)))];
}

export function calculateVacationPreview(input: VacationPreviewInput) {
  const asOf = input.asOf ?? input.startDate;
  const normalizedSchedule = normalizeVacationSchedule(input.schedule);
  const progressiveDays = input.hireDate ? calculateProgressiveDays(input.hireDate, asOf, input.progressiveRecords) : 0;
  const annualEntitlement = calculateAnnualEntitlement({ progressiveDays });
  const generatedPeriods = generateContractPeriods(input.hireDate, asOf, 1).map((period) => ({
    ...period,
    availableBalance: period.status === "closed" ? BASE_ANNUAL_ENTITLEMENT + progressiveDays : period.availableBalance,
    baseDays: BASE_ANNUAL_ENTITLEMENT,
    progressiveDays
  }));
  const periods = input.periods?.length ? input.periods : generatedPeriods;
  const endDate = input.requestedBusinessDays ? calculateVacationEndDate(input.startDate, input.requestedBusinessDays, input.holidays, input.regionCode, null, normalizedSchedule, input.manualNonWorkingDays) : input.endDate ?? input.startDate;
  const legalDays = calculateLegalVacationDays({
    endDate,
    legalHolidays: input.holidays,
    manualNonWorkingDays: input.manualNonWorkingDays,
    regionCode: input.regionCode,
    startDate: input.startDate
  });
  const businessDays = input.requestedBusinessDays ?? legalDays.daysToDeduct;
  const lastCountedVacationDate = input.requestedBusinessDays ? endDate : calculateVacationEndDate(input.startDate, businessDays, input.holidays, input.regionCode, null, normalizedSchedule, input.manualNonWorkingDays);
  const effectiveRestEndDate = calculateEffectiveRestEnd(input.startDate, lastCountedVacationDate);
  const returnInfo = calculateReturnToWorkDate(effectiveRestEndDate, normalizedSchedule);
  const nonBusiness = countNonBusinessBreakdown(input.startDate, effectiveRestEndDate, input.holidays, input.regionCode, null, normalizedSchedule, input.manualNonWorkingDays);
  const calendar = evaluateHolidayCalendarStatus(input.startDate, effectiveRestEndDate, input.calendarStatusByYear);
  const totalAvailable = periods.reduce((sum, period) => sum + (period.availableBalance ?? calculatePeriodBalance(period)), 0);
  const projectedProportional = calculateProjectedProportional(annualEntitlement);
  const advanceValidation = validateAdvanceVacation({
    advanceAuthorized: input.advanceAuthorized,
    availableDays: totalAvailable,
    projectedProportionalDays: projectedProportional,
    requestedDays: businessDays
  });
  const fifo = allocateVacationFifo(periods, businessDays, { allowAdvance: advanceValidation.ok && advanceValidation.advanceDays > 0 });
  const affectedPeriods = periods.filter((period) => fifo.allocations.some((allocation) => allocation.periodStart === period.periodStart));
  const fractionation = validateFractionation({ agreementAccepted: input.agreementAccepted, periods: affectedPeriods, requestedDays: businessDays });
  const periodReviewReasons = findVacationPeriodReviewReasons(periods);
  const calendarBlockingReasons = input.calendarStatusByYear && calendar.calendarStatus === "missing"
    ? [`holiday_calendar_${calendar.calendarStatus}`]
    : [];
  const reviewReasons = uniqueReasons([
    businessDays <= 0 ? "vacation_days_to_deduct_must_be_positive" : null,
    fifo.remainingDays > 0 ? "insufficient_vacation_balance" : null,
    advanceValidation.ok ? null : advanceValidation.reason,
    fractionation.ok ? null : fractionation.reason,
    ...periodReviewReasons,
    ...calendarBlockingReasons
  ]);
  const canConfirm = reviewReasons.length === 0;

  return {
    advanceDays: advanceValidation.advanceDays,
    advanceValidation,
    affectedPeriods,
    allocations: fifo.allocations,
    annualEntitlement,
    businessDays,
    calendarDays: daysBetweenInclusive(input.startDate, effectiveRestEndDate),
    calendarStatus: calendar.calendarStatus,
    calendarWarnings: calendar.calendarWarnings,
    effectiveRestEndDate,
    fractionation,
    lastCountedVacationDate,
    nonBusiness,
    holidaysApplied: nonBusiness.holidayDates,
    periods,
    projectedProportional,
    remainingDays: fifo.remainingDays,
    returnDateManuallyConfirmed: returnInfo.returnDateManuallyConfirmed,
    returnToWorkDate: returnInfo.returnDate,
    blockingWarnings: reviewReasons,
    canConfirm,
    requiresReview: !canConfirm,
    reviewReasons,
    scheduleSource: returnInfo.scheduleSource,
    scheduleReviewRequired: !input.schedule?.workingWeekdays?.length && input.schedule?.source !== "company_policy",
    totalAvailable,
    totalAfterRequest: Math.round((totalAvailable - businessDays) * 1000000) / 1000000,
    valid: canConfirm
  };
}

export const CHILE_HOLIDAYS_FIXTURE: Holiday[] = [
  { date: "2026-01-01", mandatory: true, name: "Ano Nuevo", scope: "national", sourceName: "Fixture RRHH", status: "active" } as Holiday,
  { date: "2026-05-01", mandatory: true, name: "Dia Nacional del Trabajo", scope: "national", sourceName: "Fixture RRHH", status: "active" } as Holiday,
  { date: "2026-05-21", mandatory: true, name: "Glorias Navales", scope: "national", sourceName: "Fixture RRHH", status: "active" } as Holiday,
  { date: "2026-09-18", mandatory: true, name: "Independencia Nacional", scope: "national", sourceName: "Fixture RRHH", status: "active" } as Holiday,
  { date: "2026-09-19", mandatory: true, name: "Glorias del Ejercito", scope: "national", sourceName: "Fixture RRHH", status: "active" } as Holiday,
  { date: "2026-12-25", mandatory: true, name: "Navidad", scope: "national", sourceName: "Fixture RRHH", status: "active" } as Holiday,
  { date: "2026-07-16", mandatory: false, name: "Feriado regional de prueba", regionCode: "RM", scope: "region", sourceName: "Fixture RRHH", status: "active" } as Holiday
];
