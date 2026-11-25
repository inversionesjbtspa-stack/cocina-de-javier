import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";
import { loadVacationExportData } from "../src/lib/hr/vacation-export-server.ts";
import { buildVacationExcelXml, VACATION_SUMMARY_HEADERS } from "../src/lib/hr/vacation-export.ts";
import { getVacationBalanceSummary } from "../src/lib/hr/vacation-balance-summary.ts";
import { vacationCertificationReviewAlert } from "../src/lib/hr/vacation-certification-review.ts";

const employee = { id: "local-employee", fullName: "Persona local", rut: "11111111-1" };
const asOf = "2026-11-25";

test("available balance is the first vacation figure, before certified opening", () => {
  assert.equal(VACATION_SUMMARY_HEADERS[6], "SALDO DISPONIBLE");
  assert.equal(VACATION_SUMMARY_HEADERS[7], "Saldo certificado");
  assert.ok(VACATION_SUMMARY_HEADERS.indexOf("SALDO DISPONIBLE") < VACATION_SUMMARY_HEADERS.indexOf("Saldo certificado"));
});

test("different source RUT only flags review and cannot assign a balance by name", () => {
  const antecedent = { employeeId: null, fullName: "  PERSONA LOCAL  ", rut: "22222222-2" };
  const before = JSON.stringify(antecedent);
  assert.equal(vacationCertificationReviewAlert(employee, [antecedent]), "REQUIERE SALDO CERTIFICADO - CONFLICTO DE RUT");
  assert.equal(getVacationBalanceSummary({ employeeId: employee.id, asOf, periods: [] }).availableBalance, null);
  assert.equal(JSON.stringify(antecedent), before);
});

test("same RUT in a different format does not invent a conflict", () => {
  assert.equal(vacationCertificationReviewAlert(employee, [{ employeeId: null, fullName: employee.fullName, rut: "11.111.111-1" }]), "REQUIERE SALDO CERTIFICADO");
});

test("different name or another linked employee cannot become a source match", () => {
  for (const source of [{ employeeId: null, fullName: "Otra persona", rut: "22222222-2" }, { employeeId: "another-id", fullName: employee.fullName, rut: "22222222-2" }]) {
    assert.equal(vacationCertificationReviewAlert(employee, [source]), "REQUIERE SALDO CERTIFICADO");
  }
});

test("an employee-linked conflicting RUT remains a review alert even if name differs", () => {
  assert.match(vacationCertificationReviewAlert(employee, [{ employeeId: employee.id, fullName: "Nombre historico", rut: "22222222-2" }]), /CONFLICTO DE RUT/);
});

test("29 active fixture rows stay canonical, unknown N/D, conflict explicit, CODEX excluded", async () => {
  const employees = Array.from({ length: 29 }, (_, n) => ({ id: `local-${n}`, tenant_id: "local-tenant", full_name: `Persona local ${n}`, rut: `LOCAL-${n}`, status: "activo" }));
  const opening = { id: "local-opening", employee_id: "local-0", tenant_id: "local-tenant", balance_days: 22.25, effective_cutoff_date: "2026-10-16", hire_date: "2020-04-01", base_days: 15, progressive_days_current: 0, source: "fixture" };
  const period = { id: "local-period", employee_id: "local-0", tenant_id: "local-tenant", certified_opening_balance_id: opening.id, earned_on: opening.effective_cutoff_date, period_start: opening.effective_cutoff_date, period_end: opening.effective_cutoff_date, base_days: 0, positive_adjustments: 22.25, used_days: 5, available_balance: 17.25 };
  const client = {
    rpc: async () => ({ data: [{ opening, periods: [period] }], error: null }),
    from(table: string) {
      const chain = { select() { return chain; }, eq(key: string, value: string) { if (key === "tenant_id") assert.equal(value, "local-tenant"); return chain; }, order() { return chain; }, async range() {
        return { data: table === "hr_employees" ? [...employees, { id: "codex", full_name: "CODEX VALIDACION RRHH", rut: "LOCAL", status: "activo" }]
          : table === "hr_accountant_data_rows" ? [{ id: "source", employee_id: null, full_name: "Persona local 1", rut: "99999999-9" }] : [], error: null };
      } }; return chain;
    }
  } as unknown as SupabaseClient;
  const data = await loadVacationExportData(client, "local-tenant", asOf);
  assert.equal(data.employees.length, 29); assert.equal(data.summaries.get("local-0")!.availableBalance, 17.25);
  assert.equal(data.summaries.get("local-1")!.availableBalance, null);
  const xml = buildVacationExcelXml(data);
  const sheet = new XMLParser({ ignoreAttributes: false, parseTagValue: false, isArray: n => ["Worksheet", "Row", "Cell"].includes(n) }).parse(xml).Workbook.Worksheet[0];
  assert.equal(sheet.Table.Row.length, 30);
  const used = sheet.Table.Row[1].Cell;
  assert.equal(used[6].Data["#text"], "17.25"); assert.equal(used[6].Data["@_ss:Type"], "Number");
  assert.equal(used[6]["@_ss:StyleID"], "AvailableBalance"); assert.equal(used[7].Data["#text"], "22.25");
  const unknown = sheet.Table.Row[2].Cell;
  assert.equal(unknown[6].Data["#text"], "N/D"); assert.equal(unknown[7].Data["#text"], "N/D");
  assert.match(unknown[18].Data["#text"], /CONFLICTO DE RUT/);
  assert.doesNotMatch(xml, /CODEX/);
});

test("certification preserves documentary source metadata in its existing audit contract", async () => {
  const sql = await readFile("supabase/migrations/202610160001_hr_certified_vacation_balances.sql", "utf8");
  const rpc = sql.slice(sql.indexOf("create or replace function public.hr_import_certified_vacation_balances"), sql.indexOf("revoke all on function"));
  assert.match(rpc, /item\|\|jsonb_build_object\('cutoff'/);
  assert.match(rpc, /after_data/);
  assert.match(rpc, /certified_employee_not_found_or_ambiguous/);
  assert.match(rpc, /certified_opening_already_exists/);
  // Structural preservation only; no certification RPC or database mutation is executed here.
});

test("presentation changes contain no hardcoded worker identities or certification writes", async () => {
  const code = await readFile("src/lib/hr/vacation-certification-review.ts", "utf8");
  const repository = await readFile("src/lib/hr/vacation-export-server.ts", "utf8");
  assert.doesNotMatch(code + repository, /GENESIS|STEFANO|33481571|33482814|balance_days:\s*49/);
  assert.doesNotMatch(code + repository, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|hr_import_certified_vacation_balances/);
});
