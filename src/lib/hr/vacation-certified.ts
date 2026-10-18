import { ageInCompletedYears, calculateProgressiveDays, type ProgressiveRecord, type VacationPeriod } from "./vacation-domain.ts";
import { parseVacationDays } from "./vacation-days.ts";

export type CertifiedOpeningBalance = Readonly<{
  absorbedRequestIds?: readonly string[];
  entitlementChanges?: ReadonlyArray<{ effectiveFrom: string; progressiveDaysCurrent: number; recognizedPreviousYears: number | null; annualEntitlementOverride: number | null }>;
  id: string;
  employeeId: string;
  tenantId: string;
  balanceDays: number;
  effectiveCutoffDate: string;
  hireDate: string;
  baseDays: number;
  progressiveDaysCurrent: number;
  annualEntitlementOverride: number | null;
  overrideReason: string | null;
  recognizedPreviousYears: number | null;
  internalAlert: string | null;
  source: string;
}>;

export function vacationToday(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return `${p.find(x => x.type === "year")!.value}-${p.find(x => x.type === "month")!.value}-${p.find(x => x.type === "day")!.value}`;
}

export function anniversaryInYear(hireDate: string, year: number) {
  const month = Number(hireDate.slice(5, 7));
  const day = Math.min(Number(hireDate.slice(8, 10)), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function nextVacationAnniversary(hireDate: string, after: string) {
  const year = Number(after.slice(0, 4));
  const candidate = anniversaryInYear(hireDate, year);
  return candidate > after ? candidate : anniversaryInYear(hireDate, year + 1);
}

export function certifiedAnnualEntitlement(opening: CertifiedOpeningBalance, asOf: string) {
  const change = [...(opening.entitlementChanges ?? [])].filter(c => c.effectiveFrom <= asOf).sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (change) opening = { ...opening, ...change, entitlementChanges: [] };
  if (opening.annualEntitlementOverride !== null) return opening.annualEntitlementOverride;
  const years = ageInCompletedYears(opening.hireDate, asOf);
  const previous = opening.recognizedPreviousYears ?? 0;
  const legalProgressive = Math.max(0, Math.floor((years + previous - 10) / 3));
  return opening.baseDays + Math.max(opening.progressiveDaysCurrent, legalProgressive);
}

export function buildCertifiedVacationPeriods(opening: CertifiedOpeningBalance, persisted: VacationPeriod[], asOf: string) {
  if (opening.effectiveCutoffDate > asOf) return null;
  const buckets: VacationPeriod[] = [{
    id: `certified:${opening.id}`, employeeId: opening.employeeId, tenantId: opening.tenantId,
    openingBalanceId: opening.id, earnedOn: opening.effectiveCutoffDate,
    periodStart: opening.effectiveCutoffDate, periodEnd: opening.effectiveCutoffDate,
    baseDays: 0, progressiveDays: 0, positiveAdjustments: Math.max(0, opening.balanceDays),
    negativeAdjustments: Math.max(0, -opening.balanceDays), availableBalance: opening.balanceDays,
    continuousBlockRequired: 10, continuousBlockUsed: 0, status: "open"
  }];
  for (let year = Number(opening.effectiveCutoffDate.slice(0, 4)); year <= Number(asOf.slice(0, 4)); year++) {
    const earnedOn = anniversaryInYear(opening.hireDate, year);
    if (earnedOn <= opening.effectiveCutoffDate || earnedOn > asOf || ageInCompletedYears(opening.hireDate, earnedOn) < 1) continue;
    const annual = certifiedAnnualEntitlement(opening, earnedOn);
    buckets.push({ id: `annuity:${opening.id}:${earnedOn}`, employeeId: opening.employeeId, tenantId: opening.tenantId,
      openingBalanceId: opening.id, earnedOn, periodStart: earnedOn, periodEnd: earnedOn,
      baseDays: opening.baseDays, progressiveDays: annual - opening.baseDays, availableBalance: annual,
      continuousBlockRequired: 10, continuousBlockUsed: 0, status: "open" });
  }
  return buckets.map(bucket => persisted.find(p => p.openingBalanceId === opening.id && p.earnedOn === bucket.earnedOn) ?? bucket);
}

export function certifiedVacationSummary(opening: CertifiedOpeningBalance, persisted: VacationPeriod[], asOf: string) {
  const periods = buildCertifiedVacationPeriods(opening, persisted, asOf);
  if (!periods) return { isActive: false as const, nextAnniversary: nextVacationAnniversary(opening.hireDate, opening.effectiveCutoffDate) };
  const available = periods.reduce((sum, p) => sum + (p.availableBalance ?? 0), 0);
  return { isActive: true as const, periods, available: Math.round(available * 10000) / 10000,
    adjustments: Math.round((periods.reduce((s,p) => s + (p.positiveAdjustments ?? 0) - (p.negativeAdjustments ?? 0), 0) - opening.balanceDays) * 10000) / 10000,
    opening: opening.balanceDays, accrued: periods.slice(1).reduce((s,p) => s + p.baseDays + (p.progressiveDays ?? 0), 0),
    used: periods.reduce((s,p) => s + (p.usedDays ?? 0), 0), reserved: periods.reduce((s,p) => s + (p.reservedDays ?? 0), 0),
    annual: certifiedAnnualEntitlement(opening, asOf), nextAnniversary: nextVacationAnniversary(opening.hireDate, asOf) };
}

export function mapCertifiedOpening(row: Record<string, unknown>): CertifiedOpeningBalance {
  return Object.freeze({ absorbedRequestIds: (row.absorbed_request_ids ?? []) as string[], entitlementChanges: ((row.entitlement_changes ?? []) as Array<Record<string, unknown>>).map(c => ({effectiveFrom:String(c.effective_from),
    progressiveDaysCurrent:Number(c.progressive_days_current),recognizedPreviousYears:c.recognized_previous_years==null?null:Number(c.recognized_previous_years),
    annualEntitlementOverride:c.annual_entitlement_override==null?null:Number(c.annual_entitlement_override)})),
    id: String(row.id), employeeId: String(row.employee_id), tenantId: String(row.tenant_id),
    balanceDays: Number(row.balance_days), effectiveCutoffDate: String(row.effective_cutoff_date), hireDate: String(row.hire_date),
    baseDays: Number(row.base_days), progressiveDaysCurrent: Number(row.progressive_days_current),
    annualEntitlementOverride: row.annual_entitlement_override == null ? null : Number(row.annual_entitlement_override),
    overrideReason: row.override_reason as string | null, recognizedPreviousYears: row.recognized_previous_years == null ? null : Number(row.recognized_previous_years),
    internalAlert: row.internal_alert as string | null, source: String(row.source) });
}

export function previewCertifiedVacationBalances(input: {
  rows: Array<{ rowNumber: number; values: Record<string, string> }>;
  employees: Array<{ id: string; rut: string; fullName: string; hireDate: string | null; tenantId: string; currentBalance: number; progressiveRecords?: ProgressiveRecord[] }>;
  cutoffDate: string; asOf: string;
  overrides?: Record<string, { annual: number; progressive: number; reason: string; alert?: string }>;
}) {
  const norm = (v: string) => v.replace(/[.\s-]/g, "").toUpperCase();
  const counts = new Map<string, number>();
  for (const row of input.rows) { const rut = norm(row.values.RUT ?? ""); counts.set(rut, (counts.get(rut) ?? 0) + 1); }
  return input.rows.map(row => {
    const rut = norm(row.values.RUT ?? "");
    const matches = input.employees.filter(e => norm(e.rut) === rut);
    const employee = matches.length === 1 ? matches[0] : null;
    const balance = parseVacationDays(row.values.VACACIONES ?? row.values.Saldo);
    const override = input.overrides?.[rut];
    const progressive = employee?.hireDate ? calculateProgressiveDays(employee.hireDate, input.cutoffDate, employee.progressiveRecords ?? []) : 0;
    const ownProgressive = employee?.hireDate ? Math.max(0, Math.floor((ageInCompletedYears(employee.hireDate, input.cutoffDate) - 10) / 3)) : 0;
    const alerts = [balance !== null && balance < 0 ? "SALDO CERTIFICADO NEGATIVO" : null, override?.alert].filter(Boolean);
    const status = (counts.get(rut) ?? 0) > 1 || matches.length > 1 ? "RUT DUPLICADO" : !employee ? "RUT NO ENCONTRADO" : balance === null || !employee.hireDate ? "REVISAR" : override?.alert ? "LISTO CON ALERTA" : "LISTO";
    return { rowNumber: row.rowNumber, rut, employeeId: employee?.id ?? null, employeeName: employee?.fullName ?? row.values.NOMBRE,
      balanceDays: balance, cutoffDate: input.cutoffDate, isActive: input.cutoffDate <= input.asOf,
      currentBalance: employee?.currentBalance ?? null, annualEntitlement: employee ? override?.annual ?? 15 + Math.max(progressive, ownProgressive) : null,
      progressiveDays: employee ? override?.progressive ?? Math.max(progressive, ownProgressive) : null,
      override: Boolean(override), overrideReason: override?.reason ?? null,
      nextAnniversary: employee?.hireDate ? nextVacationAnniversary(employee.hireDate, input.cutoffDate) : null, status, alerts };
  });
}
