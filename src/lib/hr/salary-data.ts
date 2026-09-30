import type { HrAccountantDataRow, HrEmployee, HrMonthlyNovelty, HrPaymentItem } from "@/lib/hr/data";
import { isProductiveHrEmployee } from "./employee-filters.ts";

export const SALARY_DATA_AUDITED_FIELDS = [
  "absences",
  "licenses",
  "overtimeHours",
  "productionBonus",
  "compensatoryBonus",
  "responsibilityBonus",
  "aguinaldo",
  "advances",
  "cashAllowance",
  "ccafLoan",
  "companyLoan",
  "movilization",
  "observations",
  "phoneAllowance",
  "reason",
  "sundaySurcharge"
] as const;

export type SalaryDataField = typeof SALARY_DATA_AUDITED_FIELDS[number];

export type SalaryGridRowLike = Pick<HrAccountantDataRow, SalaryDataField | "costCenter" | "employeeId" | "fullName" | "id" | "period" | "rut">;
export type SalaryAutomaticField =
  | "advanceAguinaldo"
  | "advances"
  | "aguinaldo"
  | "ccafLoan"
  | "compensatoryBonus"
  | "companyLoan"
  | "productionBonus"
  | "responsibilityBonus"
  | "sundaySurcharge";
export type SalarySourceTrace = {
  amount: number;
  concept: SalaryAutomaticField;
  sourceId: string;
  sourceType: string;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function salaryRowHasNovelty(row: Pick<HrAccountantDataRow, SalaryDataField>) {
  return Boolean(
    numberValue(row.absences) ||
    numberValue(row.licenses) ||
    numberValue(row.overtimeHours) ||
    numberValue(row.productionBonus) ||
    numberValue(row.compensatoryBonus) ||
    numberValue(row.responsibilityBonus) ||
    numberValue(row.aguinaldo) ||
    numberValue(row.advances) ||
    numberValue(row.cashAllowance) ||
    numberValue(row.ccafLoan) ||
    numberValue(row.companyLoan) ||
    numberValue(row.movilization) ||
    numberValue(row.phoneAllowance) ||
    numberValue(row.sundaySurcharge) ||
    textValue(row.observations) ||
    textValue(row.reason)
  );
}

const automaticPaymentMap: Record<string, SalaryAutomaticField | null> = {
  anticipo: "advances",
  anticipo_aguinaldo: "advanceAguinaldo",
  aguinaldo: "aguinaldo",
  bono_compensatorio: "compensatoryBonus",
  bono_produccion: "productionBonus",
  bono_responsabilidad: "responsibilityBonus",
  prestamo_caja: "ccafLoan",
  prestamo_ccaf: "ccafLoan",
  prestamo_empresa: "companyLoan",
  prestamo_trabajador: "ccafLoan",
  recargo_domingo: "sundaySurcharge"
};

const automaticNoveltyMap: Record<string, SalaryAutomaticField | null> = {
  anticipo: null,
  aguinaldo: null,
  bono_compensatorio: null,
  bono_produccion: null,
  bono_responsabilidad: null,
  prestamo_ccaf: "ccafLoan",
  prestamo_empresa: "companyLoan",
  recargo_domingo: "sundaySurcharge"
};

const validPaymentStatuses = new Set(["aprobado", "pendiente_pago", "incluido_en_nomina", "en_nomina", "pagado"]);
const validNoveltyStatuses = new Set(["borrador", "confirmada"]);

function emptyAutomaticTotals() {
  return {
    advanceAguinaldo: 0,
    advances: 0,
    aguinaldo: 0,
    ccafLoan: 0,
    compensatoryBonus: 0,
    companyLoan: 0,
    productionBonus: 0,
    responsibilityBonus: 0,
    sundaySurcharge: 0
  } satisfies Record<SalaryAutomaticField, number>;
}

function addTrace(
  sources: SalarySourceTrace[],
  totals: Record<SalaryAutomaticField, number>,
  concept: SalaryAutomaticField | null,
  amount: number,
  sourceType: string,
  sourceId: string
) {
  if (!concept || !amount) return;
  totals[concept] += amount;
  sources.push({ amount, concept, sourceId, sourceType });
}

function automaticTotalsFor(params: {
  employeeId: string;
  monthlyNovelties: HrMonthlyNovelty[];
  paymentItems: HrPaymentItem[];
  period: string;
}) {
  const totals = emptyAutomaticTotals();
  const sources: SalarySourceTrace[] = [];
  const seen = new Set<string>();
  for (const item of params.paymentItems) {
    if (item.employeeId !== params.employeeId || item.period !== params.period || !validPaymentStatuses.has(item.status)) continue;
    const concept = automaticPaymentMap[item.paymentType] ?? null;
    const key = `PAYMENT_ITEM:${item.id}:${concept ?? "unmapped"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    addTrace(sources, totals, concept, item.amount, item.sourceType ?? "PAYROLL_BATCH", item.sourceId ?? item.id);
  }
  for (const novelty of params.monthlyNovelties ?? []) {
    if (novelty.employeeId !== params.employeeId || novelty.period !== params.period || !validNoveltyStatuses.has(novelty.status)) continue;
    const concept = automaticNoveltyMap[novelty.type] ?? null;
    const key = `NOVELTY:${novelty.id}:${concept ?? "unmapped"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const amount = novelty.amount || novelty.quantity || novelty.hours;
    addTrace(sources, totals, concept, amount, "MONTHLY_NOVELTY", novelty.id);
  }
  return { sources, totals };
}

function automaticOrManual(manual: number | undefined, automatic: number) {
  return automatic || manual || 0;
}

export function buildSalaryRows(params: {
  accountantRows: HrAccountantDataRow[];
  employees: HrEmployee[];
  monthlyNovelties?: HrMonthlyNovelty[];
  paymentItems: HrPaymentItem[];
  period: string;
}) {
  const rowByEmployee = new Map(params.accountantRows.filter((row) => row.employeeId).map((row) => [row.employeeId, row]));
  return params.employees
    .filter((employee) => employee.status === "activo")
    .filter(isProductiveHrEmployee)
    .map((employee) => {
      const row = rowByEmployee.get(employee.id);
      const automatic = automaticTotalsFor({
        employeeId: employee.id,
        monthlyNovelties: params.monthlyNovelties ?? [],
        paymentItems: params.paymentItems,
        period: params.period
      });
      return {
        absences: row?.absences ?? 0,
        advanceAguinaldo: automaticOrManual(0, automatic.totals.advanceAguinaldo),
        advances: automaticOrManual(row?.advances, automatic.totals.advances),
        aguinaldo: automaticOrManual(row?.aguinaldo, automatic.totals.aguinaldo),
        cashAllowance: row?.cashAllowance ?? 0,
        ccafLoan: automaticOrManual(row?.ccafLoan, automatic.totals.ccafLoan),
        compensatoryBonus: automaticOrManual(row?.compensatoryBonus, automatic.totals.compensatoryBonus),
        companyLoan: automaticOrManual(row?.companyLoan, automatic.totals.companyLoan),
        costCenter: row?.costCenter ?? employee.costCenter ?? employee.area ?? "",
        employee,
        employeeId: employee.id,
        fullName: row?.fullName ?? employee.fullName,
        id: row?.id ?? "",
        licenses: row?.licenses ?? 0,
        movilization: row?.movilization ?? 0,
        observations: row?.observations ?? "",
        overtimeHours: row?.overtimeHours ?? 0,
        period: params.period,
        phoneAllowance: row?.phoneAllowance ?? 0,
        productionBonus: automaticOrManual(row?.productionBonus, automatic.totals.productionBonus),
        reason: row?.reason ?? "",
        responsibilityBonus: automaticOrManual(row?.responsibilityBonus, automatic.totals.responsibilityBonus),
        rut: row?.rut ?? employee.rut,
        salarySources: automatic.sources,
        sundaySurcharge: automaticOrManual(row?.sundaySurcharge, automatic.totals.sundaySurcharge)
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}
