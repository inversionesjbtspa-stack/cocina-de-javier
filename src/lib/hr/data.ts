import { unstable_noStore as noStore } from "next/cache";
import { hasSupabaseAdminConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireHrServerContext } from "@/lib/hr/security";
import { accruedVacationDays, currentPeriod } from "@/lib/hr/utils";

export type HrBankAccount = {
  id: string;
  bankName: string;
  bankCode: string;
  accountType: string;
  accountNumber: string;
  paymentEmail: string;
  holderName: string;
  holderRut: string;
  validationStatus: string;
};

export type HrEmployee = {
  id: string;
  rut: string;
  fullName: string;
  birthDate: string | null;
  nationality: string | null;
  address: string | null;
  commune: string | null;
  phone: string | null;
  personalEmail: string | null;
  workEmail: string | null;
  position: string | null;
  area: string | null;
  hireDate: string | null;
  contractType: string;
  workSchedule: string | null;
  baseSalary: number;
  status: string;
  costCenter: string | null;
  afp: string | null;
  healthSystem: string | null;
  healthPlan: string | null;
  unemploymentInsurance: boolean;
  familyAllowances: number;
  paymentEnabled: boolean;
  bankAccount: HrBankAccount | null;
  paymentAlerts: string[];
};

export type HrPayslip = {
  id: string;
  employeeId: string | null;
  employeeName: string;
  period: string;
  originalFilename: string;
  netAmount: number;
  sendAttempts: number;
  sendStatus: string;
  status: string;
  storageBucket: string;
  storagePath: string;
  detectedRut?: string | null;
  detectedName?: string | null;
  fileSha256?: string | null;
  matchLevel?: string | null;
  matchMethod?: string | null;
  reviewReason?: string | null;
  createdAt: string;
};

export type HrVacationRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  advanceDays?: number;
  startDate: string;
  endDate: string;
  businessDays: number;
  documentNumber?: string | null;
  effectiveRestEndDate?: string | null;
  lastCountedVacationDate?: string | null;
  previousBalance: number;
  projectedBusinessDays?: number;
  receiptStatus?: string | null;
  returnToWorkDate?: string | null;
  resultingBalance: number;
  status: string;
  observation: string | null;
};

export type HrPaymentItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  period: string;
  paymentType: string;
  amount: number;
  glosa: string | null;
  payslipId: string | null;
  sourceId: string | null;
  sourceType: string | null;
  status: string;
  scheduledDate: string | null;
};

export type HrTerminationSettlement = {
  id: string;
  employeeId: string;
  employeeName: string;
  terminationDate: string;
  causal: string;
  settlementAmount: number;
  status: string;
};

export type HrHonorario = {
  id: string;
  fullName: string;
  rut: string;
  period: string;
  amount: number;
  status: string;
};

export type HrVacationLedger = {
  id: string;
  employeeId: string;
  employeeName: string;
  period: string;
  movementType: string;
  days: number;
  balanceAfter: number;
};

export type HrVacationPeriod = {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  baseDays: number;
  progressiveDays: number;
  positiveAdjustments: number;
  negativeAdjustments: number;
  usedDays: number;
  reservedDays: number;
  advanceDays: number;
  availableBalance: number;
  continuousBlockRequired: number;
  continuousBlockUsed: number;
  status: string;
};

export type HrPaymentBatch = {
  id: string;
  period: string;
  paymentType: string | null;
  glosaGlobal: string | null;
  totalAmount: number;
  totalEmployees: number;
  status: string;
  generatedAt: string;
};

export type HrAccountantDataRow = {
  id: string;
  period: string;
  employeeId: string | null;
  fullName: string;
  rut: string;
  costCenter: string | null;
  absences: number;
  licenses: number;
  overtimeHours: number;
  productionBonus: number;
  compensatoryBonus: number;
  responsibilityBonus: number;
  aguinaldo: number;
  advances: number;
  cashAllowance: number;
  ccafLoan: number;
  companyLoan: number;
  movilization: number;
  observations: string | null;
  phoneAllowance: number;
  reason: string | null;
  sundaySurcharge: number;
};

export type HrMonthlyNovelty = {
  id: string;
  employeeId: string;
  employeeName: string;
  period: string;
  type: string;
  quantity: number;
  hours: number;
  amount: number;
  status: string;
  notes: string | null;
};

export type HrDashboardData = {
  period: string;
  accountantRows: HrAccountantDataRow[];
  employees: HrEmployee[];
  monthlyNovelties: HrMonthlyNovelty[];
  payslips: HrPayslip[];
  vacations: HrVacationRequest[];
  paymentItems: HrPaymentItem[];
  paymentBatches: HrPaymentBatch[];
  finiquitos: HrTerminationSettlement[];
  honorarios: HrHonorario[];
  vacationLedger: HrVacationLedger[];
  vacationPeriods: HrVacationPeriod[];
  kpis: {
    activeEmployees: number;
    payslipsLoaded: number;
    payslipsMissing: number;
    vacationPending: number;
    vacationTaken: number;
    employeesWithoutBank: number;
    paymentEnabled: number;
    monthPaymentAmount: number;
    netPayrollAmount: number;
    advancesAmount: number;
    bonusesAmount: number;
  };
};

type RawEmployee = {
  id: string;
  rut: string;
  full_name: string;
  birth_date: string | null;
  nationality: string | null;
  address: string | null;
  commune: string | null;
  phone: string | null;
  personal_email: string | null;
  work_email: string | null;
  position: string | null;
  area: string | null;
  hire_date: string | null;
  contract_type: string;
  work_schedule: string | null;
  base_salary: number;
  status: string;
  cost_center: string | null;
  afp: string | null;
  health_system: string | null;
  health_plan: string | null;
  unemployment_insurance: boolean;
  family_allowances: number;
  payment_enabled: boolean;
  hr_employee_bank_accounts?: Array<{
    id: string;
    bank_name: string | null;
    bank_code: string | null;
    account_type: string | null;
    account_number: string | null;
    payment_email: string | null;
    account_holder_name: string | null;
    account_holder_rut: string | null;
    validation_status: string;
  }>;
};

function mapEmployee(row: RawEmployee): HrEmployee {
  const bank = row.hr_employee_bank_accounts?.[0];
  const bankAccount = bank ? {
    accountNumber: bank.account_number ?? "",
    accountType: bank.account_type ?? "",
    bankCode: bank.bank_code ?? "",
    bankName: bank.bank_name ?? "",
    holderName: bank.account_holder_name ?? row.full_name,
    holderRut: bank.account_holder_rut ?? row.rut,
    id: bank.id,
    paymentEmail: bank.payment_email ?? "",
    validationStatus: bank.validation_status
  } : null;
  const alerts = [];
  if (row.status !== "activo") alerts.push("trabajador no activo");
  if (!row.payment_enabled) alerts.push("pagos inhabilitados");
  if (!bankAccount?.bankName) alerts.push("banco");
  if (!bankAccount?.bankCode) alerts.push("codigo banco");
  if (!bankAccount?.accountType) alerts.push("tipo cuenta");
  if (!bankAccount?.accountNumber) alerts.push("numero cuenta");
  if (!bankAccount?.paymentEmail && !row.work_email && !row.personal_email) alerts.push("email pago");

  return {
    address: row.address,
    afp: row.afp,
    area: row.area,
    bankAccount,
    baseSalary: Number(row.base_salary ?? 0),
    birthDate: row.birth_date,
    commune: row.commune,
    contractType: row.contract_type,
    costCenter: row.cost_center,
    familyAllowances: Number(row.family_allowances ?? 0),
    fullName: row.full_name,
    healthPlan: row.health_plan,
    healthSystem: row.health_system,
    hireDate: row.hire_date,
    id: row.id,
    nationality: row.nationality,
    paymentAlerts: alerts,
    paymentEnabled: row.payment_enabled,
    personalEmail: row.personal_email,
    phone: row.phone,
    position: row.position,
    rut: row.rut,
    status: row.status,
    unemploymentInsurance: row.unemployment_insurance,
    workEmail: row.work_email,
    workSchedule: row.work_schedule
  };
}

function relatedFullName(value: unknown, fallback: string) {
  if (Array.isArray(value)) {
    const first = value[0] as { full_name?: string } | undefined;
    return first?.full_name ?? fallback;
  }
  const record = value as { full_name?: string } | null | undefined;
  return record?.full_name ?? fallback;
}

export async function getHrDashboardData(): Promise<HrDashboardData> {
  noStore();
  const period = currentPeriod();
  if (!hasSupabaseAdminConfig()) {
    return {
      accountantRows: [],
      employees: [],
      kpis: {
        activeEmployees: 0,
        advancesAmount: 0,
        bonusesAmount: 0,
        employeesWithoutBank: 0,
        monthPaymentAmount: 0,
        netPayrollAmount: 0,
        paymentEnabled: 0,
        payslipsLoaded: 0,
        payslipsMissing: 0,
        vacationPending: 0,
        vacationTaken: 0
      },
      monthlyNovelties: [],
      paymentBatches: [],
      paymentItems: [],
      payslips: [],
      period,
      vacations: [],
      finiquitos: [],
      honorarios: [],
      vacationLedger: [],
      vacationPeriods: []
    };
  }

  const ctx = await requireHrServerContext();
  const supabase = createAdminClient();
  // Admin client is required for server-side aggregation across HR tables; access is scoped
  // by the authenticated HR membership above and every tenant-owned table below.
  const [{ data: employeeRows }, { data: payslipRows }, { data: vacationRows }, { data: paymentRows }, { data: batchRows }, { data: accountantRows }, { data: noveltyRows }, { data: finiquitoRows }, { data: honorarioRows }, { data: vacationLedgerRows }, { data: vacationPeriodRows }] = await Promise.all([
    supabase
      .from("hr_employees")
      .select("*,hr_employee_bank_accounts(id,bank_name,bank_code,account_type,account_number,payment_email,account_holder_name,account_holder_rut,validation_status)")
      .eq("tenant_id", ctx.tenantId)
      .order("full_name", { ascending: true }),
    supabase
      .from("hr_payslips")
      .select("*,hr_employees(full_name)")
      .eq("tenant_id", ctx.tenantId)
      .eq("period", period)
      .order("created_at", { ascending: false }),
    supabase
      .from("hr_vacation_requests")
      .select("id,employee_id,start_date,end_date,business_days,previous_balance,resulting_balance,status,observation,projected_business_days,advance_days,last_counted_vacation_date,effective_rest_end_date,return_to_work_date,document_number,receipt_number,receipt_status,hr_employees(full_name)")
      .eq("tenant_id", ctx.tenantId)
      .order("start_date", { ascending: false })
      .limit(80),
    supabase
      .from("hr_payment_items")
      .select("id,employee_id,period,payment_type,amount,glosa,status,scheduled_date,payslip_id,source_type,source_id,hr_employees(full_name)")
      .eq("tenant_id", ctx.tenantId)
      .eq("period", period)
      .order("created_at", { ascending: false }),
    supabase
      .from("hr_payment_batches")
      .select("id,period,payment_type,glosa_global,total_amount,total_employees,status,generated_at")
      .eq("tenant_id", ctx.tenantId)
      .order("generated_at", { ascending: false })
      .limit(20),
    supabase
      .from("hr_accountant_data_rows")
      .select("*")
      .eq("tenant_id", ctx.tenantId)
      .eq("period", period)
      .order("row_number", { ascending: true })
      .limit(120),
    supabase
      .from("hr_monthly_novelties")
      .select("id,employee_id,period,novelty_type,quantity,hours,amount,status,notes,hr_employees(full_name)")
      .eq("tenant_id", ctx.tenantId)
      .eq("period", period)
      .order("created_at", { ascending: false })
      .limit(20)
    ,
    supabase
      .from("hr_termination_settlements")
      .select("id,employee_id,termination_date,causal,settlement_amount,status,hr_employees(full_name)")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("hr_honorarios")
      .select("id,full_name,rut,period,amount,status")
      .eq("tenant_id", ctx.tenantId)
      .eq("period", period)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("hr_vacation_ledger")
      .select("id,employee_id,period,movement_type,days,balance_after,hr_employees(full_name)")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false })
      .limit(20)
    ,
    supabase
      .from("hr_vacation_periods")
      .select("id,employee_id,period_start,period_end,base_days,progressive_days,positive_adjustments,negative_adjustments,used_days,reserved_days,advance_days,available_balance,continuous_block_required,continuous_block_used,status")
      .eq("tenant_id", ctx.tenantId)
      .order("period_start", { ascending: true })
  ]);

  const employees = ((employeeRows ?? []) as RawEmployee[]).map(mapEmployee);
  const activeEmployees = employees.filter((employee) => employee.status === "activo");
  const payslips = (payslipRows ?? []).map((row) => ({
    createdAt: row.created_at,
    employeeId: row.employee_id,
    employeeName: relatedFullName(row.hr_employees, "Pendiente revision"),
    detectedName: row.detected_name,
    detectedRut: row.detected_rut,
    fileSha256: row.file_sha256,
    id: row.id,
    matchLevel: row.match_level,
    matchMethod: row.match_method,
    netAmount: Number(row.net_amount ?? 0),
    originalFilename: row.original_filename,
    period: row.period,
    reviewReason: row.review_reason,
    sendAttempts: Number(row.send_attempts ?? 0),
    sendStatus: row.send_status ?? "pendiente_envio",
    status: row.status,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path
  }));
  const vacations = (vacationRows ?? []).map((row) => ({
    advanceDays: Number(row.advance_days ?? 0),
    businessDays: Number(row.business_days ?? 0),
    documentNumber: row.document_number ?? row.receipt_number,
    employeeId: row.employee_id,
    employeeName: relatedFullName(row.hr_employees, "Trabajador"),
    endDate: row.end_date,
    effectiveRestEndDate: row.effective_rest_end_date,
    id: row.id,
    lastCountedVacationDate: row.last_counted_vacation_date,
    observation: row.observation,
    previousBalance: Number(row.previous_balance ?? 0),
    projectedBusinessDays: Number(row.projected_business_days ?? 0),
    receiptStatus: row.receipt_status,
    returnToWorkDate: row.return_to_work_date,
    resultingBalance: Number(row.resulting_balance ?? 0),
    startDate: row.start_date,
    status: row.status
  }));
  const paymentItems = (paymentRows ?? []).map((row) => ({
    amount: Number(row.amount ?? 0),
    employeeId: row.employee_id,
    employeeName: relatedFullName(row.hr_employees, "Trabajador"),
    glosa: row.glosa,
    id: row.id,
    payslipId: row.payslip_id,
    paymentType: row.payment_type,
    period: row.period,
    scheduledDate: row.scheduled_date,
    sourceId: row.source_id,
    sourceType: row.source_type,
    status: row.status
  }));
  const paymentBatches = (batchRows ?? []).map((row) => ({
    generatedAt: row.generated_at,
    glosaGlobal: row.glosa_global,
    id: row.id,
    paymentType: row.payment_type,
    period: row.period,
    status: row.status,
    totalAmount: Number(row.total_amount ?? 0),
    totalEmployees: Number(row.total_employees ?? 0)
  }));
  const accountantDataRows = (accountantRows ?? []).map((row) => ({
    absences: Number(row.absences ?? 0),
    advances: Number(row.advances_amount ?? 0),
    aguinaldo: Number(row.aguinaldo_amount ?? 0),
    cashAllowance: Number(row.cash_allowance_amount ?? 0),
    ccafLoan: Number(row.ccaf_loan_amount ?? 0),
    compensatoryBonus: Number(row.compensatory_bonus_amount ?? 0),
    companyLoan: Number(row.company_loan_amount ?? 0),
    costCenter: row.cost_center,
    employeeId: row.employee_id,
    fullName: row.full_name ?? row.employee_name ?? "Trabajador",
    id: row.id,
    licenses: Number(row.licenses ?? 0),
    movilization: Number(row.movilization_amount ?? 0),
    observations: row.observations,
    overtimeHours: Number(row.overtime_hours ?? 0),
    period: row.period,
    phoneAllowance: Number(row.phone_allowance_amount ?? 0),
    productionBonus: Number(row.production_bonus_amount ?? 0),
    reason: row.reason,
    responsibilityBonus: Number(row.responsibility_bonus_amount ?? 0),
    sundaySurcharge: Number(row.sunday_surcharge_amount ?? 0),
    rut: row.rut ?? ""
  }));
  const monthlyNovelties = (noveltyRows ?? []).map((row) => ({
    amount: Number(row.amount ?? 0),
    employeeId: row.employee_id,
    employeeName: relatedFullName(row.hr_employees, "Trabajador"),
    hours: Number(row.hours ?? 0),
    id: row.id,
    notes: row.notes,
    period: row.period,
    quantity: Number(row.quantity ?? 0),
    status: row.status,
    type: row.novelty_type
  }));
  const finiquitos = (finiquitoRows ?? []).map((row) => ({
    causal: row.causal ?? "",
    employeeId: row.employee_id,
    employeeName: relatedFullName(row.hr_employees, "Trabajador"),
    id: row.id,
    settlementAmount: Number(row.settlement_amount ?? 0),
    status: row.status,
    terminationDate: row.termination_date
  }));
  const honorarios = (honorarioRows ?? []).map((row) => ({
    amount: Number(row.amount ?? 0),
    fullName: row.full_name,
    id: row.id,
    period: row.period,
    rut: row.rut,
    status: row.status
  }));
  const vacationLedger = (vacationLedgerRows ?? []).map((row) => ({
    balanceAfter: Number(row.balance_after ?? 0),
    days: Number(row.days ?? 0),
    employeeId: row.employee_id,
    employeeName: relatedFullName(row.hr_employees, "Trabajador"),
    id: row.id,
    movementType: row.movement_type,
    period: row.period
  }));
  const vacationPeriods = (vacationPeriodRows ?? []).map((row) => ({
    advanceDays: Number(row.advance_days ?? 0),
    availableBalance: Number(row.available_balance ?? 0),
    baseDays: Number(row.base_days ?? 15),
    continuousBlockRequired: Number(row.continuous_block_required ?? 10),
    continuousBlockUsed: Number(row.continuous_block_used ?? 0),
    employeeId: row.employee_id,
    id: row.id,
    negativeAdjustments: Number(row.negative_adjustments ?? 0),
    periodEnd: row.period_end,
    periodStart: row.period_start,
    positiveAdjustments: Number(row.positive_adjustments ?? 0),
    progressiveDays: Number(row.progressive_days ?? 0),
    reservedDays: Number(row.reserved_days ?? 0),
    status: row.status,
    usedDays: Number(row.used_days ?? 0)
  }));
  const payslipEmployeeIds = new Set(payslips.map((payslip) => payslip.employeeId).filter(Boolean));
  const monthPaymentAmount = paymentItems
    .filter((item) => ["pendiente_pago", "aprobado", "incluido_en_nomina", "en_nomina", "pagado"].includes(item.status))
    .reduce((sum, item) => sum + item.amount, 0);

  return {
    accountantRows: accountantDataRows,
    employees,
    kpis: {
      activeEmployees: activeEmployees.length,
      advancesAmount: paymentItems.filter((item) => item.paymentType === "anticipo").reduce((sum, item) => sum + item.amount, 0),
      bonusesAmount: paymentItems.filter((item) => item.paymentType.includes("bono")).reduce((sum, item) => sum + item.amount, 0),
      employeesWithoutBank: employees.filter((employee) => !employee.bankAccount?.accountNumber).length,
      monthPaymentAmount,
      netPayrollAmount: payslips.reduce((sum, payslip) => sum + payslip.netAmount, 0),
      paymentEnabled: employees.filter((employee) => employee.status === "activo" && employee.paymentEnabled).length,
      payslipsLoaded: payslips.length,
      payslipsMissing: Math.max(0, activeEmployees.length - payslipEmployeeIds.size),
      vacationPending: vacations.filter((vacation) => ["solicitada", "aprobada"].includes(vacation.status)).length,
      vacationTaken: vacations.filter((vacation) => vacation.status === "tomada").reduce((sum, vacation) => sum + vacation.businessDays, 0)
    },
    paymentBatches,
    paymentItems,
    monthlyNovelties,
    finiquitos,
    honorarios,
    vacationLedger,
    vacationPeriods,
    payslips,
    period,
    vacations
  };
}

export function projectedVacationBalance(employee: HrEmployee, initialBalance = 0, usedDays = 0) {
  return Math.round((initialBalance + accruedVacationDays(employee.hireDate) - usedDays) * 100) / 100;
}
