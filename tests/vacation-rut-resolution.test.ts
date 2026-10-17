import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { certifiedVacationSummary, previewCertifiedVacationBalances } from "../src/lib/hr/vacation-certified.ts";
import { calculateVacationPreview } from "../src/lib/hr/vacation-domain.ts";

const opening = Object.freeze({ id: "fixture-opening", employeeId: "fixture-worker", tenantId: "fixture-tenant",
  balanceDays: 27.5, effectiveCutoffDate: "2026-10-16", hireDate: "2021-10-05", baseDays: 15,
  progressiveDaysCurrent: 0, annualEntitlementOverride: null, overrideReason: null,
  recognizedPreviousYears: null, internalAlert: null, source: "fixture.xlsx" });

test("documented source RUT can differ without changing canonical employee identity", () => {
  const employee = Object.freeze({ id: "fixture-worker", rut: "22222222-2", fullName: "PERSONA FICTICIA",
    hireDate: "2021-10-05", tenantId: "fixture-tenant", currentBalance: 70 });
  const source = Object.freeze({ source_rut: "11111111-1", canonical_rut: employee.rut,
    resolved_worker_id: employee.id, resolution_reason: "Documentary fixture", resolution_evidence: ["fixture.pdf"] });
  const result = previewCertifiedVacationBalances({ asOf: "2026-10-17", cutoffDate: "2026-10-16",
    rows: [{ rowNumber: 1, values: { RUT: source.canonical_rut, VACACIONES: "27.50" } }], employees: [employee] });
  assert.equal(result[0].employeeId, employee.id);
  assert.equal(result[0].balanceDays, 27.5);
  assert.equal(employee.rut, "22222222-2");
  assert.equal(source.source_rut, "11111111-1");
});

test("reconciled opening replaces legacy balance without adding or simulating usage", () => {
  const legacy = Object.freeze({ periodStart: "2021-10-05", periodEnd: "2022-10-04", baseDays: 75, availableBalance: 70 });
  const summary = certifiedVacationSummary(opening, [legacy], "2026-10-17");
  assert.equal(summary.available, 27.5);
  assert.equal(summary.used, 0);
  assert.equal(legacy.availableBalance, 70);
});

test("five-day preview after documented reconciliation leaves exactly 22.50", () => {
  const summary = certifiedVacationSummary(opening, [], "2026-10-17");
  const preview = calculateVacationPreview({ asOf: "2026-10-17", startDate: "2026-10-19", endDate: "2026-10-23",
    hireDate: opening.hireDate, periods: summary.periods, agreementAccepted: true,
    calendarStatusByYear: { 2026: "verified" } });
  assert.equal(preview.businessDays, 5);
  assert.equal(preview.totalAvailable, 27.5);
  assert.equal(preview.totalAfterRequest, 22.5);
});

test("certification RPC retains documentary fields in audit and skips identical repetitions", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202610160001_hr_certified_vacation_balances.sql", import.meta.url), "utf8");
  const rpc = sql.slice(sql.indexOf("create or replace function public.hr_import_certified_vacation_balances"),
    sql.indexOf("revoke all on function public.hr_certified_opening_immutable"));
  assert.match(rpc, /item\|\|jsonb_build_object\('cutoff'/);
  assert.match(rpc, /skipped:=skipped\+1; continue/);
  assert.match(rpc, /certified_opening_already_exists/);
  assert.doesNotMatch(rpc, /insert into public.hr_vacation_(movements|requests|allocations|documents)/i);
});
