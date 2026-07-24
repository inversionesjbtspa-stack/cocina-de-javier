import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { classifyPayslipPdf } from "../src/lib/hr/payslip-classifier.ts";
import test from "node:test";
import { extractPayslipsFromPdf, generateAccountantWorkbook, parseAccountantWorkbook } from "../src/lib/hr/payroll-parser.ts";
import { validatePaymentBatchEmployee } from "../src/lib/hr/payment-batch.ts";
import { buildSalaryRows, salaryRowHasNovelty } from "../src/lib/hr/salary-data.ts";
import { SALARY_EXPORT_COLUMNS, SALARY_PRESERVED_SHEETS, SALARY_TEMPLATE } from "../src/lib/hr/salary-export-map.ts";
import { sanitizePayslipFilename, validatePayslipUploadBatch, validatePayslipUploadFile } from "../src/lib/hr/payslip-upload-policy.ts";
import { businessDaysInclusive, accruedVacationDays } from "../src/lib/hr/utils.ts";
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
  assert.match(vacationRoute, /businessDaysInclusive/);
  assert.match(vacationAccrualRoute, /hr\.vacation_accrual_recorded/);
  assert.match(finiquitosRoute, /hr\.finiquito_created/);
  assert.match(honorariosRoute, /hr\.honorario_created/);
  assert.match(noveltiesRoute, /tenant_id,employee_id,period,novelty_type/);
  assert.match(noveltiesRoute, /hr\.monthly_novelty_created/);
  assert.match(accountantRoute, /Schema cache de Supabase desactualizado/);
  assert.match(accountantRoute, /notify pgrst, 'reload schema'/);
  assert.match(accountantRoute, /readRowsWithPg/);
  assert.match(accountantRoute, /employee_name/);
  assert.match(client, /Novedades mensuales/);
  assert.match(client, /Datos Sueldos/);
  assert.match(client, /Feriado fraccionado/);
  assert.match(client, /Anticipos avanzados/);
  assert.match(client, /Exportar tramo banco/);
  assert.match(client, /Enviar liquidaciones pendientes pagadas/);
});

test("HR mass payroll workflow exposes migrations, routes and UI controls", async () => {
  const migration = await readFile("supabase/migrations/202607230001_hr_payroll_mass_workflow.sql", "utf8");
  const client = await readFile("src/components/hr/hr-dashboard-client.tsx", "utf8");
  const bulkPayslipsRoute = await readFile("src/app/api/hr/payslips/bulk/route.ts", "utf8");
  const paymentBatchRoute = await readFile("src/app/api/hr/payments/batch/route.ts", "utf8");
  const hardeningMigration = await readFile("supabase/migrations/202607230003_hr_payroll_hardening.sql", "utf8");
  const hrData = await readFile("src/lib/hr/data.ts", "utf8");

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
  assert.match(bulkPayslipsRoute, /classifyPayslipPdf/);
  assert.match(bulkPayslipsRoute, /validatePayslipUploadFile/);
  assert.match(bulkPayslipsRoute, /payslip_manual_review_required/);
  assert.match(bulkPayslipsRoute, /mode !== "commit"/);
  assert.match(bulkPayslipsRoute, /file_sha256/);
  assert.match(paymentBatchRoute, /hr_payment_duplicates_need_confirmation/);
  assert.match(paymentBatchRoute, /validatePaymentBatchEmployee/);
  assert.match(paymentBatchRoute, /hr_create_payment_batch/);
  assert.match(paymentBatchRoute, /selectable_payroll_batch/);
  assert.match(hardeningMigration, /hr_create_payment_batch/);
  assert.match(hardeningMigration, /hr_upsert_accountant_data_rows/);
  assert.match(hardeningMigration, /hr_salary_data_audit/);
  assert.match(hrData, /requireHrServerContext/);
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
    paymentItems: [{ amount: 5000, employeeId: "emp-b", employeeName: "Activa Sin Fila", glosa: null, id: "pay-b", paymentType: "anticipo", period: "2026-06", scheduledDate: null, status: "aprobado" }],
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

test("HR vacation receipt renders the definitive feriado model without legacy trial watermark", async () => {
  const migration = await readFile("supabase/migrations/202607230002_hr_vacation_receipts.sql", "utf8");
  const route = await readFile("src/app/api/hr/vacations/[id]/papeleta/route.ts", "utf8");
  const cancelRoute = await readFile("src/app/api/hr/vacations/[id]/route.ts", "utf8");
  const createRoute = await readFile("src/app/api/hr/vacations/route.ts", "utf8");
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
  assert.match(createRoute, /hr-vacation-documents/);
  assert.match(createRoute, /hr\.vacation_receipt_generated/);
  assert.match(cancelRoute, /hr\.vacation_cancelled/);
  assert.match(cancelRoute, /hr_vacation_ledger/);
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
