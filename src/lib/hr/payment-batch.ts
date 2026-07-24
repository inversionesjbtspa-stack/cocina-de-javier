export const HR_VALID_BANK_STATUSES = ["valid", "validated"] as const;

export type HrPaymentBatchValidationIssue = {
  alerts: string[];
  employeeId: string;
  employeeName: string;
};

export type HrPaymentBatchEmployee = {
  full_name?: string | null;
  hr_employee_bank_accounts?: Array<{
    account_holder_rut?: string | null;
    account_number?: string | null;
    account_type?: string | null;
    bank_code?: string | null;
    bank_name?: string | null;
    payment_email?: string | null;
    validation_status?: string | null;
  }> | null;
  id: string;
  payment_enabled?: boolean | null;
  personal_email?: string | null;
  status?: string | null;
  work_email?: string | null;
};

export function bankIsValidated(status: string | null | undefined) {
  return HR_VALID_BANK_STATUSES.includes(status as typeof HR_VALID_BANK_STATUSES[number]);
}

export function validatePaymentBatchEmployee(employee: HrPaymentBatchEmployee | undefined, employeeId: string): HrPaymentBatchValidationIssue | null {
  const bank = Array.isArray(employee?.hr_employee_bank_accounts) ? employee?.hr_employee_bank_accounts[0] : null;
  const alerts: string[] = [];
  if (!employee) alerts.push("trabajador inexistente o fuera del tenant");
  if (employee && employee.status !== "activo") alerts.push("trabajador inactivo");
  if (employee && !employee.payment_enabled) alerts.push("pagos inhabilitados");
  if (!bank?.bank_name) alerts.push("banco");
  if (!bank?.bank_code) alerts.push("codigo banco");
  if (!bank?.account_type) alerts.push("tipo cuenta");
  if (!bank?.account_number) alerts.push("numero cuenta");
  if (!bankIsValidated(bank?.validation_status)) alerts.push("banco no validado");
  if (!bank?.account_holder_rut) alerts.push("rut titular");
  if (!(bank?.payment_email || employee?.work_email || employee?.personal_email)) alerts.push("email pago");
  return alerts.length ? { alerts, employeeId, employeeName: employee?.full_name ?? "Trabajador" } : null;
}
