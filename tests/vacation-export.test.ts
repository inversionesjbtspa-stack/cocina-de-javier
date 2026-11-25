import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { getVacationBalanceSummary } from "../src/lib/hr/vacation-balance-summary.ts";
import { certifiedVacationSummary, type CertifiedOpeningBalance } from "../src/lib/hr/vacation-certified.ts";
import { calculateVacationPreview, type VacationPeriod } from "../src/lib/hr/vacation-domain.ts";
import { toVacationPeriod } from "../src/lib/hr/vacation-persistence.ts";
import { buildVacationExcelXml, isVacationExportEmployee, type VacationExportData } from "../src/lib/hr/vacation-export.ts";
import { loadVacationExportData } from "../src/lib/hr/vacation-export-server.ts";
import { loadCertifiedVacationStates } from "../src/lib/hr/vacation-certified-server.ts";

const asOf = "2026-11-25";
function opening(overrides: Partial<CertifiedOpeningBalance> = {}): CertifiedOpeningBalance {
  return { id: "opening-local", employeeId: "employee-local", tenantId: "tenant-local", balanceDays: 22.25,
    effectiveCutoffDate: "2026-10-16", hireDate: "2020-04-01", baseDays: 15, progressiveDaysCurrent: 0,
    annualEntitlementOverride: null, overrideReason: null, recognizedPreviousYears: null, internalAlert: null,
    source: "local-fixture", ...overrides };
}
function bucket(o: CertifiedOpeningBalance, overrides: Partial<VacationPeriod> = {}): VacationPeriod {
  return { id: "period-local", employeeId: o.employeeId, tenantId: o.tenantId, openingBalanceId: o.id,
    earnedOn: o.effectiveCutoffDate, periodStart: o.effectiveCutoffDate, periodEnd: o.effectiveCutoffDate,
    baseDays: 0, progressiveDays: 0, positiveAdjustments: Math.max(0, o.balanceDays),
    negativeAdjustments: Math.max(0, -o.balanceDays), usedDays: 5, reservedDays: 0,
    availableBalance: o.balanceDays - 5, status: "open", ...overrides };
}
function data(o: CertifiedOpeningBalance | null, periods: VacationPeriod[] = []): VacationExportData {
  const id = o?.employeeId ?? "employee-local";
  return { asOf, employees: [{ id, fullName: "Persona local", rut: "LOCAL-NO-REAL", status: "activo" }],
    summaries: new Map([[id, getVacationBalanceSummary({ employeeId: id, asOf, opening: o, periods })]]), movements: [], requests: [] };
}
function parse(xml: string) {
  assert.equal(XMLValidator.validate(xml), true);
  return new XMLParser({ ignoreAttributes: false, parseTagValue: false,
    isArray: name => ["Worksheet", "Row", "Cell"].includes(name) }).parse(xml).Workbook;
}
function summaryRow(input: VacationExportData) {
  const sheet = parse(buildVacationExcelXml(input)).Worksheet[0];
  const headers = sheet.Table.Row[0].Cell.map((c: { Data: { "#text": string } }) => c.Data["#text"]);
  return Object.fromEntries(sheet.Table.Row[1].Cell.map((c: { Data?: { "#text": string; "@_ss:Type": string } }, i: number) =>
    [headers[i], c.Data ? c.Data["@_ss:Type"] === "Number" ? Number(c.Data["#text"]) : c.Data["#text"] : null]));
}

test("vacation export preserves physical period employee and tenant ownership", () => {
  const period = toVacationPeriod({ employee_id: "employee-local", tenant_id: "tenant-local", period_start: "2026-10-16", period_end: "2026-10-16", available_balance: "17.25" });
  assert.equal(period.employeeId, "employee-local"); assert.equal(period.tenantId, "tenant-local");
  assert.equal(period.availableBalance, 17.25);
});

test("Stefano-like canonical fixture preserves certified 22.25, used 5 and available 17.25", () => {
  const o = opening(); const input = data(o, [bucket(o)]); const s = input.summaries.get(o.employeeId)!;
  assert.equal(s.certifiedBalance, 22.25); assert.equal(s.used, 5); assert.equal(s.availableBalance, 17.25);
  const row = summaryRow(input);
  assert.equal(row["Saldo certificado"], 22.25); assert.equal(row["Utilizados post-corte"], 5);
  assert.equal(row["SALDO DISPONIBLE"], 17.25); assert.equal(row["Proxima anualidad"], "2027-04-01");
});

test("Meliza-like physical anniversary exports opening 31 plus accrued 15 equals 46", () => {
  const o = opening({ balanceDays: 31, hireDate: "2020-11-01" });
  const input = data(o, [bucket(o, { usedDays: 0, availableBalance: 31 }), bucket(o, { id: "annuity-local", earnedOn: "2026-11-01", baseDays: 15, positiveAdjustments: 0, usedDays: 0, availableBalance: 15 })]);
  const row = summaryRow(input);
  assert.equal(row["Saldo certificado"], 31); assert.equal(row["Devengados post-corte"], 15); assert.equal(row["SALDO DISPONIBLE"], 46);
  assert.equal(row["Periodos informativos"], 1);
});

test("Egliany-like opening adjustment and later usage remain distinct", () => {
  const o = opening({ balanceDays: 27.5 });
  const row = summaryRow(data(o, [bucket(o, { positiveAdjustments: 32.5, availableBalance: 27.5 })]));
  assert.equal(row["Ajustes post-corte"], 5); assert.equal(row["Utilizados post-corte"], 5); assert.equal(row["SALDO DISPONIBLE"], 27.5);
});

test("Louis-like corrected net usage is not credited a second time", () => {
  const o = opening({ balanceDays: 15 });
  const input = data(o, [bucket(o, { usedDays: 6, availableBalance: 9 })]);
  input.movements.push({ employeeId: o.employeeId, movementType: "holiday_correction", days: 1, balanceAfter: 9, period: asOf });
  const row = summaryRow(input);
  assert.equal(row["Ajustes post-corte"], 0); assert.equal(row["Utilizados post-corte"], 6); assert.equal(row["SALDO DISPONIBLE"], 9);
});

test("Molero-like negative certified balance stays numeric and negative", () => {
  const row = summaryRow(data(opening({ balanceDays: -1.25 })));
  assert.equal(row["Saldo certificado"], -1.25); assert.equal(row["SALDO DISPONIBLE"], -1.25);
  assert.match(row.Alertas, /NEGATIVO/);
});

test("uncertified balance is N/D and explicitly different from a real zero", () => {
  const unknown = summaryRow(data(null)); const zero = summaryRow(data(opening({ balanceDays: 0 })));
  assert.equal(unknown["SALDO DISPONIBLE"], "N/D"); assert.equal(unknown["Saldo certificado"], "N/D");
  assert.equal(unknown["Estado saldo"], "REQUIERE SALDO CERTIFICADO");
  assert.equal(zero["SALDO DISPONIBLE"], 0); assert.equal(zero["Estado saldo"], "CERTIFICADO");
});

test("CODEX, test fixtures and inactive employees are excluded from every export sheet", () => {
  const input = data(opening());
  for (const [id, fullName, status] of [["codex", "CODEX VALIDACION RRHH", "activo"], ["test", "Persona TEST", "activo"], ["inactive", "Persona inactiva", "inactivo"]]) {
    input.employees.push({ id, fullName, status, rut: "NOT-REAL" });
    input.requests.push({ employeeId: id, businessDays: 1, documentNumber: id, id, startDate: asOf, endDate: asOf, resultingBalance: 0, status: "aprobada" });
    input.movements.push({ employeeId: id, movementType: id, days: 1, balanceAfter: 0, period: asOf });
  }
  const xml = buildVacationExcelXml(input);
  assert.doesNotMatch(xml, /CODEX|Persona TEST|Persona inactiva|NOT-REAL/);
  assert.equal(parse(xml).Worksheet[0].Table.Row.length, 2);
  assert.equal(isVacationExportEmployee(input.employees[1]), false);
});

test("projected proportional does not add to available or accrue future annual 17", () => {
  for (const override of [null, 17]) {
    const o = opening({ annualEntitlementOverride: override, progressiveDaysCurrent: 2, hireDate: "2020-04-01" });
    const row = summaryRow(data(o));
    assert.equal(row["Derecho anual"], 17); assert.equal(row["Devengados post-corte"], 0);
    assert.equal(row["SALDO DISPONIBLE"], 22.25);
    assert.equal(row["Proporcional proyectado (dias/mes; no disponible)"], 17 / 12);
  }
});

test("opening balance does not depend on physical vacation periods", () => {
  const o = opening(); assert.equal(summaryRow(data(o))["SALDO DISPONIBLE"], 22.25);
});

test("absorbed legacy periods cannot create pending period alerts", () => {
  const o = opening({ balanceDays: 90 });
  const legacy = Array.from({ length: 7 }, (_, i) => ({ id: `legacy-${i}`, employeeId: o.employeeId, periodStart: `201${i}-01-01`, periodEnd: `201${i}-12-31`, baseDays: 15, availableBalance: 15 }));
  const row = summaryRow(data(o, legacy));
  assert.equal(row["SALDO DISPONIBLE"], 90); assert.equal(row["Periodos informativos"], 0);
  assert.doesNotMatch(row.Alertas ?? "", /periodos|anualidades/i);
});

test("every exported fixture balance equals canonical domain and preview input balance", () => {
  for (const balanceDays of [0, 22.25, 27.5, 31, -1.25, 23.75]) {
    const o = opening({ balanceDays }); const input = data(o); const s = input.summaries.get(o.employeeId)!;
    const canonical = certifiedVacationSummary(o, [], asOf);
    const preview = calculateVacationPreview({ asOf, hireDate: o.hireDate, startDate: "2026-11-26", endDate: "2026-11-26", agreementAccepted: true, periods: s.periods });
    assert.equal(s.availableBalance, canonical.available); assert.equal(summaryRow(input)["SALDO DISPONIBLE"], canonical.available);
    assert.equal(preview.totalAvailable, canonical.available);
  }
});

test("global export total equals canonical summaries, including decimals and negatives", () => {
  const input = data(opening()); const amounts = [22.25, 27.5, 46, 9, -1.25, 0];
  input.employees = []; input.summaries = new Map(amounts.map((balanceDays, i) => {
    const o = opening({ employeeId: `employee-${i}`, balanceDays });
    input.employees.push({ id: o.employeeId, fullName: `Persona local ${i}`, rut: `LOCAL-${i}`, status: "activo" });
    return [o.employeeId, getVacationBalanceSummary({ employeeId: o.employeeId, asOf, opening: o, periods: [] })];
  }));
  const rows = parse(buildVacationExcelXml(input)).Worksheet[0].Table.Row.slice(1);
  const exported = rows.reduce((sum: number, r: { Cell: { Data: { "#text": string; "@_ss:Type": string } }[] }) => {
    assert.equal(r.Cell[6].Data["@_ss:Type"], "Number"); return sum + Number(r.Cell[6].Data["#text"]);
  }, 0);
  assert.equal(exported, amounts.reduce((a, b) => a + b, 0));
});

test("export is deterministic, non-mutating, XML escaped and retains four sheets", () => {
  const o = opening(); const input = data(o, [bucket(o)]); input.employees[0].fullName = "Persona <local> & otra";
  const before = JSON.stringify([...input.summaries]); const first = buildVacationExcelXml(input);
  assert.equal(buildVacationExcelXml(input), first); assert.equal(JSON.stringify([...input.summaries]), before);
  assert.match(first, /Persona &lt;local&gt; &amp; otra/);
  assert.deepEqual(parse(first).Worksheet.map((s: { "@_ss:Name": string }) => s["@_ss:Name"]), ["RESUMEN", "DETALLE POR PERIODO", "MOVIMIENTOS", "SOLICITUDES"]);
});

test("export rejects missing, stale or duplicate summaries rather than fabricate zeros", () => {
  const input = data(opening());
  assert.throws(() => buildVacationExcelXml({ ...input, summaries: new Map() }), /summary_mismatch/);
  assert.throws(() => buildVacationExcelXml({ ...input, asOf: "2026-11-26" }), /summary_mismatch/);
  assert.throws(() => buildVacationExcelXml({ ...input, employees: [...input.employees, ...input.employees] }), /duplicate_employee/);
  assert.throws(() => getVacationBalanceSummary({ employeeId: "different", asOf, opening: opening(), periods: [] }), /owner_mismatch/);
});

test("strict export mode fails on unavailable certified RPC while older consumers retain fallback", async () => {
  const client = { rpc: async () => ({ error: { code: "PGRST202" }, data: null }) } as unknown as Pick<SupabaseClient, "rpc">;
  assert.deepEqual(await loadCertifiedVacationStates(client, "tenant-local"), []);
  await assert.rejects(loadCertifiedVacationStates(client, "tenant-local", { required: true }), /state_unavailable/);
  const empty = { rpc: async () => ({ error: null, data: null }) } as unknown as Pick<SupabaseClient, "rpc">;
  await assert.rejects(loadCertifiedVacationStates(empty, "tenant-local", { required: true }), /state_unavailable/);
});

test("selected physical period cannot silently change employee or tenant ownership", () => {
  const o = opening();
  for (const overrides of [{ employeeId: "another" }, { tenantId: "another" }]) {
    assert.throws(() => data(o, [bucket(o, overrides)]), /owner_mismatch/);
  }
});

test("export repository is tenant-scoped, paginated and read-only; query failures stop export", async () => {
  const calls: Array<{ table: string; filters: string[][]; ranges: number[][] }> = [];
  let fail = false;
  const client = {
    rpc: async (name: string, args: { p_tenant_id: string }) => {
      assert.equal(name, "hr_certified_vacation_states"); assert.equal(args.p_tenant_id, "tenant-local"); return { data: [], error: null };
    },
    from(table: string) {
      const record = { table, filters: [] as string[][], ranges: [] as number[][] }; calls.push(record);
      const chain = { select() { return chain; }, eq(k: string, v: string) { record.filters.push([k, v]); return chain; }, order() { return chain; },
        async range(from: number, to: number) {
          record.ranges.push([from, to]);
          if (fail) return { data: null, error: { message: "local-error" } };
          return { data: table === "hr_employees" ? Array.from({ length: from === 0 ? 500 : 1 }, (_, i) => ({ id: `employee-${from + i}`, tenant_id: "tenant-local", full_name: `Persona local ${from + i}`, rut: "LOCAL", status: "activo" })) : [], error: null };
        } };
      return chain;
    }
  } as unknown as SupabaseClient;
  const output = await loadVacationExportData(client, "tenant-local", asOf);
  assert.equal(output.employees.length, 501); assert.equal(output.summaries.size, 501);
  assert.ok(calls.every(call => call.filters.some(([key, value]) => key === "tenant_id" && value === "tenant-local")));
  assert.ok(calls.some(call => call.ranges[0][0] === 500));
  fail = true; await assert.rejects(loadVacationExportData(client, "tenant-local", asOf), /read_failed/);
});

test("ficha and export consume shared summary; serializer has no independent balance formula", async () => {
  const ui = await readFile("src/components/hr/vacation-components.tsx", "utf8");
  const repository = await readFile("src/lib/hr/vacation-export-server.ts", "utf8");
  const serializer = await readFile("src/lib/hr/vacation-export.ts", "utf8");
  assert.match(ui, /getVacationBalanceSummary\(/); assert.match(repository, /getVacationBalanceSummary\(/);
  assert.doesNotMatch(serializer, /reduce\(|calculatePeriodBalance|calculateVacationPreview/);
  const route = await readFile("src/app/api/hr/vacations/export/route.ts", "utf8");
  assert.ok(route.indexOf("await requireHrContext()") < route.indexOf("loadVacationExportData(createAdminClient()"));
  assert.doesNotMatch(route + repository, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.match(route, /status: 503/);
});
