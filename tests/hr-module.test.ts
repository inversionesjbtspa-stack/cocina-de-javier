import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import AdmZip from "adm-zip";
import { classifyPayslipPdf } from "../src/lib/hr/payslip-classifier.ts";
import test from "node:test";
import { buildPayslipPayrollImportItems, summarizePayslipPayrollImport } from "../src/lib/hr/payslip-payroll-import.ts";
import { extractPayslipsFromPdf, generateAccountantWorkbook, parseAccountantWorkbook, payslipPaymentGlosa } from "../src/lib/hr/payroll-parser.ts";
import { validatePaymentBatchEmployee } from "../src/lib/hr/payment-batch.ts";
import { buildSalaryRows, salaryRowHasNovelty } from "../src/lib/hr/salary-data.ts";
import { SALARY_EXPORT_COLUMNS, SALARY_PRESERVED_SHEETS, SALARY_TEMPLATE } from "../src/lib/hr/salary-export-map.ts";
import { sanitizePayslipFilename, validatePayslipUploadBatch, validatePayslipUploadFile } from "../src/lib/hr/payslip-upload-policy.ts";
import { businessDaysInclusive, accruedVacationDays } from "../src/lib/hr/utils.ts";
import { buildVacationExcelXml } from "../src/lib/hr/vacation-export.ts";
import { parseVacationImportFile, previewVacationImport, sha256 } from "../src/lib/hr/vacation-import.ts";
import { calculateVacationBalanceAt, previewVacationPeriodBackfill } from "../src/lib/hr/vacation-persistence.ts";
import {
  allocateVacationFifo,
  calculateAnnualEntitlement,
  calculateLegalVacationDays,
  calculateProgressiveVacationDays,
  calculateProjectedProportional,
  calculateReturnToWorkDate,
  calculateVacationBusinessDays,
  calculateVacationEndDate,
  calculateVacationOperationalBusinessDays,
  calculateVacationPreview,
  CHILE_HOLIDAYS_FIXTURE,
  classifyWorkCalendarDay,
  evaluateHolidayCalendarStatus,
  generateContractPeriods,
  reverseVacationAllocation,
  validateAdvanceVacation,
  validateFractionation
} from "../src/lib/hr/vacation-domain.ts";
import { buildVacationReceiptModel, nextBusinessDateAfter, renderVacationReceiptHtml, renderVacationReceiptPdf, vacationReceiptHash } from "../src/lib/hr/vacation-receipt.ts";

const fixturePath = (...segments: string[]) => path.resolve(process.cwd(), "tests", "fixtures", "hr", ...segments);

test("HR vacation helpers count business days and accrue Chile base vacation days", () => {
  assert.equal(businessDaysInclusive("2026-05-25", "2026-05-31"), 5);
  assert.equal(businessDaysInclusive("2026-05-30", "2026-05-31"), 0);
  assert.equal(accruedVacationDays("2025-05-26", new Date("2026-05-26T00:00:00")), 15);
});

test("HR module exposes operational tables, storage buckets and payment template flow", async () => {
  const migration = await readFile("supabase/migrations/202605150018_hr_module.sql", "utf8");
  const repairMigration = await readFile("supabase/migrations/202605150022_hr_schema_repair.sql", "utf8");
  const page = await readFile("src/app/(erp)/recursos-humanos/page.tsx", "utf8");
  const client = await readFile("src/components/hr/hr-dashboard-client.tsx", "utf8");
  const vacationComponents = await readFile("src/components/hr/vacation-components.tsx", "utf8");
  const paymentRoute = await readFile("src/app/api/hr/payment-template/route.ts", "utf8");
  const accountantRoute = await readFile("src/app/api/hr/accountant-data/route.ts", "utf8");
  const bankImportRoute = await readFile("src/app/api/hr/bank-import/route.ts", "utf8");
  const bankImportParser = await readFile("src/lib/hr/bank-import-parser.ts", "utf8");
  const bankMigration = await readFile("supabase/migrations/202605150023_hr_bank_import_and_accountant_columns.sql", "utf8");
  const phase1Migration = await readFile("supabase/migrations/202605290001_hr_phase1_monthly_workflow.sql", "utf8");
  const phase2Migration = await readFile("supabase/migrations/202605300001_hr_phase2_workflow.sql", "utf8");
  const employeesRoute = await readFile("src/app/api/hr/employees/route.ts", "utf8");
  const payslipsRoute = await readFile("src/app/api/hr/payslips/route.ts", "utf8");
  const payslipsSendRoute = await readFile("src/app/api/hr/payslips/send/route.ts", "utf8");
  const vacationRoute = await readFile("src/app/api/hr/vacations/route.ts", "utf8");
  const vacationAccrualRoute = await readFile("src/app/api/hr/vacations/accruals/route.ts", "utf8");
  const noveltiesRoute = await readFile("src/app/api/hr/monthly-novelties/route.ts", "utf8");
  const finiquitosRoute = await readFile("src/app/api/hr/finiquitos/route.ts", "utf8");
  const honorariosRoute = await readFile("src/app/api/hr/honorarios/route.ts", "utf8");

  for (const table of [
    "hr_employees",
    "hr_employee_bank_accounts",
    "hr_payslips",
    "hr_vacation_balances",
    "hr_vacation_requests",
    "hr_payment_items",
    "hr_advances",
    "hr_bonuses",
    "hr_payment_batches",
    "hr_payment_batch_items"
  ]) {
    assert.match(migration, new RegExp(table));
  }
  assert.match(migration, /hr-payslips/);
  assert.match(migration, /hr-vacation-documents/);
  assert.match(migration, /hr-employee-documents/);
  assert.match(repairMigration, /hr_accountant_data_rows/);
  assert.match(repairMigration, /employee_name text/);
  assert.match(repairMigration, /net_pay numeric/);
  assert.match(repairMigration, /create index if not exists hr_accountant_data_rows_tenant_period_idx/);
  assert.match(page, /RRHH operativo/);
  assert.match(client, /Template Pagos JESUS/);
  assert.match(client, /Habilitar pagos/);
  assert.match(paymentRoute, /generateSantanderTemplateFromRows/);
  assert.match(paymentRoute, /hr_payment_batches/);
  assert.match(paymentRoute, /payment_enabled/);
  assert.match(paymentRoute, /Honorarios/);
  assert.match(paymentRoute, /Aguinaldo/);
  assert.match(bankImportRoute, /parseHrBankWorkbook/);
  assert.match(bankImportRoute, /glosa_tef/);
  assert.match(bankImportRoute, /validation_status: valid \? "valid" : "pending"/);
  assert.match(bankImportParser, /glosa_tef/i);
  assert.match(bankImportParser, /0x00fd/);
  assert.match(bankMigration, /add column if not exists glosa_tef/);
  assert.match(bankMigration, /add column if not exists row_number integer/);
  assert.match(phase1Migration, /create table if not exists public\.hr_monthly_novelties/);
  assert.match(phase1Migration, /hr_monthly_novelties_unique_idx/);
  assert.match(phase1Migration, /add column if not exists document_date/);
  assert.match(phase1Migration, /add column if not exists send_status/);
  assert.match(phase2Migration, /create table if not exists public\.hr_termination_settlements/);
  assert.match(phase2Migration, /create table if not exists public\.hr_honorarios/);
  assert.match(phase2Migration, /create table if not exists public\.hr_vacation_ledger/);
  assert.match(phase2Migration, /create table if not exists public\.hr_payslip_send_events/);
  assert.match(phase2Migration, /notify pgrst, 'reload schema'/);
  assert.doesNotMatch(phase2Migration, /^\s*(drop|delete|truncate)\b/im);
  assert.match(employeesRoute, /hr\.employee_created/);
  assert.match(payslipsRoute, /hr\.payslip_uploaded/);
  assert.match(payslipsSendRoute, /hr\.payslip_send_requested/);
  assert.match(vacationRoute, /calculateVacationPreview/);
  assert.match(vacationRoute, /persistVacationReceiptForRequest/);
  assert.match(vacationAccrualRoute, /hr\.vacation_accrual_recorded/);
  assert.match(finiquitosRoute, /hr\.finiquito_created/);
  assert.match(honorariosRoute, /hr\.honorario_created/);
  assert.match(noveltiesRoute, /tenant_id,employee_id,period,novelty_type/);
  assert.match(noveltiesRoute, /hr\.monthly_novelty_created/);
  assert.match(accountantRoute, /Schema cache de Supabase desactualizado/);
  assert.match(accountantRoute, /notify pgrst, 'reload schema'/);
  assert.match(accountantRoute, /readRowsWithPg/);
  assert.match(accountantRoute, /employee_name/);
  assert.match(noveltiesRoute, /hr\.monthly_novelty_created/);
  assert.match(client, /Datos Sueldos/);
  assert.match(vacationComponents, /Feriado fraccionado/);
  assert.match(vacationComponents, /CALCULAR VACACIONES/);
  assert.match(vacationComponents, /CONFIRMAR VACACIONES/);
  assert.match(vacationComponents, /Opciones avanzadas/);
  assert.match(vacationComponents, /Vacaciones recientes/);
  assert.match(client, /Detalle \/ Auditoria/);
  assert.match(client, /Anticipos avanzados/);
  assert.match(client, /Exportar tramo banco/);
  assert.match(client, /Enviar liquidaciones pendientes pagadas/);
});

test("HR employee profile is simplified to four visible tabs and reuses existing data", async () => {
  const client = await readFile("src/components/hr/hr-dashboard-client.tsx", "utf8");
  const employeeRoute = await readFile("src/app/api/hr/employees/[id]/route.ts", "utf8");
  const hrData = await readFile("src/lib/hr/data.ts", "utf8");
  const vacationComponents = await readFile("src/components/hr/vacation-components.tsx", "utf8");

  assert.match(client, /type WorkerTab = "personal" \| "bank" \| "vacations" \| "payslips"/);
  assert.match(client, /label: "Datos personales"/);
  assert.match(client, /label: "Banco"/);
  assert.match(client, /label: "Vacaciones"/);
  assert.match(client, /label: "Liquidaciones"/);
  assert.doesNotMatch(client, /label: "Contrato"/);
  assert.doesNotMatch(client, /label: "Novedades"/);
  assert.doesNotMatch(client, /label: "Pagos"/);
  assert.doesNotMatch(client, /label: "Documentos"/);
  assert.doesNotMatch(client, /label: "Auditoria"/);
  assert.match(client, /normalizeWorkerTab/);
  assert.match(client, /if \(tab === "payments"\) return "bank"/);
  assert.match(client, /if \(tab === "documents"\) return "payslips"/);
  assert.match(client, /Informacion laboral/);
  assert.match(client, /Jornada laboral/);
  assert.doesNotMatch(client, /Falta configurar jornada laboral/);
  assert.doesNotMatch(client, /Configure la jornada laboral en Datos personales/);
  assert.match(client, /Override individual de jornada/);
  assert.match(client, /Politica empresa/);
  assert.match(employeeRoute, /workSchedulePreset/);
  assert.match(employeeRoute, /workScheduleOverrideEnabled/);
  assert.match(employeeRoute, /work_schedule = JSON\.stringify\(workSchedule\)/);
  assert.match(hrData, /bank_name,bank_code,account_type,account_number,payment_email/);
  assert.match(client, /maskAccountNumber/);
  assert.match(client, /Historial de pagos/);
  assert.match(client, /Exportar historial Excel/);
  assert.match(client, /Liquidaciones del trabajador/);
  assert.match(client, /Enviar liquidacion/);
  assert.match(vacationComponents, /manualHolidayDate/);
  assert.match(vacationComponents, /manualNonWorkingDays/);
});

test("HR vacation domain generates anniversary periods and separates projected proportional", () => {
  const periods = generateContractPeriods("2024-07-23", "2026-07-24", 1);
  assert.equal(periods[0].periodStart, "2024-07-23");
  assert.equal(periods[0].periodEnd, "2025-07-22");
  assert.equal(periods[0].status, "closed");
  assert.equal(calculateAnnualEntitlement({ progressiveDays: 0 }), 15);
  assert.equal(calculateProjectedProportional(15), 1.25);
  assert.equal(Number(calculateProjectedProportional(16).toFixed(6)), 1.333333);
  assert.equal(Number(calculateProjectedProportional(17).toFixed(6)), 1.416667);
});

test("HR vacation business days exclude Saturdays, Sundays and configured holidays", () => {
  assert.equal(calculateVacationBusinessDays("2026-07-13", "2026-07-17", CHILE_HOLIDAYS_FIXTURE, "RM"), 4);
  assert.equal(calculateVacationBusinessDays("2026-07-18", "2026-07-19", CHILE_HOLIDAYS_FIXTURE), 0);
  assert.equal(calculateVacationEndDate("2026-07-13", 4, CHILE_HOLIDAYS_FIXTURE, "RM"), "2026-07-17");
  assert.deepEqual(calculateReturnToWorkDate("2026-07-17", { source: "employee", workingWeekdays: [1, 2, 3, 4, 5, 6] }).returnDate, "2026-07-18");
});

test("HR vacation work calendar classifies holidays and employee schedules", () => {
  assert.equal(classifyWorkCalendarDay("2026-07-16", CHILE_HOLIDAYS_FIXTURE, "RM").type, "HOLIDAY");
  assert.equal(classifyWorkCalendarDay("2026-07-18", CHILE_HOLIDAYS_FIXTURE, "RM").type, "WEEKEND");
  assert.equal(classifyWorkCalendarDay("2026-07-18", CHILE_HOLIDAYS_FIXTURE, "RM", null, { source: "employee", workingWeekdays: [1, 2, 3, 4, 5, 6] }).type, "WORKING_DAY");
  assert.equal(calculateVacationOperationalBusinessDays("2026-07-13", "2026-07-18", CHILE_HOLIDAYS_FIXTURE, "RM", null, { source: "employee", workingWeekdays: [1, 2, 3, 4, 5, 6] }), 5);
  assert.equal(calculateVacationBusinessDays("2026-07-13", "2026-07-18", CHILE_HOLIDAYS_FIXTURE, "RM", null, { source: "employee", workingWeekdays: [1, 2, 3, 4, 5] }), 4);
});

test("HR legal vacation days use inclusive Monday-Friday calendar, not operational schedule", () => {
  const holidays = [{ date: "2026-08-26", mandatory: true, name: "Feriado test", scope: "national", status: "active" } as const];
  const mondayToSunday = calculateLegalVacationDays({ endDate: "2026-08-30", legalHolidays: [], startDate: "2026-08-24" });
  assert.equal(mondayToSunday.calendarDays, 7);
  assert.equal(mondayToSunday.legalWorkingDays, 5);
  assert.equal(mondayToSunday.daysToDeduct, 5);
  assert.equal(mondayToSunday.saturdays, 1);
  assert.equal(mondayToSunday.sundays, 1);

  assert.equal(calculateLegalVacationDays({ endDate: "2026-08-31", legalHolidays: [], startDate: "2026-08-25" }).daysToDeduct, 5);
  assert.equal(calculateLegalVacationDays({ endDate: "2026-09-01", legalHolidays: [], startDate: "2026-08-26" }).daysToDeduct, 5);
  assert.equal(calculateLegalVacationDays({ endDate: "2026-09-02", legalHolidays: [], startDate: "2026-08-27" }).daysToDeduct, 5);
  assert.equal(calculateLegalVacationDays({ endDate: "2026-09-03", legalHolidays: [], startDate: "2026-08-28" }).daysToDeduct, 5);
  assert.equal(calculateLegalVacationDays({ endDate: "2026-08-30", legalHolidays: [], startDate: "2026-08-29" }).daysToDeduct, 0);
  assert.equal(calculateLegalVacationDays({ endDate: "2026-08-30", legalHolidays: holidays, startDate: "2026-08-24" }).daysToDeduct, 4);
  assert.equal(calculateLegalVacationDays({ endDate: "2026-08-30", legalHolidays: [{ date: "2026-08-29", name: "Sabado feriado", scope: "national", status: "active" }], startDate: "2026-08-24" }).daysToDeduct, 5);
  assert.equal(calculateLegalVacationDays({ endDate: "2026-08-30", legalHolidays: [], manualNonWorkingDays: [{ date: "2026-08-26", reason: "Fixture" }], startDate: "2026-08-24" }).daysToDeduct, 4);
  assert.equal(calculateLegalVacationDays({ endDate: "2026-08-30", legalHolidays: holidays, manualNonWorkingDays: [{ date: "2026-08-26", reason: "Fixture" }], startDate: "2026-08-24" }).daysToDeduct, 4);
});

test("HR vacation global company policy treats Monday as closed and holidays/Sundays as working", () => {
  const companySchedule = {
    dateOverrides: {
      "2026-08-17": { reason: "MONDAY_CLOSED", source: "company_policy", working: false },
      "2026-08-23": { reason: "SCHEDULED_SUNDAY_OFF", source: "employee_monthly_schedule", working: false }
    },
    holidaysAreWorking: true,
    source: "company_policy" as const,
    workingWeekdays: [0, 2, 3, 4, 5, 6]
  };
  assert.equal(classifyWorkCalendarDay("2026-08-17", CHILE_HOLIDAYS_FIXTURE, "RM", null, companySchedule).type, "OTHER_NON_WORKING_DAY");
  assert.equal(classifyWorkCalendarDay("2026-08-17", CHILE_HOLIDAYS_FIXTURE, "RM", null, companySchedule).reason, "MONDAY_CLOSED");
  assert.equal(classifyWorkCalendarDay("2026-08-18", CHILE_HOLIDAYS_FIXTURE, "RM", null, companySchedule).type, "WORKING_DAY");
  assert.equal(classifyWorkCalendarDay("2026-08-22", CHILE_HOLIDAYS_FIXTURE, "RM", null, companySchedule).type, "WORKING_DAY");
  assert.equal(classifyWorkCalendarDay("2026-08-16", CHILE_HOLIDAYS_FIXTURE, "RM", null, companySchedule).type, "WORKING_DAY");
  assert.equal(classifyWorkCalendarDay("2026-07-16", CHILE_HOLIDAYS_FIXTURE, "RM", null, companySchedule).reason, "PUBLIC_HOLIDAY_WORKED");
  assert.equal(classifyWorkCalendarDay("2026-08-23", CHILE_HOLIDAYS_FIXTURE, "RM", null, companySchedule).reason, "SCHEDULED_SUNDAY_OFF");
});

test("HR vacation global policy previews Monday-to-Sunday ranges with and without Sunday off", () => {
  const basePeriods = [{ availableBalance: 20, baseDays: 15, continuousBlockRequired: 10, continuousBlockUsed: 10, periodEnd: "2026-07-22", periodStart: "2025-07-23", status: "open" as const }];
  const schedule = {
    dateOverrides: {
      "2026-08-17": { reason: "MONDAY_CLOSED", source: "company_policy", working: false }
    },
    holidaysAreWorking: true,
    source: "company_policy" as const,
    workingWeekdays: [0, 2, 3, 4, 5, 6]
  };
  const withoutSundayOff = calculateVacationPreview({
    agreementAccepted: true,
    calendarStatusByYear: { "2026": "verified" },
    endDate: "2026-08-23",
    hireDate: "2025-07-23",
    holidays: CHILE_HOLIDAYS_FIXTURE,
    periods: basePeriods,
    schedule,
    startDate: "2026-08-17"
  });
  assert.equal(withoutSundayOff.calendarDays, 7);
  assert.equal(withoutSundayOff.businessDays, 5);
  assert.equal(withoutSundayOff.nonBusiness.mondayClosed, 1);
  assert.equal(withoutSundayOff.scheduleReviewRequired, false);

  const withSundayOff = calculateVacationPreview({
    agreementAccepted: true,
    calendarStatusByYear: { "2026": "verified" },
    endDate: "2026-08-23",
    hireDate: "2025-07-23",
    holidays: CHILE_HOLIDAYS_FIXTURE,
    periods: basePeriods,
    schedule: {
      ...schedule,
      dateOverrides: {
        ...schedule.dateOverrides,
        "2026-08-23": { reason: "SCHEDULED_SUNDAY_OFF", source: "employee_monthly_schedule", working: false }
      }
    },
    startDate: "2026-08-17"
  });
  assert.equal(withSundayOff.calendarDays, 7);
  assert.equal(withSundayOff.businessDays, 5);
  assert.equal(withSundayOff.nonBusiness.scheduledSundayOff, 1);
  assert.equal(withSundayOff.totalAfterRequest, 15);
});

test("HR vacation preview reproduces full week as five legal vacation days", () => {
  const preview = calculateVacationPreview({
    agreementAccepted: true,
    calendarStatusByYear: { "2026": "verified" },
    endDate: "2026-08-30",
    hireDate: "2025-07-23",
    holidays: [],
    periods: [{ availableBalance: 120, baseDays: 15, continuousBlockRequired: 10, continuousBlockUsed: 10, periodEnd: "2026-07-22", periodStart: "2025-07-23", status: "open" }],
    schedule: {
      dateOverrides: {
        "2026-08-24": { reason: "MONDAY_CLOSED", source: "company_policy", working: false }
      },
      holidaysAreWorking: true,
      source: "company_policy",
      workingWeekdays: [0, 2, 3, 4, 5, 6]
    },
    startDate: "2026-08-24"
  });

  assert.equal(preview.calendarDays, 7);
  assert.equal(preview.businessDays, 5);
  assert.equal(preview.nonBusiness.legalWorkingDays, 5);
  assert.equal(preview.nonBusiness.saturdays, 1);
  assert.equal(preview.nonBusiness.sundays, 1);
  assert.equal(preview.totalAvailable, 120);
  assert.equal(preview.totalAfterRequest, 115);
  assert.equal(preview.allocations[0].days, 5);
});

test("HR vacation preview enables confirmation for Betancourt full-week legal preview", () => {
  const preview = calculateVacationPreview({
    calendarStatusByYear: { "2026": "verified" },
    endDate: "2026-08-16",
    hireDate: "2020-07-28",
    holidays: [],
    periods: [
      { availableBalance: 120, baseDays: 15, continuousBlockRequired: 10, continuousBlockUsed: 10, periodEnd: "2021-07-27", periodStart: "2020-07-28", status: "closed" }
    ],
    schedule: { source: "company_policy", workingWeekdays: [0, 2, 3, 4, 5, 6] },
    startDate: "2026-08-10"
  });

  assert.equal(preview.calendarDays, 7);
  assert.equal(preview.businessDays, 5);
  assert.equal(preview.nonBusiness.saturdays, 1);
  assert.equal(preview.nonBusiness.sundays, 1);
  assert.equal(preview.totalAvailable, 120);
  assert.equal(preview.totalAfterRequest, 115);
  assert.equal(preview.allocations.length, 1);
  assert.equal(preview.allocations[0].periodStart, "2020-07-28");
  assert.equal(preview.allocations[0].periodEnd, "2021-07-27");
  assert.equal(preview.allocations[0].days, 5);
  assert.equal(preview.canConfirm, true);
  assert.equal(preview.requiresReview, false);
  assert.deepEqual(preview.reviewReasons, []);
  assert.equal(preview.valid, true);
});

test("HR vacation preview review flags only block real confirmation issues", () => {
  const validWithoutIndividualWorkSchedule = calculateVacationPreview({
    calendarStatusByYear: { "2026": "verified" },
    endDate: "2026-08-16",
    hireDate: "2020-07-28",
    holidays: [],
    periods: [{ availableBalance: 120, baseDays: 15, continuousBlockRequired: 10, continuousBlockUsed: 10, periodEnd: "2021-07-27", periodStart: "2020-07-28" }],
    schedule: { source: "company_policy", workingWeekdays: [0, 2, 3, 4, 5, 6] },
    startDate: "2026-08-10"
  });
  assert.equal(validWithoutIndividualWorkSchedule.canConfirm, true);
  assert.equal(validWithoutIndividualWorkSchedule.reviewReasons.includes("fractionation_agreement_required"), false);

  const zeroProgressive = calculateVacationPreview({
    calendarStatusByYear: { "2026": "verified" },
    endDate: "2026-08-16",
    hireDate: "2020-07-28",
    holidays: [],
    periods: [{ availableBalance: 120, baseDays: 15, continuousBlockRequired: 10, continuousBlockUsed: 10, periodEnd: "2021-07-27", periodStart: "2020-07-28", progressiveDays: 0 }],
    progressiveRecords: [],
    schedule: { source: "company_policy", workingWeekdays: [0, 2, 3, 4, 5, 6] },
    startDate: "2026-08-10"
  });
  assert.equal(zeroProgressive.canConfirm, true);

  const insufficientBalance = calculateVacationPreview({
    calendarStatusByYear: { "2026": "verified" },
    endDate: "2026-08-16",
    hireDate: "2020-07-28",
    holidays: [],
    periods: [{ availableBalance: 2, baseDays: 15, continuousBlockRequired: 10, continuousBlockUsed: 10, periodEnd: "2021-07-27", periodStart: "2020-07-28" }],
    schedule: { source: "company_policy", workingWeekdays: [1, 2, 3, 4, 5] },
    startDate: "2026-08-10"
  });
  assert.equal(insufficientBalance.canConfirm, false);
  assert.equal(insufficientBalance.reviewReasons.includes("insufficient_vacation_balance"), true);

  const ambiguousPeriods = calculateVacationPreview({
    calendarStatusByYear: { "2026": "verified" },
    endDate: "2026-08-16",
    hireDate: "2020-07-28",
    holidays: [],
    periods: [
      { availableBalance: 15, baseDays: 15, periodEnd: "2021-07-27", periodStart: "2020-07-28" },
      { availableBalance: 15, baseDays: 15, periodEnd: "2022-07-27", periodStart: "2021-07-01" }
    ],
    schedule: { source: "company_policy", workingWeekdays: [1, 2, 3, 4, 5] },
    startDate: "2026-08-10"
  });
  assert.equal(ambiguousPeriods.canConfirm, false);
  assert.equal(ambiguousPeriods.reviewReasons.includes("vacation_period_ambiguous"), true);

  const calendarError = calculateVacationPreview({
    calendarStatusByYear: { "2026": "missing" },
    endDate: "2026-08-16",
    hireDate: "2020-07-28",
    holidays: [],
    periods: [{ availableBalance: 120, baseDays: 15, continuousBlockRequired: 10, continuousBlockUsed: 10, periodEnd: "2021-07-27", periodStart: "2020-07-28" }],
    schedule: { source: "company_policy", workingWeekdays: [1, 2, 3, 4, 5] },
    startDate: "2026-08-10"
  });
  assert.equal(calendarError.canConfirm, false);
  assert.equal(calendarError.reviewReasons.includes("holiday_calendar_missing"), true);
});

test("HR vacation preview supports the reproduced August 2026 inclusive range", () => {
  const preview = calculateVacationPreview({
    agreementAccepted: true,
    calendarStatusByYear: { "2026": "verified" },
    endDate: "2026-08-23",
    hireDate: "2025-07-28",
    holidays: CHILE_HOLIDAYS_FIXTURE,
    periods: [
      { availableBalance: 10, baseDays: 15, continuousBlockUsed: 10, periodEnd: "2026-07-27", periodStart: "2025-07-28", status: "closed", usedDays: 5 },
      { availableBalance: 15, baseDays: 15, periodEnd: "2027-07-27", periodStart: "2026-07-28", status: "open", usedDays: 0 }
    ],
    schedule: { source: "employee", workingWeekdays: [1, 2, 3, 4, 5] },
    startDate: "2026-08-19"
  });

  assert.equal(preview.calendarDays, 5);
  assert.equal(preview.businessDays, 3);
  assert.equal(preview.nonBusiness.saturdays, 1);
  assert.equal(preview.nonBusiness.sundays, 1);
  assert.equal(preview.holidaysApplied.length, 0);
  assert.equal(preview.totalAvailable, 25);
  assert.equal(preview.totalAfterRequest, 22);
  assert.equal(preview.remainingDays, 0);
  assert.equal(preview.valid, true);
  assert.equal(preview.allocations[0].days, 3);
  assert.equal(preview.allocations[0].periodStart, "2025-07-28");
});

test("HR vacation preview reports domain states without generic preview_failed", async () => {
  const route = await readFile("src/app/api/hr/vacations/preview/route.ts", "utf8");
  const vacationComponents = await readFile("src/components/hr/vacation-components.tsx", "utf8");

  assert.match(route, /INVALID_DATE_RANGE/);
  assert.match(route, /balanceBefore/);
  assert.match(route, /balanceAfter/);
  assert.match(route, /workingDays/);
  assert.match(route, /VACATION_PREVIEW_UNEXPECTED_ERROR/);
  assert.match(vacationComponents, /humanVacationPreviewMessage/);
  assert.doesNotMatch(vacationComponents, /Vista previa no disponible: \{preview\.error\}/);
  assert.match(vacationComponents, /previewValidAndCurrent/);
  assert.match(vacationComponents, /disabled=\{!previewValidAndCurrent \|\| confirming \|\| Boolean\(confirmed\)\}/);
  assert.match(vacationComponents, /setPreview\(\{ data: null, error: null, key: null/);
  assert.match(vacationComponents, /LISTO PARA CONFIRMAR/);
  assert.match(vacationComponents, /humanVacationReviewReason/);
  assert.match(vacationComponents, /previewCanConfirm/);
  assert.match(vacationComponents, /preview\.key === previewKey/);
  assert.match(route, /vacation_overlap/);
  assert.match(route, /blockingWarnings/);
});

test("Vercel ignore keeps the HR vacation preview API route deployable", async () => {
  const vercelIgnore = await readFile(".vercelignore", "utf8");
  assert.ok(existsSync("src/app/api/hr/vacations/preview/route.ts"));
  assert.match(vercelIgnore, /^\/preview\/$/m);
  assert.doesNotMatch(vercelIgnore, /^preview\/$/m);
});

test("HR vacation FIFO allocates mandatory example and keeps second period protected", () => {
  const fifo = allocateVacationFifo([
    { availableBalance: 5, baseDays: 15, continuousBlockRequired: 10, continuousBlockUsed: 10, periodEnd: "2025-07-22", periodStart: "2024-07-23", usedDays: 10 },
    { availableBalance: 15, baseDays: 15, continuousBlockRequired: 10, continuousBlockUsed: 0, periodEnd: "2026-07-22", periodStart: "2025-07-23", usedDays: 0 }
  ], 7);
  assert.equal(fifo.remainingDays, 0);
  assert.equal(fifo.allocations[0].days, 5);
  assert.equal(fifo.allocations[0].resultingBalance, 0);
  assert.equal(fifo.allocations[1].days, 2);
  assert.equal(fifo.allocations[1].resultingBalance, 13);
  assert.equal(validateFractionation({ agreementAccepted: true, periods: [{ availableBalance: 15, baseDays: 15, continuousBlockRequired: 10, continuousBlockUsed: 0, periodEnd: "2026-07-22", periodStart: "2025-07-23" }], requestedDays: 2 }).ok, true);
});

test("HR vacation blocks silent advances and permits explicit advance within projected proportional", () => {
  assert.equal(validateAdvanceVacation({ availableDays: 1, projectedProportionalDays: 2, requestedDays: 2 }).ok, false);
  assert.equal(validateAdvanceVacation({ advanceAuthorized: true, availableDays: 1, projectedProportionalDays: 2, requestedDays: 2 }).ok, true);
  assert.equal(validateAdvanceVacation({ advanceAuthorized: true, availableDays: 0, projectedProportionalDays: 1, requestedDays: 3 }).ok, false);
});

test("HR vacation preview returns FIFO, return date, immutable snapshot inputs and reversal", () => {
  const preview = calculateVacationPreview({
    agreementAccepted: true,
    asOf: "2026-07-24",
    hireDate: "2024-07-23",
    periods: [
      { availableBalance: 5, baseDays: 15, continuousBlockRequired: 10, continuousBlockUsed: 10, periodEnd: "2025-07-22", periodStart: "2024-07-23" },
      { availableBalance: 15, baseDays: 15, continuousBlockRequired: 10, continuousBlockUsed: 0, periodEnd: "2026-07-22", periodStart: "2025-07-23" }
    ],
    requestedBusinessDays: 7,
    schedule: { source: "employee", workingWeekdays: [1, 2, 3, 4, 5] },
    startDate: "2026-07-23"
  });
  assert.equal(preview.businessDays, 7);
  assert.equal(preview.calendarDays, 11);
  assert.equal(preview.allocations.length, 2);
  assert.equal(preview.returnToWorkDate, "2026-08-03");
  assert.equal(preview.totalAfterRequest, 13);
  assert.equal(preview.scheduleReviewRequired, false);
  assert.equal(reverseVacationAllocation(preview.allocations)[0].days, -5);
});

test("HR vacation calendar status exposes verified, incomplete and missing years", () => {
  assert.deepEqual(evaluateHolidayCalendarStatus("2026-01-01", "2026-12-31", { "2026": "verified" }), {
    calendarStatus: "verified",
    calendarWarnings: [],
    years: [2026]
  });
  assert.equal(evaluateHolidayCalendarStatus("2026-12-30", "2027-01-03", { "2026": "verified", "2027": "incomplete" }).calendarStatus, "incomplete");
  assert.equal(evaluateHolidayCalendarStatus("2028-01-01", "2028-01-02", {}).calendarStatus, "missing");
});

test("HR vacation progressive entitlement requires accreditation", () => {
  assert.equal(calculateAnnualEntitlement({ asOf: "2026-07-24", hireDate: "2016-07-23", progressiveRecords: [] }), 15);
  assert.equal(calculateAnnualEntitlement({ asOf: "2026-07-24", hireDate: "2016-07-23", progressiveRecords: [{ effectiveFrom: "2026-01-01", previousEmployerYears: 10, status: "acreditado" }] }), 18);
  assert.equal(calculateAnnualEntitlement({ asOf: "2026-07-24", hireDate: "2022-07-23", progressiveRecords: [{ effectiveFrom: "2026-01-01", previousEmployerYears: 9, status: "acreditado" }] }), 16);
});

test("HR vacation progressive entitlement follows Chile Labor Code article 68", () => {
  assert.equal(calculateProgressiveVacationDays({ currentEmployerServiceYears: 9, recognizedPreviousServiceYears: 0 }).progressiveDays, 0);
  assert.equal(calculateProgressiveVacationDays({ currentEmployerServiceYears: 10, recognizedPreviousServiceYears: 0 }).progressiveDays, 0);
  assert.equal(calculateProgressiveVacationDays({ currentEmployerServiceYears: 12, recognizedPreviousServiceYears: 0 }).progressiveDays, 0);
  assert.equal(calculateProgressiveVacationDays({ currentEmployerServiceYears: 13, recognizedPreviousServiceYears: 0 }).progressiveDays, 1);
  assert.equal(calculateProgressiveVacationDays({ currentEmployerServiceYears: 15, recognizedPreviousServiceYears: 0 }).progressiveDays, 1);
  assert.equal(calculateProgressiveVacationDays({ currentEmployerServiceYears: 16, recognizedPreviousServiceYears: 0 }).progressiveDays, 2);
  assert.equal(calculateProgressiveVacationDays({ currentEmployerServiceYears: 19, recognizedPreviousServiceYears: 0 }).progressiveDays, 3);
  assert.equal(calculateProgressiveVacationDays({ currentEmployerServiceYears: 4, recognizedPreviousServiceYears: 9 }).progressiveDays, 1);
  assert.equal(calculateProgressiveVacationDays({ currentEmployerServiceYears: 3, recognizedPreviousServiceYears: 10 }).progressiveDays, 1);
  assert.throws(() => calculateProgressiveVacationDays({ currentEmployerServiceYears: 1, recognizedPreviousServiceYears: 11 }), /recognized_previous_service_years_must_be_between_0_and_10/);

  assert.equal(calculateAnnualEntitlement({ asOf: "2026-07-22", hireDate: "2016-07-23", progressiveRecords: [{ effectiveFrom: "2026-01-01", previousEmployerYears: 0, status: "acreditado" }] }), 15);
  assert.equal(calculateAnnualEntitlement({ asOf: "2026-07-23", hireDate: "2016-07-23", progressiveRecords: [{ effectiveFrom: "2026-01-01", previousEmployerYears: 0, status: "acreditado" }] }), 15);
  assert.equal(calculateAnnualEntitlement({ asOf: "2029-07-23", hireDate: "2016-07-23", progressiveRecords: [{ effectiveFrom: "2026-01-01", previousEmployerYears: 0, status: "acreditado" }] }), 16);
});

test("HR vacation preview separates base and progressive days without artificial movements", () => {
  const preview = calculateVacationPreview({
    agreementAccepted: true,
    asOf: "2026-07-24",
    hireDate: "2022-07-23",
    progressiveRecords: [{ effectiveFrom: "2026-01-01", previousEmployerYears: 9, status: "acreditado" }],
    requestedBusinessDays: 7,
    schedule: { source: "employee", workingWeekdays: [1, 2, 3, 4, 5] },
    startDate: "2026-07-23"
  });
  assert.equal(preview.annualEntitlement, 16);
  assert.equal(preview.periods[0].baseDays, 15);
  assert.equal(preview.periods[0].progressiveDays, 1);
  assert.equal(preview.allocations[0].allocationType, "earned");
  assert.equal(preview.allocations.some((allocation) => allocation.allocationType === "advance"), false);
});

test("HR vacation FIFO considers progressive days available", () => {
  const fifo = allocateVacationFifo([
    { availableBalance: 16, baseDays: 15, progressiveDays: 1, periodEnd: "2034-07-27", periodStart: "2033-07-28", usedDays: 0 }
  ], 16);
  assert.equal(fifo.remainingDays, 0);
  assert.equal(fifo.allocations[0].days, 16);
  assert.equal(fifo.allocations[0].resultingBalance, 0);
});

test("HR vacation export workbook contains separated projected proportional columns", () => {
  const xml = buildVacationExcelXml({
    employees: [{ fullName: "Trabajador Demo", hireDate: "2024-07-23", id: "emp-1", rut: "12.345.678-5", status: "activo" }],
    movements: [{ balanceAfter: 13, days: -7, employeeId: "emp-1", movementType: "aprobacion", period: "2026-07" }],
    periods: [{ availableBalance: 13, baseDays: 15, employeeId: "emp-1", periodEnd: "2026-07-22", periodStart: "2025-07-23", progressiveDays: 0, reservedDays: 0, status: "open", usedDays: 2 }],
    projectedByEmployee: new Map([["emp-1", 1.25]]),
    requests: [{ businessDays: 7, documentNumber: "FER-2026-000001", employeeId: "emp-1", endDate: "2026-07-31", id: "req-1", resultingBalance: 13, startDate: "2026-07-23", status: "aprobada" }]
  });
  assert.match(xml, /RESUMEN/);
  assert.match(xml, /Proporcional proyectado/);
  assert.match(xml, /DETALLE POR PERIODO/);
  assert.match(xml, /FER-2026-000001/);
});

test("HR vacation persistent backfill is deterministic and idempotent", () => {
  const first = previewVacationPeriodBackfill({
    asOf: "2026-08-13",
    employeeId: "emp-1",
    existingPeriods: [],
    hireDate: "2024-07-23",
    yearsForward: 1
  });
  assert.equal(first.conflicts.length, 0);
  assert.ok(first.missing.length >= 2);
  const second = previewVacationPeriodBackfill({
    asOf: "2026-08-13",
    employeeId: "emp-1",
    existingPeriods: first.missing.map((period) => ({ period_end: period.periodEnd, period_start: period.periodStart })),
    hireDate: "2024-07-23",
    yearsForward: 1
  });
  assert.equal(second.missing.length, 0);
  assert.equal(second.conflicts.length, 0);
});

test("HR vacation balance is reproducible from persisted periods and movements", () => {
  const balance = calculateVacationBalanceAt({
    asOf: "2026-08-13",
    periods: [
      { advance_days: 0, available_balance: 2, base_days: 15, period_end: "2025-07-22", period_start: "2024-07-23", progressive_days: 0, reserved_days: 0, used_days: 13 },
      { advance_days: 0, available_balance: 12, base_days: 15, period_end: "2026-07-22", period_start: "2025-07-23", progressive_days: 1, reserved_days: 3, used_days: 1 }
    ],
    movements: [
      { days: -13, movement_type: "used" },
      { days: 1, movement_type: "progressive" }
    ]
  });
  assert.equal(balance.accrued, 31);
  assert.equal(balance.used, 14);
  assert.equal(balance.reserved, 3);
  assert.equal(balance.available, 14);
});

test("HR vacation import preview matches only by RUT and blocks duplicates", async () => {
  const csv = [
    "RUT,Fecha corte,Saldo,Tipo",
    "12.345.678-5,2026-07-25,5,saldo inicial",
    "11.111.111-1,2026-07-25,3,vacaciones usadas",
    "99.999.999-9,2026-07-25,2,saldo inicial",
    "22.222.222-2,2026-07-25,1,saldo inicial",
    "Trabajador Demo,2026-07-25,,saldo inicial"
  ].join("\n");
  const rawRows = parseVacationImportFile(Buffer.from(csv), "vacaciones.csv");
  const baseInput = {
    employees: [
      { fullName: "Trabajador Demo", id: "emp-1", rut: "12.345.678-5" },
      { fullName: "Trabajador Dos", id: "emp-2", rut: "11.111.111-1" },
      { fullName: "Duplicado A", id: "emp-3", rut: "22.222.222-2" },
      { fullName: "Duplicado B", id: "emp-4", rut: "22.222.222-2" }
    ],
    importType: "balances" as const,
    periodResolver: () => ({ id: "period-1", periodEnd: "2027-07-22", periodStart: "2026-07-23" }),
    parsedRows: rawRows,
    sourceHash: sha256(csv)
  };
  const duplicateHash = previewVacationImport(baseInput).rows[1].rowHash;
  const preview = previewVacationImport({
    ...baseInput,
    existingRowHashes: [{ row_hash: duplicateHash }],
  });
  assert.equal(preview.summary.total, 5);
  assert.equal(preview.summary.ready, 1);
  assert.equal(preview.summary.duplicates, 1);
  assert.equal(preview.summary.review, 1);
  assert.equal(preview.summary.invalid, 1);
  assert.equal(preview.summary.notFound, 1);
  assert.equal(preview.rows.find((row) => row.rut === "99999999-9")?.status, "TRABAJADOR NO ENCONTRADO");
  assert.equal(preview.rows.find((row) => row.rut === "22222222-2")?.notes, "RUT duplicado entre trabajadores activos");
});

test("HR vacation persistence migration is additive and creates import idempotency", async () => {
  const migration = await readFile("supabase/migrations/202608130001_hr_vacation_persistence_imports.sql", "utf8");
  assert.match(migration, /create table if not exists public\.hr_vacation_import_batches/);
  assert.match(migration, /add column if not exists row_hash/);
  assert.match(migration, /hr_vacation_movements_row_hash_uidx/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /grant select, insert, update on table public\.hr_vacation_import_batches to authenticated/);
  assert.doesNotMatch(migration, /to anon/);
  assert.doesNotMatch(migration, /^\s*(drop\s+table|delete|truncate)\b/im);
});

test("HR mass payroll workflow exposes migrations, routes and UI controls", async () => {
  const migration = await readFile("supabase/migrations/202607230001_hr_payroll_mass_workflow.sql", "utf8");
  const client = await readFile("src/components/hr/hr-dashboard-client.tsx", "utf8");
  const bulkPayslipsRoute = await readFile("src/app/api/hr/payslips/bulk/route.ts", "utf8");
  const paymentBatchRoute = await readFile("src/app/api/hr/payments/batch/route.ts", "utf8");
  const hardeningMigration = await readFile("supabase/migrations/202607230003_hr_payroll_hardening.sql", "utf8");
  const automationMigration = await readFile("supabase/migrations/202607300002_hr_payslip_to_payroll_automation.sql", "utf8");
  const hrData = await readFile("src/lib/hr/data.ts", "utf8");
  const hrPage = await readFile("src/app/(erp)/recursos-humanos/page.tsx", "utf8");

  assert.match(migration, /create table if not exists public\.hr_payment_concepts/);
  assert.match(migration, /create table if not exists public\.hr_payslip_import_batches/);
  assert.match(migration, /create table if not exists public\.hr_salary_data_audit/);
  assert.match(migration, /add column if not exists file_sha256/);
  assert.match(migration, /add column if not exists batch_id/);
  assert.match(migration, /add column if not exists sunday_surcharge_amount/);
  assert.doesNotMatch(migration, /^\s*(drop|delete|truncate)\b/im);
  assert.match(client, /Nueva nomina: colaboradores seleccionables/);
  assert.match(client, /Carga masiva y clasificacion/);
  assert.match(client, /payrollEmployeeSelection/);
  assert.match(client, /Liquidaciones asociadas automaticamente/);
  assert.match(bulkPayslipsRoute, /buildPayslipPayrollImportItems/);
  assert.match(bulkPayslipsRoute, /validatePayslipUploadFile/);
  assert.match(bulkPayslipsRoute, /const confirmable = results\.filter\(isConfirmable\)/);
  assert.match(bulkPayslipsRoute, /for \(const item of confirmable\)/);
  assert.match(bulkPayslipsRoute, /partially_confirmed/);
  assert.match(bulkPayslipsRoute, /failed\.push/);
  assert.doesNotMatch(bulkPayslipsRoute, /payslip_manual_review_required/);
  assert.match(client, /bulkPayslipCommitMessage/);
  assert.match(client, /No hay liquidaciones listas para confirmar/);
  assert.match(client, /item\.sourceType === "payslip_import"/);
  assert.match(client, /item\.paymentType === "remuneracion_mensual"/);
  assert.match(client, /params\.set\("period", periods\[0\]\)/);
  assert.match(client, /params\.set\("section", "payroll"\)/);
  assert.doesNotMatch(client, /setMessage\(payload\?\.error \?\? "No se pudo clasificar carga masiva\."/);
  assert.match(bulkPayslipsRoute, /mode !== "commit"/);
  assert.match(bulkPayslipsRoute, /file_sha256/);
  assert.match(bulkPayslipsRoute, /repairableDuplicates/);
  assert.match(bulkPayslipsRoute, /repaired_from_existing_payslip/);
  assert.match(bulkPayslipsRoute, /payment_item_repair_failed/);
  assert.match(bulkPayslipsRoute, /source_type: "payslip_import"/);
  assert.match(bulkPayslipsRoute, /payslip_id: insert\.data\.id/);
  assert.match(automationMigration, /hr_payment_items_payslip_import_payslip_uidx/);
  assert.match(paymentBatchRoute, /hr_payment_duplicates_need_confirmation/);
  assert.match(paymentBatchRoute, /validatePaymentBatchEmployee/);
  assert.match(paymentBatchRoute, /hr_create_payment_batch/);
  assert.match(paymentBatchRoute, /selectable_payroll_batch/);
  assert.match(hardeningMigration, /hr_create_payment_batch/);
  assert.match(hardeningMigration, /hr_upsert_accountant_data_rows/);
  assert.match(hardeningMigration, /hr_salary_data_audit/);
  assert.match(hrData, /requireHrServerContext/);
  assert.match(hrData, /getHrDashboardData\(selectedPeriod\?: string\)/);
  assert.match(hrPage, /getHrDashboardData\(params\.period\)/);
  assert.match(hrData, /\.eq\("tenant_id", ctx\.tenantId\)/);
});

test("HR authorization roles and tenant guards are explicit", async () => {
  const security = await readFile("src/lib/hr/security.ts", "utf8");
  assert.match(security, /HR_ALLOWED_ROLES = \["owner", "admin", "finance_manager"\]/);
  assert.match(security, /membership\.tenant_id/);
  assert.match(security, /membership\.company_id/);
  assert.match(security, /hr-context-invalid/);
  assert.doesNotMatch(security, /tenantId.*default/i);
});

test("HR payment batch validation blocks invalid bank or cross-tenant employee payloads before insert", () => {
  assert.deepEqual(validatePaymentBatchEmployee(undefined, "missing")?.alerts, ["trabajador inexistente o fuera del tenant", "banco", "codigo banco", "tipo cuenta", "numero cuenta", "banco no validado", "rut titular", "email pago"]);
  const invalid = validatePaymentBatchEmployee({
    full_name: "Demo",
    hr_employee_bank_accounts: [{ account_number: "", account_type: "", bank_code: "", bank_name: "", payment_email: "", validation_status: "pending" }],
    id: "emp-1",
    payment_enabled: true,
    status: "activo"
  }, "emp-1");
  assert.ok(invalid?.alerts.includes("banco"));
  assert.ok(invalid?.alerts.includes("banco no validado"));
  const valid = validatePaymentBatchEmployee({
    full_name: "Demo",
    hr_employee_bank_accounts: [{ account_holder_rut: "11.111.111-1", account_number: "123", account_type: "corriente", bank_code: "001", bank_name: "Banco", payment_email: "pago@example.com", validation_status: "validated" }],
    id: "emp-1",
    payment_enabled: true,
    status: "activo"
  }, "emp-1");
  assert.equal(valid, null);
});

test("HR bulk payslip upload policy rejects unsafe files before classification", () => {
  const validPdf = Buffer.from("%PDF-1.4\nfixture", "utf8");
  assert.deepEqual(validatePayslipUploadFile({ buffer: validPdf, filename: "liquidacion.pdf", mimeType: "application/pdf", size: validPdf.length }), []);
  assert.ok(validatePayslipUploadFile({ buffer: Buffer.from("not pdf"), filename: "liquidacion.pdf", mimeType: "application/pdf", size: 7 }).some((error) => error.code === "invalid_pdf_signature"));
  assert.ok(validatePayslipUploadFile({ buffer: Buffer.alloc(0), filename: "liquidacion.pdf", mimeType: "application/pdf", size: 0 }).some((error) => error.code === "empty_file"));
  assert.ok(validatePayslipUploadFile({ buffer: validPdf, filename: "liquidacion.txt", mimeType: "application/pdf", size: validPdf.length }).some((error) => error.code === "invalid_extension"));
  assert.ok(validatePayslipUploadBatch(Array.from({ length: 101 }, () => ({ size: 1 }))).errors.some((error) => error.code === "too_many_files"));
  assert.equal(sanitizePayslipFilename("../liquidacion maliciosa.pdf"), ".._liquidacion_maliciosa.pdf");
});

test("HR salary rows include every active worker and isolate novelty logic", () => {
  const employees = [
    { area: "Cocina", bankAccount: null, baseSalary: 0, birthDate: null, commune: null, contractType: "indefinido", costCenter: "COC", familyAllowances: 0, fullName: "Activa Con Fila", healthPlan: null, healthSystem: null, hireDate: null, id: "emp-a", nationality: null, paymentAlerts: [], paymentEnabled: true, personalEmail: null, phone: null, position: null, rut: "11.111.111-1", status: "activo", unemploymentInsurance: false, workEmail: null, workSchedule: null, address: null, afp: null },
    { area: "Salon", bankAccount: null, baseSalary: 0, birthDate: null, commune: null, contractType: "indefinido", costCenter: "SAL", familyAllowances: 0, fullName: "Activa Sin Fila", healthPlan: null, healthSystem: null, hireDate: null, id: "emp-b", nationality: null, paymentAlerts: [], paymentEnabled: true, personalEmail: null, phone: null, position: null, rut: "22.222.222-2", status: "activo", unemploymentInsurance: false, workEmail: null, workSchedule: null, address: null, afp: null },
    { area: "Admin", bankAccount: null, baseSalary: 0, birthDate: null, commune: null, contractType: "indefinido", costCenter: "ADM", familyAllowances: 0, fullName: "Inactiva", healthPlan: null, healthSystem: null, hireDate: null, id: "emp-c", nationality: null, paymentAlerts: [], paymentEnabled: false, personalEmail: null, phone: null, position: null, rut: "33.333.333-3", status: "inactivo", unemploymentInsurance: false, workEmail: null, workSchedule: null, address: null, afp: null }
  ];
  const rows = buildSalaryRows({
    accountantRows: [{ absences: 1, advances: 0, aguinaldo: 0, cashAllowance: 0, ccafLoan: 0, compensatoryBonus: 0, companyLoan: 0, costCenter: "COC", employeeId: "emp-a", fullName: "Activa Con Fila", id: "row-a", licenses: 0, movilization: 0, observations: null, overtimeHours: 0, period: "2026-06", phoneAllowance: 0, productionBonus: 0, reason: null, responsibilityBonus: 0, rut: "11.111.111-1", sundaySurcharge: 0 }],
    employees,
    paymentItems: [{ amount: 5000, employeeId: "emp-b", employeeName: "Activa Sin Fila", glosa: null, id: "pay-b", paymentType: "anticipo", payslipId: null, period: "2026-06", scheduledDate: null, sourceId: null, sourceType: null, status: "aprobado" }],
    period: "2026-06"
  });
  assert.deepEqual(rows.map((row) => row.employee.id), ["emp-a", "emp-b"]);
  assert.equal(rows.find((row) => row.employee.id === "emp-b")?.advances, 5000);
  assert.equal(salaryRowHasNovelty(rows[0]), true);
  assert.equal(salaryRowHasNovelty({ ...rows[1], advances: 0 }), false);
});

test("HR accountant export preserves the accountant template workbook shape", () => {
  assert.equal(SALARY_TEMPLATE.mainSheetName, "LIBRO REMUNERACIONES");
  assert.equal(SALARY_EXPORT_COLUMNS.fullName, "A");
  assert.equal(SALARY_EXPORT_COLUMNS.ccafLoan, "T");
  assert.ok(existsSync("src/templates/rrhh/datos-sueldos-contador.xlsx"));

  const buffer = generateAccountantWorkbook([
    {
      absences: 1,
      advances: 15000,
      aguinaldo: 10000,
      baseSalary: 500000,
      cashAllowance: 2000,
      ccafLoan: 3000,
      compensatoryBonus: 4000,
      companyLoan: 5000,
      costCenter: "COCINA",
      discounts: 0,
      fullName: "Trabajador Demo",
      licenses: 0,
      movilization: 7000,
      observations: "Fixture local",
      overtimeHours: 2,
      phoneAllowance: 6000,
      position: "Cocinero",
      productionBonus: 8000,
      raw: {},
      reason: "Permiso",
      responsibilityBonus: 9000,
      rowNumber: 6,
      rut: "12.345.678-5",
      sheetName: "LIBRO REMUNERACIONES",
      sundaySurcharge: 11000
    }
  ]);
  const zip = new AdmZip(Buffer.from(buffer));
  const workbook = zip.readAsText("xl/workbook.xml");
  const sheet = zip.readAsText("xl/worksheets/sheet1.xml");

  for (const sheetName of SALARY_PRESERVED_SHEETS) assert.match(workbook, new RegExp(sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sheet, /<dimension ref="A1:V7"/);
  assert.match(sheet, /<c r="A6"/);
  assert.match(sheet, /SUM\(I6:I6\)/);
});

test("HR payslip classifier matches a PDF-like file by RUT without writing storage", () => {
  const result = classifyPayslipPdf(Buffer.from("LIQUIDACION RUT 12.345.678-5 TOTAL LIQUIDO 100000", "latin1"), [
    { fullName: "Trabajador Demo", id: "11111111-1111-4111-8111-111111111111", rut: "12.345.678-5" }
  ], "2026-06");

  assert.equal(result.status, "auto_asociada");
  assert.equal(result.matchLevel, "alta");
  assert.equal(result.matchMethod, "rut_exacto");
  assert.equal(result.employeeName, "Trabajador Demo");
  assert.equal(result.detectedPeriod, "2026-06");
});

function syntheticPayslipsPdf(pages: Array<{ name: string; rut: string; net: string; period?: string }>) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`
  ];
  for (const [pageIndex, item] of pages.entries()) {
    const lines = [
      "MES :",
      item.period ?? "ABRIL DE 2026",
      "NOMBRE :",
      item.name,
      "RUT :",
      item.rut,
      "CARGO :",
      "VALIDADOR",
      "SECCION :",
      "RRHH",
      "TOTAL HABERES",
      "$ 9.999.999",
      "TOTAL DESCUENTOS",
      "$ 1",
      "LIQUIDO A PAGAR",
      item.net
    ];
    const textOps = lines.map((line, index) => `BT /F1 12 Tf 42 ${740 - index * 26} Td (${line.replace(/[()\\]/g, "")}) Tj ET`).join("\n");
    const compressed = zlib.deflateSync(Buffer.from(textOps, "latin1"));
    const pageObject = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${4 + pageIndex * 2} 0 R >>`;
    const streamObject = `<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n${compressed.toString("latin1")}\nendstream`;
    objects.push(pageObject, streamObject);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

test("HR multipage payslip import creates one preview row and payroll glosa per page", async () => {
  const pdf = syntheticPayslipsPdf([
    { name: "BETANCOURT PAREZ JESUS", net: "$1.379.182", rut: "25.289.035-1" },
    { name: "BURGA TRUJILLO JOSE LUIS", net: "$707.282", rut: "27.891.945-5" },
    { name: "TRABAJADOR SIN PAGO", net: "$0", rut: "11.111.111-1" }
  ]);
  const employees = [
    { fullName: "BETANCOURT PAREZ JESUS", id: "11111111-1111-4111-8111-111111111111", rut: "25.289.035-1" },
    { fullName: "BURGA TRUJILLO JOSE LUIS", id: "22222222-2222-4222-8222-222222222222", rut: "27.891.945-5" },
    { fullName: "TRABAJADOR SIN PAGO", id: "33333333-3333-4333-8333-333333333333", rut: "11.111.111-1" }
  ];

  const items = await buildPayslipPayrollImportItems({ buffer: pdf, employees, filename: "liquidaciones-abril-demo.pdf" });
  const summary = summarizePayslipPayrollImport(items);

  assert.equal(items.length, 3);
  assert.equal(items[0].period, "2026-04");
  assert.equal(items[0].netAmount, 1379182);
  assert.equal(items[0].glosa, "Pago remuneración abril 2026");
  assert.equal(items[0].matchMethod, "rut_exacto");
  assert.equal(items[1].netAmount, 707282);
  assert.equal(items[2].status, "sin_pago");
  assert.equal(items[2].paymentRequired, false);
  assert.equal(summary.ready, 2);
  assert.equal(summary.zeroNet, 1);
  assert.equal(summary.totalPayable, 2086464);
  assert.equal(payslipPaymentGlosa("2026-06"), "Pago remuneración junio 2026");
});

test("HR multipage payslip import flags repeated page hashes as duplicates", async () => {
  const pdf = syntheticPayslipsPdf([
    { name: "BETANCOURT PAREZ JESUS", net: "$1.379.182", rut: "25.289.035-1" }
  ]);
  const employees = [{ fullName: "BETANCOURT PAREZ JESUS", id: "11111111-1111-4111-8111-111111111111", rut: "25.289.035-1" }];
  const first = await buildPayslipPayrollImportItems({ buffer: pdf, employees, filename: "liquidacion-demo.pdf" });
  const repeated = await buildPayslipPayrollImportItems({ buffer: pdf, duplicateHashes: new Set([first[0].fileSha256]), employees, filename: "liquidacion-demo.pdf" });

  assert.equal(repeated[0].status, "duplicado");
  assert.equal(summarizePayslipPayrollImport(repeated).duplicates, 1);
});

test("HR vacation receipt renders the definitive feriado model without legacy trial watermark", async () => {
  const migration = await readFile("supabase/migrations/202607230002_hr_vacation_receipts.sql", "utf8");
  const periodsMigration = await readFile("supabase/migrations/202607240001_hr_vacation_periods_workflow.sql", "utf8");
  const route = await readFile("src/app/api/hr/vacations/[id]/papeleta/route.ts", "utf8");
  const cancelRoute = await readFile("src/app/api/hr/vacations/[id]/route.ts", "utf8");
  const model = buildVacationReceiptModel({
    allocations: [
      { balanceAfter: 0, balanceBefore: 5, daysUsed: 5, period: "2024-2025" },
      { balanceAfter: 13, balanceBefore: 15, daysUsed: 2, period: "2025-2026" }
    ],
    businessDays: 7,
    company: { address: "Av. Demo 123", legalName: "Empresa Demo SPA", phone: "222222222", rut: "76.000.000-0" },
    contractPeriodEnd: "2025-07-22",
    contractPeriodStart: "2024-07-23",
    documentDate: "2026-07-23",
    employee: { area: "Cocina", contractType: "Indefinido", costCenter: "LCDJ", fullName: "Trabajador Demo", hireDate: "2024-07-23", id: "emp-1", position: "Maestro", rut: "12.345.678-5" },
    endDate: "2026-07-31",
    fractionalVacation: false,
    id: "11111111-2222-4333-8444-555555555555",
    previousBalance: 20,
    resultingBalance: 13,
    startDate: "2026-07-23"
  });
  const html = renderVacationReceiptHtml(model);
  const pdf = renderVacationReceiptPdf(model);

  assert.equal(nextBusinessDateAfter("2026-07-31"), "2026-08-03");
  assert.equal(model.vacationKind, "PARCIAL");
  assert.match(html, /COMPROBANTE DE FERIADO/);
  assert.match(html, /Aplicacion por periodos/);
  assert.match(html, /Reincorporacion/);
  assert.doesNotMatch(html, /Gnostice|TRIAL version/i);
  assert.ok(pdf.byteLength > 1000);
  assert.equal(vacationReceiptHash(pdf).length, 64);
  assert.match(migration, /receipt_snapshot jsonb/);
  assert.match(migration, /file_sha256 text/);
  assert.match(route, /format === "html"/);
  assert.match(route, /renderVacationReceiptPdf/);
  assert.match(route, /hr-vacation-documents/);
  assert.match(route, /vacationReceiptHash/);
  assert.match(periodsMigration, /hr\.vacation_cancelled/);
  assert.match(cancelRoute, /hr_cancel_vacation_request/);
  assert.match(periodsMigration, /hr_vacation_movements/);
  assert.match(periodsMigration, /create table if not exists public\.hr_vacation_periods/);
  assert.match(periodsMigration, /create table if not exists public\.hr_vacation_allocations/);
  assert.match(periodsMigration, /create table if not exists public\.hr_holiday_calendar/);
  assert.match(periodsMigration, /hr_next_document_number/);
  assert.match(periodsMigration, /hr_approve_vacation_request/);
  assert.match(periodsMigration, /hr_accredit_progressive_vacation/);

  const legalWeekModel = buildVacationReceiptModel({
    businessDays: 5,
    company: { address: "Av. Demo 123", legalName: "Empresa Demo SPA", phone: "222222222", rut: "76.000.000-0" },
    documentDate: "2026-08-21",
    employee: { fullName: "BETANCOURT PAREZ JESUS", rut: "25.289.035-1" },
    endDate: "2026-08-30",
    id: "11111111-2222-4333-8444-555555555556",
    nonBusinessDays: 2,
    previousBalance: 120,
    resultingBalance: 115,
    startDate: "2026-08-24"
  });
  const legalWeekHtml = renderVacationReceiptHtml(legalWeekModel);
  assert.match(legalWeekHtml, /<th>Dias habiles<\/th><td>5<\/td>/);
  assert.match(legalWeekHtml, /<th>Domingos e inhabiles<\/th><td>2<\/td>/);
  assert.match(legalWeekHtml, /<th>Saldo pendiente<\/th><td colspan="3">115<\/td>/);
});

test("HR vacation hardening migration implements transactional FIFO, idempotent reserves and secure RPCs", async () => {
  const migration = await readFile("supabase/migrations/202607240002_hr_vacation_transaction_hardening.sql", "utf8");
  const createRoute = await readFile("src/app/api/hr/vacations/route.ts", "utf8");
  const approveRoute = await readFile("src/app/api/hr/vacations/[id]/approve/route.ts", "utf8");
  const rejectRoute = await readFile("src/app/api/hr/vacations/[id]/reject/route.ts", "utf8");
  const cancelRoute = await readFile("src/app/api/hr/vacations/[id]/route.ts", "utf8");
  const receiptRoute = await readFile("src/app/api/hr/vacations/[id]/receipt/route.ts", "utf8");
  const accrualRoute = await readFile("src/app/api/hr/vacations/accruals/route.ts", "utf8");

  assert.match(migration, /202607240002_hr_vacation_transaction_hardening/);
  assert.match(migration, /hr_current_vacation_actor/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /set search_path = public, pg_temp/i);
  assert.match(migration, /drop function if exists public\.hr_approve_vacation_request\(text, uuid, uuid, uuid, uuid, jsonb\)/);
  assert.match(migration, /create or replace function public\.hr_approve_vacation_request\(\s*p_request_id uuid,\s*p_expected_version integer default null,/);
  assert.doesNotMatch(migration, /create or replace function public\.hr_approve_vacation_request\(\s*p_actor_role text/);
  assert.match(migration, /for update/gi);
  assert.match(migration, /hr_vacation_has_overlap/);
  assert.match(migration, /vacation_overlap/);
  assert.match(migration, /order by period_start asc, created_at asc, id asc/);
  assert.match(migration, /drop constraint if exists hr_vacation_allocations_tenant_id_request_id_allocation_order_key/);
  assert.match(migration, /insert into public\.hr_vacation_allocations/);
  assert.match(migration, /reserved_days = reserved_days \+ v_take/);
  assert.match(migration, /reserved_days = greatest\(0, reserved_days - v_allocation\.allocated_days\)/);
  assert.match(migration, /used_days = used_days \+ v_allocation\.allocated_days/);
  assert.match(migration, /used_days = greatest\(0, used_days - v_allocation\.allocated_days\)/);
  assert.match(migration, /advance_days = greatest\(0, advance_days - v_allocation\.allocated_days\)/);
  assert.match(migration, /allocation_status = 'reversed'/);
  assert.match(migration, /vacation_already_cancelled/);
  assert.match(migration, /vacation_not_rejectable/);
  assert.match(migration, /vacation_calendar_not_verified/);
  assert.match(migration, /hr_vacation_allocations_one_active_reservation_uidx/);
  assert.match(migration, /revoke execute on function public\.hr_approve_vacation_request\(uuid, integer, text\) from public/);
  assert.match(migration, /grant execute on function public\.hr_approve_vacation_request\(uuid, integer, text\) to authenticated/);

  assert.match(createRoute, /hr_create_vacation_request/);
  assert.match(createRoute, /import \{ createClient \} from "@\/lib\/supabase\/server"/);
  assert.match(createRoute, /const authSupabase = await createClient\(\)/);
  assert.match(createRoute, /authSupabase\.rpc\("hr_create_vacation_request"/);
  assert.match(createRoute, /authSupabase\.rpc\("hr_approve_vacation_request"/);
  assert.doesNotMatch(createRoute, /const rpc = await supabase\.rpc\("hr_create_vacation_request"/);
  assert.match(createRoute, /status: body\.status === "aprobada" \? "solicitada" : legacyStatus\(body\.status\)/);
  assert.match(createRoute, /p_calendar_override_reason: calendarOverrideReason/);
  assert.doesNotMatch(createRoute, /p_actor_role/);
  assert.doesNotMatch(createRoute, /p_tenant_id/);
  assert.doesNotMatch(createRoute, /rpc_not_available_fallback_insert/);
  assert.match(approveRoute, /p_expected_version/);
  assert.doesNotMatch(approveRoute, /p_snapshot/);
  assert.doesNotMatch(rejectRoute, /rpc_not_available_fallback_reject/);
  assert.doesNotMatch(cancelRoute, /rpc_not_available_fallback_cancel/);
  assert.match(receiptRoute, /createSignedUrl/);
  assert.match(receiptRoute, /expiresInSeconds: 600/);
  assert.match(accrualRoute, /getEmployeeForHrTenant/);
  assert.match(accrualRoute, /employee_not_active/);
});

test("HR vacation confirmation uses authenticated session and human UI errors", async () => {
  const createRoute = await readFile("src/app/api/hr/vacations/route.ts", "utf8");
  const vacationComponents = await readFile("src/components/hr/vacation-components.tsx", "utf8");

  assert.match(createRoute, /requireHrContext/);
  assert.match(createRoute, /createAdminClient/);
  assert.match(createRoute, /createClient/);
  assert.match(createRoute, /authSupabase\.rpc\("hr_create_vacation_request"/);
  assert.match(createRoute, /authSupabase\.rpc\("hr_approve_vacation_request"/);
  assert.match(createRoute, /function vacationErrorStatus/);
  assert.match(createRoute, /function vacationErrorCode/);
  assert.match(createRoute, /VACATION_CREATE_FAILED/);
  assert.match(createRoute, /VACATION_APPROVAL_FAILED/);
  assert.match(createRoute, /calendarStatus === "incomplete"/);
  assert.match(createRoute, /Calendario de feriados incompleto validado por preview RRHH/);

  assert.match(vacationComponents, /humanVacationConfirmMessage/);
  assert.match(vacationComponents, /Tu sesion expiro\. Vuelve a iniciar sesion antes de confirmar las vacaciones\./);
  assert.match(vacationComponents, /No tienes permisos para confirmar vacaciones\./);
  assert.match(vacationComponents, /La solicitud se creo, pero no pudo aprobarse automaticamente/);
  assert.match(vacationComponents, /No se pudo confirmar la solicitud\. No se realizaron cambios\./);
  assert.match(vacationComponents, /credentials: "same-origin"/);
  assert.match(vacationComponents, /const \[confirming, setConfirming\]/);
  assert.match(vacationComponents, /if \(confirming\) return/);
  assert.match(vacationComponents, /disabled=\{!previewValidAndCurrent \|\| confirming \|\| Boolean\(confirmed\)\}/);
  assert.doesNotMatch(vacationComponents, /window\.alert/);
});

test("HR vacation confirmation keeps approved requests successful when receipt persistence fails", async () => {
  const createRoute = await readFile("src/app/api/hr/vacations/route.ts", "utf8");
  const vacationComponents = await readFile("src/components/hr/vacation-components.tsx", "utf8");

  assert.match(createRoute, /VACATION_RECEIPT_FAILED/);
  assert.match(createRoute, /VACATION_CONFIRMED_RECEIPT_PENDING/);
  assert.match(createRoute, /document_generation_status: "error"/);
  assert.match(createRoute, /document_generation_status: "generated"/);
  assert.match(createRoute, /return NextResponse\.json\(\{\s*ok: true,\s*code: "VACATION_CONFIRMED_RECEIPT_PENDING"/);
  assert.doesNotMatch(createRoute, /if \(!receipt\.ok\) return NextResponse\.json\(\{ ok: false, error: receipt\.error, requestId \}/);

  assert.match(vacationComponents, /receiptWarning/);
  assert.match(vacationComponents, /La solicitud fue confirmada\. El comprobante quedo pendiente de regeneracion\./);
});

test("HR global vacation calendar policy migration adds tenant policy and monthly Sunday schedule safely", async () => {
  const migration = await readFile("supabase/migrations/202608210001_hr_global_vacation_calendar_policy.sql", "utf8");
  const previewRoute = await readFile("src/app/api/hr/vacations/preview/route.ts", "utf8");
  const vacationRoute = await readFile("src/app/api/hr/vacations/route.ts", "utf8");
  const sundayRoute = await readFile("src/app/api/hr/sunday-days-off/route.ts", "utf8");
  const client = await readFile("src/components/hr/hr-dashboard-client.tsx", "utf8");

  assert.match(migration, /create table if not exists public\.hr_vacation_calendar_policies/);
  assert.match(migration, /monday_closed boolean not null default true/);
  assert.match(migration, /public_holidays_working boolean not null default true/);
  assert.match(migration, /monthly_sundays_off integer not null default 2/);
  assert.match(migration, /create table if not exists public\.hr_employee_monthly_days_off/);
  assert.match(migration, /extract\(dow from off_date\) = 0/);
  assert.match(migration, /create table if not exists public\.hr_company_calendar_exceptions/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /current_user_is_member/);
  assert.match(migration, /current_user_has_role/);
  assert.match(migration, /insert into public\.hr_vacation_calendar_policies/);
  assert.match(migration, /non_business_days/);
  assert.match(previewRoute, /resolveEmployeeWorkingCalendar/);
  assert.doesNotMatch(previewRoute, /REVISAR_JORNADA_CONTRACTUAL/);
  assert.match(vacationRoute, /non_business_days/);
  assert.match(sundayRoute, /validateMonthlySundayOffDates/);
  assert.match(client, /Programacion/);
  assert.match(client, /Domingos libres/);
});

test("HR progressive vacation article 68 migration blocks manual over-recognition", async () => {
  const migration = await readFile("supabase/migrations/202608210002_hr_progressive_vacation_article_68.sql", "utf8");
  const route = await readFile("src/app/api/hr/vacations/progressive/route.ts", "utf8");
  const components = await readFile("src/components/hr/vacation-components.tsx", "utf8");

  assert.match(migration, /hr_vacation_progressive_previous_years_chk/);
  assert.match(migration, /previous_employer_years >= 0 and previous_employer_years <= 10/);
  assert.match(migration, /hr_vacation_progressive_recognized_days_chk/);
  assert.match(migration, /recognized_days = 0/);
  assert.match(migration, /set search_path = public, pg_temp/);
  assert.match(route, /recognizedPreviousServiceYears: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\(10\)/);
  assert.match(route, /hr\.vacation_progressive_previous_years_recognized/);
  assert.match(components, /Feriado progresivo/);
  assert.match(components, /Anios previos reconocidos/);
});

test("HR vacation hardening documents V1 limitations without pretending native XLSX or final PDF", async () => {
  const receipt = await readFile("src/lib/hr/vacation-receipt.ts", "utf8");
  const exportFile = await readFile("src/lib/hr/vacation-export.ts", "utf8");
  assert.match(receipt, /renderVacationReceiptPdf/);
  assert.match(exportFile, /urn:schemas-microsoft-com:office:spreadsheet/);
});

const aprilPayslipsFixture = fixturePath("liquidaciones-abril-2026.pdf");
const aprilSalaryFixture = fixturePath("datos-sueldos-abril-2026.xlsx");

test("HR payroll import parser reads optional April 2026 payslips and Datos Sueldos fixtures", { skip: !existsSync(aprilPayslipsFixture) || !existsSync(aprilSalaryFixture) }, () => {
  const payslips = extractPayslipsFromPdf(readFileSync(aprilPayslipsFixture));
  const accountantRows = parseAccountantWorkbook(readFileSync(aprilSalaryFixture));
  const jesus = payslips.find((item) => item.rut === "25.289.035-1");

  assert.ok(payslips.length >= 25, `expected at least 25 payslips, got ${payslips.length}`);
  assert.ok(jesus, "expected Jesus Betancourt payslip in real PDF");
  assert.equal(jesus?.period, "2026-04");
  assert.equal(jesus?.position, "ADMINISTRADOR");
  assert.ok((jesus?.netPay ?? 0) > 0);
  assert.ok(accountantRows.length >= 25, `expected at least 25 accountant rows, got ${accountantRows.length}`);
  assert.ok(accountantRows.some((row) => row.rut.includes("25.289.035-1")));
  assert.ok(generateAccountantWorkbook(accountantRows).byteLength > 0);
});

const maySalaryFixture = fixturePath("datos-sueldos-mayo-2026.xlsx");

test("HR accountant parser reads optional May 2026 Datos Sueldos workbook shape", { skip: !existsSync(maySalaryFixture) }, () => {
  const rows = parseAccountantWorkbook(readFileSync(maySalaryFixture));
  const egliany = rows.find((row) => row.rut.includes("44.209.392-K"));

  assert.ok(rows.length >= 20, `expected at least 20 accountant rows, got ${rows.length}`);
  assert.ok(egliany, "expected EGLIANY row from the real May workbook");
  assert.equal(egliany?.overtimeHours, 8);
  assert.equal(egliany?.aguinaldo, 260000);
  assert.equal(egliany?.sundaySurcharge, 50000);
  assert.ok(generateAccountantWorkbook(rows).byteLength > 0);
});
