import {
  addLocalDays,
  calculatePeriodBalance,
  compareIsoDate,
  generateContractPeriods,
  isoFromUtcDate,
  type VacationPeriod
} from "./vacation-domain.ts";

export type VacationPeriodRowLike = {
  id?: string;
  employee_id?: string;
  period_start: string;
  period_end: string;
  base_days?: number | string | null;
  progressive_days?: number | string | null;
  positive_adjustments?: number | string | null;
  negative_adjustments?: number | string | null;
  used_days?: number | string | null;
  reserved_days?: number | string | null;
  advance_days?: number | string | null;
  available_balance?: number | string | null;
  continuous_block_required?: number | string | null;
  continuous_block_used?: number | string | null;
  status?: string | null;
};

export type VacationMovementLike = {
  days: number | string | null;
  effective_date?: string | null;
  movement_type: string;
};

export type ExpectedVacationPeriod = {
  baseDays: number;
  periodEnd: string;
  periodStart: string;
  status: "open" | "closed" | "future";
};

export type VacationBackfillPreview = {
  conflicts: Array<{ employeeId: string; periodEnd: string; periodStart: string; reason: string }>;
  expectedCount: number;
  existingCount: number;
  missing: ExpectedVacationPeriod[];
};

export type VacationBalanceBreakdown = {
  accrued: number;
  anticipated: number;
  available: number;
  progressive: number;
  reserved: number;
  used: number;
};

function num(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundDays(value: number) {
  return Math.round(value * 1000000) / 1000000;
}

export function buildExpectedVacationPeriods(hireDate: string, asOf = isoFromUtcDate(new Date()), yearsForward = 1): ExpectedVacationPeriod[] {
  return generateContractPeriods(hireDate, asOf, yearsForward).map((period) => ({
    baseDays: period.baseDays,
    periodEnd: period.periodEnd,
    periodStart: period.periodStart,
    status: period.status ?? "future"
  }));
}

function overlaps(a: { periodEnd: string; periodStart: string }, b: { periodEnd: string; periodStart: string }) {
  return compareIsoDate(a.periodStart, b.periodEnd) <= 0 && compareIsoDate(b.periodStart, a.periodEnd) <= 0;
}

export function previewVacationPeriodBackfill(input: {
  asOf?: string;
  existingPeriods: VacationPeriodRowLike[];
  hireDate: string | null | undefined;
  employeeId: string;
  yearsForward?: number;
}): VacationBackfillPreview {
  if (!input.hireDate) return { conflicts: [], existingCount: input.existingPeriods.length, expectedCount: 0, missing: [] };
  const expected = buildExpectedVacationPeriods(input.hireDate, input.asOf, input.yearsForward);
  const exact = new Set(input.existingPeriods.map((period) => `${period.period_start}|${period.period_end}`));
  const missing = expected.filter((period) => !exact.has(`${period.periodStart}|${period.periodEnd}`));
  const conflicts = missing.flatMap((period) =>
    input.existingPeriods
      .filter((existing) => overlaps(period, { periodEnd: existing.period_end, periodStart: existing.period_start }))
      .map(() => ({ employeeId: input.employeeId, periodEnd: period.periodEnd, periodStart: period.periodStart, reason: "overlap_existing_period" }))
  );
  return { conflicts, existingCount: input.existingPeriods.length, expectedCount: expected.length, missing };
}

export function toVacationPeriod(row: VacationPeriodRowLike): VacationPeriod {
  return {
    advanceDays: num(row.advance_days),
    availableBalance: num(row.available_balance),
    baseDays: num(row.base_days ?? 15),
    continuousBlockRequired: num(row.continuous_block_required ?? 10),
    continuousBlockUsed: num(row.continuous_block_used),
    id: row.id,
    negativeAdjustments: num(row.negative_adjustments),
    periodEnd: row.period_end,
    periodStart: row.period_start,
    positiveAdjustments: num(row.positive_adjustments),
    progressiveDays: num(row.progressive_days),
    reservedDays: num(row.reserved_days),
    status: row.status === "closed" || row.status === "future" ? row.status : "open",
    usedDays: num(row.used_days)
  };
}

export function calculateVacationBalanceAt(input: {
  asOf?: string;
  movements?: VacationMovementLike[];
  periods: VacationPeriodRowLike[];
}): VacationBalanceBreakdown {
  const asOf = input.asOf ?? isoFromUtcDate(new Date());
  const periods = input.periods
    .filter((period) => compareIsoDate(period.period_start, asOf) <= 0)
    .map(toVacationPeriod);
  const accrued = periods.reduce((sum, period) => sum + period.baseDays + (period.progressiveDays ?? 0) + (period.positiveAdjustments ?? 0), 0);
  const progressive = periods.reduce((sum, period) => sum + (period.progressiveDays ?? 0), 0);
  const used = periods.reduce((sum, period) => sum + (period.usedDays ?? 0), 0);
  const reserved = periods.reduce((sum, period) => sum + (period.reservedDays ?? 0), 0);
  const anticipated = periods.reduce((sum, period) => sum + (period.advanceDays ?? 0), 0);
  const periodAvailable = periods.reduce((sum, period) => sum + calculatePeriodBalance(period), 0);
  const importedAdjustments = (input.movements ?? [])
    .filter((movement) => movement.effective_date && compareIsoDate(movement.effective_date, asOf) <= 0)
    .filter((movement) => ["initial_balance", "imported_history"].includes(movement.movement_type))
    .reduce((sum, movement) => sum + num(movement.days), 0);
  return {
    accrued: roundDays(accrued + importedAdjustments),
    anticipated: roundDays(anticipated),
    available: roundDays(periodAvailable),
    progressive: roundDays(progressive),
    reserved: roundDays(reserved),
    used: roundDays(used)
  };
}

export function findVacationPeriodForDate(periods: VacationPeriodRowLike[], value: string) {
  return periods
    .filter((period) => compareIsoDate(period.period_start, value) <= 0 && compareIsoDate(value, period.period_end) <= 0)
    .sort((a, b) => compareIsoDate(a.period_start, b.period_start))[0] ?? null;
}

export function nextContractPeriodStart(period: VacationPeriodRowLike) {
  return addLocalDays(period.period_end, 1);
}
