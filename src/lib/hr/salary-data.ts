import type { HrAccountantDataRow, HrEmployee, HrMonthlyNovelty, HrPaymentItem } from "@/lib/hr/data";

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
    .map((employee) => {
      const row = rowByEmployee.get(employee.id);
      const advances = row?.advances ?? params.paymentItems
        .filter((item) => item.employeeId === employee.id && item.period === params.period && item.paymentType === "anticipo")
        .reduce((sum, item) => sum + item.amount, 0);
      return {
        absences: row?.absences ?? 0,
        advances,
        aguinaldo: row?.aguinaldo ?? 0,
        cashAllowance: row?.cashAllowance ?? 0,
        ccafLoan: row?.ccafLoan ?? 0,
        compensatoryBonus: row?.compensatoryBonus ?? 0,
        companyLoan: row?.companyLoan ?? 0,
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
        productionBonus: row?.productionBonus ?? 0,
        reason: row?.reason ?? "",
        responsibilityBonus: row?.responsibilityBonus ?? 0,
        rut: row?.rut ?? employee.rut,
        sundaySurcharge: row?.sundaySurcharge ?? 0
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}
