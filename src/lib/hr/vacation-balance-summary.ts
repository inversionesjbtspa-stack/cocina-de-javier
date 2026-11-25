import { certifiedVacationSummary, type CertifiedOpeningBalance } from "./vacation-certified.ts";
import { calculateProjectedProportional, type VacationPeriod } from "./vacation-domain.ts";
import { VACATION_CERTIFICATION_REQUIRED_MESSAGE } from "./vacation-certification-policy.ts";

export type VacationBalanceSummary = {
  employeeId: string;
  asOf: string;
  status: "CERTIFICADO" | "REQUIERE SALDO CERTIFICADO";
  certifiedBalance: number | null;
  accruedPostCutoff: number | null;
  adjustments: number | null;
  used: number | null;
  reserved: number | null;
  availableBalance: number | null;
  annualEntitlement: number | null;
  baseDays: number | null;
  progressiveDays: number | null;
  nextAnniversary: string | null;
  projectedProportional: number | null;
  advanceDays: number | null;
  informativePeriods: number | null;
  alerts: string[];
  periods: VacationPeriod[];
};

// Presentation only: the certified domain remains the owner of balance arithmetic.
export function getVacationBalanceSummary(input: {
  employeeId: string;
  asOf: string;
  opening?: CertifiedOpeningBalance | null;
  periods: VacationPeriod[];
}): VacationBalanceSummary {
  const { employeeId, asOf, opening } = input;
  if (opening && opening.employeeId !== employeeId) throw new Error("vacation_summary_owner_mismatch");
  const summary = opening ? certifiedVacationSummary(opening, input.periods, asOf) : null;
  if (!summary?.isActive || !opening) return {
    employeeId, asOf, status: "REQUIERE SALDO CERTIFICADO", certifiedBalance: null,
    accruedPostCutoff: null, adjustments: null, used: null, reserved: null, availableBalance: null,
    annualEntitlement: null, baseDays: null, progressiveDays: null, nextAnniversary: null,
    projectedProportional: null, advanceDays: null, informativePeriods: null,
    alerts: [VACATION_CERTIFICATION_REQUIRED_MESSAGE], periods: []
  };
  const periods = summary.periods.map(period => {
    if ((period.employeeId && period.employeeId !== employeeId) || (period.tenantId && period.tenantId !== opening.tenantId)) {
      throw new Error("vacation_summary_owner_mismatch");
    }
    return { ...period, employeeId, tenantId: opening.tenantId };
  });
  const informativePeriods = periods.filter(period => (period.earnedOn ?? "") > opening.effectiveCutoffDate && (period.availableBalance ?? 0) > 0).length;
  const alerts = [
    opening.balanceDays < 0 ? "SALDO NEGATIVO CERTIFICADO" : null,
    opening.internalAlert,
    informativePeriods >= 2 ? "Dos o mas anualidades post-corte con saldo pendiente" : null
  ].filter((value): value is string => Boolean(value));
  return {
    employeeId, asOf, status: "CERTIFICADO", certifiedBalance: summary.opening,
    accruedPostCutoff: summary.accrued, adjustments: summary.adjustments,
    used: summary.used, reserved: summary.reserved, availableBalance: summary.available,
    annualEntitlement: summary.annual, baseDays: opening.baseDays,
    progressiveDays: summary.annual - opening.baseDays, nextAnniversary: summary.nextAnniversary,
    projectedProportional: calculateProjectedProportional(summary.annual),
    advanceDays: periods.reduce((total, period) => total + (period.advanceDays ?? 0), 0),
    informativePeriods, alerts, periods
  };
}
