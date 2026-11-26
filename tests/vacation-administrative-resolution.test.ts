import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareAdministrativeVacationOpening } from "../src/lib/hr/vacation-administrative-resolution.ts";
import { mapCertifiedOpening } from "../src/lib/hr/vacation-certified.ts";
import { getVacationBalanceSummary } from "../src/lib/hr/vacation-balance-summary.ts";
import { buildVacationExcelXml } from "../src/lib/hr/vacation-export.ts";
import { XMLParser } from "fast-xml-parser";

const employee = Object.freeze({ id: "local-worker", tenantId: "local-tenant", rut: "22.222.222-2", status: "activo", hireDate: "2021-09-07" });
const approval = Object.freeze({ workerId: employee.id, tenantId: employee.tenantId, canonicalRut: employee.rut,
  sourceRut: "11.111.111-1", sourceFile: "local-fixture.xlsx", sourceHash: "a".repeat(64), sourceRow: 7,
  cutoffDate: "2026-10-16", balanceDays: 11, approvalReference: "explicit-local-fixture-approval", resolutionReason: "Administracion autorizo el vinculo del fixture." });

for (const [label, balance] of [["Brenda-like", 11], ["Genesis-like", 49]] as const) {
  test(`${label}: approved source RUT may differ, preserves canonical identity and exact opening`, () => {
    const p = prepareAdministrativeVacationOpening(employee, { ...approval, balanceDays: balance });
    assert.equal(p.balance_days, balance); assert.equal(p.source_balance, balance);
    assert.equal(p.canonical_rut, "22.222.222-2"); assert.equal(p.source_rut, "11.111.111-1");
    assert.equal(p.canonical_rut_normalized, "22222222-2"); assert.equal(p.source_rut_normalized, "11111111-1");
    assert.equal(employee.rut, "22.222.222-2"); assert.equal(p.resolved_worker_id, employee.id);
    assert.equal(p.effective_cutoff_date, "2026-10-16"); assert.equal(p.resolution_reason, approval.resolutionReason);
  });

  test(`${label}: canonical available and numeric Excel equal opening without adding legacy`, () => {
    const p = prepareAdministrativeVacationOpening(employee, { ...approval, balanceDays: balance });
    const opening = mapCertifiedOpening({ ...p, id: "local-opening", employee_id: employee.id, tenant_id: employee.tenantId,
      hire_date: employee.hireDate, base_days: 15, source: p.source_file });
    const summary = getVacationBalanceSummary({ employeeId: employee.id, asOf: "2026-11-25", opening,
      periods: [{ id: "legacy-local", employeeId: employee.id, periodStart: "2021-09-07", periodEnd: "2022-09-06", baseDays: 15, availableBalance: 60 }] });
    assert.equal(summary.certifiedBalance, balance); assert.equal(summary.availableBalance, balance);
    assert.equal(summary.used, 0); assert.equal(summary.accruedPostCutoff, 0);
    const xml = buildVacationExcelXml({ asOf: "2026-11-25", employees: [{ id: employee.id, fullName: "Persona local", rut: employee.rut, status: "activo" }],
      summaries: new Map([[employee.id, summary]]), movements: [], requests: [] });
    const sheet = new XMLParser({ ignoreAttributes: false, parseTagValue: false, isArray: n => ["Worksheet", "Row", "Cell"].includes(n) }).parse(xml).Workbook.Worksheet[0];
    assert.equal(sheet.Table.Row[0].Cell[6].Data["#text"], "SALDO DISPONIBLE");
    assert.equal(sheet.Table.Row[1].Cell[6].Data["#text"], String(balance));
    assert.equal(sheet.Table.Row[1].Cell[6].Data["@_ss:Type"], "Number");
    assert.equal(sheet.Table.Row[1].Cell[7].Data["#text"], String(balance));
    assert.doesNotMatch(xml, /<Interior|ss:Color=|PrimaryHeader|AvailableBalance|Missing/);
    assert.match(xml, /<FreezePanes\/>/); assert.match(xml, /<AutoFilter/);
  });
}

test("resolution payload preparation is deterministic and cannot write or mutate identity", () => {
  const first = prepareAdministrativeVacationOpening(employee, approval);
  assert.deepEqual(prepareAdministrativeVacationOpening(employee, approval), first);
  assert.equal(employee.rut, "22.222.222-2");
});

test("explicit worker, tenant and canonical RUT must all match; name is never an identity key", () => {
  for (const mismatch of [{ workerId: "other" }, { tenantId: "other" }, { canonicalRut: "33.333.333-3" }]) {
    assert.throws(() => prepareAdministrativeVacationOpening(employee, { ...approval, ...mismatch }), /identity_mismatch/);
  }
});

test("missing employment date or inactive employee blocks before any RPC payload", () => {
  assert.throws(() => prepareAdministrativeVacationOpening({ ...employee, hireDate: null }, approval), /employee_invalid/);
  assert.throws(() => prepareAdministrativeVacationOpening({ ...employee, status: "inactivo" }, approval), /employee_invalid/);
});

test("invalid dates, missing authorization, invalid source hash or amount block resolution", () => {
  for (const source of [{ cutoffDate: "not-a-date" }, { cutoffDate: "2026-02-31" }, { cutoffDate: "2020-01-01" },
    { approvalReference: "" }, { resolutionReason: "" }, { sourceHash: "" }, { balanceDays: NaN }, { sourceRow: 0 }]) {
    assert.throws(() => prepareAdministrativeVacationOpening(employee, { ...approval, ...source }));
  }
});

test("existing import RPC provides unique openings, no repeat audit on skipped rows and no artificial movements", async () => {
  const sql = await readFile("supabase/migrations/202610160001_hr_certified_vacation_balances.sql", "utf8");
  assert.match(sql, /unique \(tenant_id,employee_id\)/);
  const rpc = sql.slice(sql.indexOf("create or replace function public.hr_import_certified_vacation_balances"), sql.indexOf("revoke all on function public.hr_certified_opening_immutable"));
  assert.match(rpc, /skipped:=skipped\+1; continue/); assert.match(rpc, /item\|\|jsonb_build_object/);
  assert.doesNotMatch(rpc, /insert into public.hr_vacation_(movements|requests|allocations|documents)/i);
});
