import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractPayslipsFromPdf, generateAccountantWorkbook, parseAccountantWorkbook } from "../src/lib/hr/payroll-parser.ts";
import { businessDaysInclusive, accruedVacationDays } from "../src/lib/hr/utils.ts";

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
  const employeesRoute = await readFile("src/app/api/hr/employees/route.ts", "utf8");
  const payslipsRoute = await readFile("src/app/api/hr/payslips/route.ts", "utf8");
  const vacationRoute = await readFile("src/app/api/hr/vacations/route.ts", "utf8");

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
  assert.match(employeesRoute, /hr\.employee_created/);
  assert.match(payslipsRoute, /hr\.payslip_uploaded/);
  assert.match(vacationRoute, /businessDaysInclusive/);
  assert.match(accountantRoute, /Schema cache de Supabase desactualizado/);
  assert.match(accountantRoute, /notify pgrst, 'reload schema'/);
  assert.match(accountantRoute, /readRowsWithPg/);
  assert.match(accountantRoute, /employee_name/);
});

test("HR payroll import parser reads the real April 2026 payslips and Datos Sueldos files", { skip: !existsSync("C:/Users/Jose Luis/Downloads/Liquidaciones de Abril 2026 (1).pdf") || !existsSync("C:/Users/Jose Luis/Downloads/4.- Datos sueldos abril 2026 V0.xlsx") }, () => {
  const payslips = extractPayslipsFromPdf(readFileSync("C:/Users/Jose Luis/Downloads/Liquidaciones de Abril 2026 (1).pdf"));
  const accountantRows = parseAccountantWorkbook(readFileSync("C:/Users/Jose Luis/Downloads/4.- Datos sueldos abril 2026 V0.xlsx"));
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
