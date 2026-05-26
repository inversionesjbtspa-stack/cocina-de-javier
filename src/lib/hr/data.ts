import { unstable_noStore as noStore } from "next/cache";
import { hasSupabaseAdminConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
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
  status: string;
  storageBucket: string;
  storagePath: string;
  createdAt: string;
};

export type HrVacationRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  businessDays: number;
  previousBalance: number;
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
  status: string;
  scheduledDate: string | null;
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

export type HrDashboardData = {
  period: string;
  employees: HrEmployee[];
  payslips: HrPayslip[];
  vacations: HrVacationRequest[];
  paymentItems: HrPaymentItem[];
  paymentBatches: HrPaymentBatch[];
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
      paymentBatches: [],
      paymentItems: [],
      payslips: [],
      period,
      vacations: []
    };
  }

  const supabase = createAdminClient();
  const [{ data: employeeRows }, { data: payslipRows }, { data: vacationRows }, { data: paymentRows }, { data: batchRows }] = await Promise.all([
    supabase
      .from("hr_employees")
      .select("*,hr_employee_bank_accounts(id,bank_name,bank_code,account_type,account_number,payment_email,account_holder_name,account_holder_rut,validation_status)")
      .order("full_name", { ascending: true }),
    supabase
      .from("hr_payslips")
      .select("id,employee_id,period,original_filename,net_amount,status,storage_bucket,storage_path,created_at,hr_employees(full_name)")
      .eq("period", period)
      .order("created_at", { ascending: false }),
    supabase
      .from("hr_vacation_requests")
      .select("id,employee_id,start_date,end_date,business_days,previous_balance,resulting_balance,status,observation,hr_employees(full_name)")
      .order("start_date", { ascending: false })
      .limit(80),
    supabase
      .from("hr_payment_items")
      .select("id,employee_id,period,payment_type,amount,glosa,status,scheduled_date,hr_employees(full_name)")
      .eq("period", period)
      .order("created_at", { ascending: false }),
    supabase
      .from("hr_payment_batches")
      .select("id,period,payment_type,glosa_global,total_amount,total_employees,status,generated_at")
      .order("generated_at", { ascending: false })
      .limit(20)
  ]);

  const employees = ((employeeRows ?? []) as RawEmployee[]).map(mapEmployee);
  const activeEmployees = employees.filter((employee) => employee.status === "activo");
  const payslips = (payslipRows ?? []).map((row) => ({
    createdAt: row.created_at,
    employeeId: row.employee_id,
    employeeName: relatedFullName(row.hr_employees, "Pendiente revision"),
    id: row.id,
    netAmount: Number(row.net_amount ?? 0),
    originalFilename: row.original_filename,
    period: row.period,
    status: row.status,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path
  }));
  const vacations = (vacationRows ?? []).map((row) => ({
    businessDays: Number(row.business_days ?? 0),
    employeeId: row.employee_id,
    employeeName: relatedFullName(row.hr_employees, "Trabajador"),
    endDate: row.end_date,
    id: row.id,
    observation: row.observation,
    previousBalance: Number(row.previous_balance ?? 0),
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
    paymentType: row.payment_type,
    period: row.period,
    scheduledDate: row.scheduled_date,
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
  const payslipEmployeeIds = new Set(payslips.map((payslip) => payslip.employeeId).filter(Boolean));
  const monthPaymentAmount = paymentItems
    .filter((item) => ["aprobado", "incluido_en_nomina", "pagado"].includes(item.status))
    .reduce((sum, item) => sum + item.amount, 0);

  return {
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
    payslips,
    period,
    vacations
  };
}

export function projectedVacationBalance(employee: HrEmployee, initialBalance = 0, usedDays = 0) {
  return Math.round((initialBalance + accruedVacationDays(employee.hireDate) - usedDays) * 100) / 100;
}
