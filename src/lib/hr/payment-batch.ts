import { normalizeRut } from "./utils.ts";

export const HR_VALID_BANK_STATUSES = ["valid", "validated"] as const;

export type HrPaymentBatchValidationIssue = {
  alerts: string[];
  employeeId: string;
  employeeName: string;
};

export type HrPaymentBatchEmployee = {
  full_name?: string | null;
  hr_employee_bank_accounts?: Array<{
    account_holder_name?: string | null;
    account_holder_rut?: string | null;
    account_number?: string | null;
    account_type?: string | null;
    bank_code?: string | null;
    bank_name?: string | null;
    payment_email?: string | null;
    real_owner_name?: string | null;
    tef_display_name?: string | null;
    validation_status?: string | null;
  }> | null;
  id: string;
  payment_enabled?: boolean | null;
  personal_email?: string | null;
  rut?: string | null;
  status?: string | null;
  work_email?: string | null;
};

export type HrBankTefReadiness = {
  blockers: string[];
  status: "LISTO" | "INCOMPLETO" | "REVISAR";
  warnings: string[];
};

export function bankIsValidated(status: string | null | undefined) {
  return HR_VALID_BANK_STATUSES.includes(status as typeof HR_VALID_BANK_STATUSES[number]);
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isValidRut(value: string | null | undefined) {
  const normalized = normalizeRut(clean(value)).replace(/-/g, "");
  if (!/^\d{7,8}[\dK]$/.test(normalized)) return false;
  const body = normalized.slice(0, -1);
  const digit = normalized.slice(-1);
  let multiplier = 2;
  let sum = 0;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const expected = 11 - (sum % 11);
  const expectedDigit = expected === 11 ? "0" : expected === 10 ? "K" : String(expected);
  return digit === expectedDigit;
}

export function getBankTefReadiness(employee: HrPaymentBatchEmployee | undefined): HrBankTefReadiness {
  const bank = Array.isArray(employee?.hr_employee_bank_accounts) ? employee?.hr_employee_bank_accounts[0] : null;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!employee) blockers.push("trabajador inexistente o fuera del tenant");
  if (employee && employee.status !== "activo") blockers.push("trabajador inactivo");
  if (!bank?.account_number) blockers.push("cuenta destino");
  if (!bank?.bank_code) blockers.push("codigo banco");
  const holderRut = bank?.account_holder_rut || employee?.rut || "";
  if (!isValidRut(holderRut)) blockers.push("RUT beneficiario invalido");
  const displayName = bank?.tef_display_name || bank?.account_holder_name || employee?.full_name || "";
  if (!clean(displayName)) blockers.push("nombre/glosa TEF");
  if (!(bank?.payment_email || employee?.work_email || employee?.personal_email)) blockers.push("correo");
  if (!bank?.account_type) warnings.push("tipo cuenta pendiente");
  if (!bankIsValidated(bank?.validation_status)) warnings.push("banco no validado");
  const status = blockers.length ? "INCOMPLETO" : "LISTO";
  return { blockers, status, warnings };
}

export function validatePayrollBatchEmployeeForCreation(employee: HrPaymentBatchEmployee | undefined, employeeId: string): HrPaymentBatchValidationIssue | null {
  const alerts: string[] = [];
  if (!employee) alerts.push("trabajador inexistente o fuera del tenant");
  if (employee && employee.status !== "activo") alerts.push("trabajador inactivo");
  return alerts.length ? { alerts, employeeId, employeeName: employee?.full_name ?? "Trabajador" } : null;
}

export function validatePaymentBatchEmployee(employee: HrPaymentBatchEmployee | undefined, employeeId: string): HrPaymentBatchValidationIssue | null {
  const readiness = getBankTefReadiness(employee);
  return readiness.blockers.length ? { alerts: readiness.blockers, employeeId, employeeName: employee?.full_name ?? "Trabajador" } : null;
}
