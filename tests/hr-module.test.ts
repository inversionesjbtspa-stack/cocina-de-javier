import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { businessDaysInclusive, accruedVacationDays } from "../src/lib/hr/utils.ts";

test("HR vacation helpers count business days and accrue Chile base vacation days", () => {
  assert.equal(businessDaysInclusive("2026-05-25", "2026-05-31"), 5);
  assert.equal(businessDaysInclusive("2026-05-30", "2026-05-31"), 0);
  assert.equal(accruedVacationDays("2025-05-26", new Date("2026-05-26T00:00:00")), 15);
});

test("HR module exposes operational tables, storage buckets and payment template flow", async () => {
  const migration = await readFile("supabase/migrations/202605150018_hr_module.sql", "utf8");
  const page = await readFile("src/app/(erp)/recursos-humanos/page.tsx", "utf8");
  const client = await readFile("src/components/hr/hr-dashboard-client.tsx", "utf8");
  const paymentRoute = await readFile("src/app/api/hr/payment-template/route.ts", "utf8");
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
  assert.match(page, /RRHH operativo/);
  assert.match(client, /Template Pagos JESUS/);
  assert.match(client, /Habilitar pagos/);
  assert.match(paymentRoute, /generateSantanderTemplateFromRows/);
  assert.match(paymentRoute, /hr_payment_batches/);
  assert.match(paymentRoute, /payment_enabled/);
  assert.match(employeesRoute, /hr\.employee_created/);
  assert.match(payslipsRoute, /hr\.payslip_uploaded/);
  assert.match(vacationRoute, /businessDaysInclusive/);
});
