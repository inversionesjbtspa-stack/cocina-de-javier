export const VACATION_TIMEZONE = "America/Santiago";
export const BASE_ANNUAL_ENTITLEMENT = 15;
export const CONTINUOUS_BLOCK_MINIMUM_DAYS = 10;

export type VacationStatus = "borrador" | "solicitada" | "pendiente" | "aprobada" | "rechazada" | "anulada" | "en_curso" | "finalizada";
export type VacationPeriodStatus = "open" | "closed" | "future";
export type VacationAllocationType = "earned" | "reserved" | "advance" | "reversal";
export type VacationSchedule = {
  workingWeekdays?: number[];
  source?: "employee" | "contract" | "default" | "manual";
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

export function calculateProgressiveDays(currentEmployerHireDate: string, asOf: string, records: ProgressiveRecord[] = []) {
  const accredited = records
    .filter((record) => record.status === "acreditado" && (!record.effectiveFrom || compareIsoDate(record.effectiveFrom, asOf) <= 0))
    .sort((a, b) => compareIsoDate(b.effectiveFrom ?? b.accreditationDate ?? "", a.effectiveFrom ?? a.accreditationDate ?? ""))[0];
  if (!accredited) return 0;
  const previousYears = Math.min(10, Math.max(0, accredited.previousEmployerYears ?? Math.floor((accredited.creditedMonths ?? 0) / 12)));
  const currentYears = ageInCompletedYears(currentEmployerHireDate, asOf);
  const eligibleYearsAfterBase = Math.max(0, previousYears + currentYears - 10);
  return Math.max(accredited.recognizedDays ?? 0, Math.floor(eligibleYearsAfterBase / 3));
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

export function isVacationBusinessDay(value: string, holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null) {
  const weekday = localWeekday(value);
  if (weekday === 0 || weekday === 6) return false;
  return !isLegalHoliday(value, holidays, regionCode, communeCode);
}

export function calculateVacationBusinessDays(startDate: string, endDate: string, holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null) {
  if (compareIsoDate(endDate, startDate) < 0) return 0;
  let count = 0;
  for (let cursor = startDate; compareIsoDate(cursor, endDate) <= 0; cursor = addLocalDays(cursor, 1)) {
    if (isVacationBusinessDay(cursor, holidays, regionCode, communeCode)) count += 1;
  }
  return count;
}

export function countNonBusinessBreakdown(startDate: string, endDate: string, holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null) {
  const holidayDates = new Set<string>();
  let saturdays = 0;
  let sundays = 0;
  for (let cursor = startDate; compareIsoDate(cursor, endDate) <= 0; cursor = addLocalDays(cursor, 1)) {
    const weekday = localWeekday(cursor);
    if (weekday === 6) saturdays += 1;
    if (weekday === 0) sundays += 1;
    if (isLegalHoliday(cursor, holidays, regionCode, communeCode)) holidayDates.add(cursor);
  }
  return { holidays: holidayDates.size, holidayDates: Array.from(holidayDates), saturdays, sundays };
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

export function calculateVacationEndDate(startDate: string, requestedBusinessDays: number, holidays: Holiday[] = [], regionCode?: string | null, communeCode?: string | null) {
  if (requestedBusinessDays <= 0) return startDate;
  let counted = 0;
  let cursor = startDate;
  while (counted < requestedBusinessDays) {
    if (isVacationBusinessDay(cursor, holidays, regionCode, communeCode)) counted += 1;
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
  const workingWeekdays = schedule.workingWeekdays?.length ? schedule.workingWeekdays : [1, 2, 3, 4, 5];
  let cursor = addLocalDays(lastRestDate, 1);
  for (let guard = 0; guard < 14; guard += 1) {
    if (workingWeekdays.includes(localWeekday(cursor))) {
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
  if (!input.agreementAccepted) return { ok: false, reason: "fractionation_agreement_required" };
  const invalid = input.periods
    .map((period) => validateContinuousBlock(period, input.requestedDays))
    .find((result) => !result.ok);
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

export function calculateVacationPreview(input: VacationPreviewInput) {
  const asOf = input.asOf ?? input.startDate;
  const annualEntitlement = calculateAnnualEntitlement({ asOf, hireDate: input.hireDate, progressiveRecords: input.progressiveRecords });
  const generatedPeriods = generateContractPeriods(input.hireDate, asOf, 1).map((period) => ({ ...period, baseDays: annualEntitlement }));
  const periods = input.periods?.length ? input.periods : generatedPeriods;
  const endDate = input.requestedBusinessDays ? calculateVacationEndDate(input.startDate, input.requestedBusinessDays, input.holidays, input.regionCode) : input.endDate ?? input.startDate;
  const businessDays = input.requestedBusinessDays ?? calculateVacationBusinessDays(input.startDate, endDate, input.holidays, input.regionCode);
  const lastCountedVacationDate = calculateVacationEndDate(input.startDate, businessDays, input.holidays, input.regionCode);
  const effectiveRestEndDate = calculateEffectiveRestEnd(input.startDate, lastCountedVacationDate);
  const returnInfo = calculateReturnToWorkDate(effectiveRestEndDate, input.schedule);
  const nonBusiness = countNonBusinessBreakdown(input.startDate, effectiveRestEndDate, input.holidays, input.regionCode);
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

  return {
    advanceDays: advanceValidation.advanceDays,
    advanceValidation,
    affectedPeriods,
    allocations: fifo.allocations,
    annualEntitlement,
    businessDays,
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
    scheduleSource: returnInfo.scheduleSource,
    totalAvailable,
    valid: fifo.remainingDays === 0 && advanceValidation.ok && fractionation.ok
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
