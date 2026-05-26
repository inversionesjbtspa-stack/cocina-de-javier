import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mapBankName } from "../src/lib/payments/bank-mappings.ts";

test("audit page reads Supabase audit events instead of fixed timeline fixtures", async () => {
  const page = await readFile("src/app/(erp)/auditoria/page.tsx", "utf8");
  assert.match(page, /getAuditEvents/);
  assert.doesNotMatch(page, /const events = \[/);
});

test("treasury export handles validation in the UI and preserves supplier details", async () => {
  const panel = await readFile("src/components/payments/payment-nomina-panel.tsx", "utf8");
  const template = await readFile("src/lib/payments/santander-template.ts", "utf8");
  const route = await readFile("src/app/api/payment-template/route.ts", "utf8");
  assert.match(panel, /fetch\(`\/api\/payment-template/);
  assert.match(panel, /Descargar reporte de errores/);
  assert.doesNotMatch(panel, /href=\{`\/api\/payment-template/);
  assert.match(template, /supplierName/);
  assert.match(template, /ya esta en nomina activa/);
  assert.match(route, /Errores nomina Santander\.csv/);
  assert.match(route, /x-erp-request/);
});

test("supplier creation and payable repair routes exist and audit mutations", async () => {
  const supplierRoute = await readFile("src/app/api/suppliers/route.ts", "utf8");
  const repairRoute = await readFile("src/lib/payments/repair-suppliers.ts", "utf8");
  assert.match(supplierRoute, /supplier\.created/);
  assert.match(supplierRoute, /supplier_rut_exists/);
  assert.match(repairRoute, /accounts_payable\.payment_suppliers_repaired/);
  assert.match(repairRoute, /razon_social_emisor/);
  assert.match(repairRoute, /bank_code/);
});

test("Santander bank mapping handles dirty master bank names from treasury capture", () => {
  assert.deepEqual(
    [
      mapBankName("BANCO DE CREDITO E INVERSIONES - NOVA// BCI"),
      mapBankName("BANCO DE A. EDWARDS"),
      mapBankName("BANCO SANTANDER ( CHILE )"),
      mapBankName("THE FIRST NAT. BANK OF BOSTON//[object Object]ITAU")
    ].map((bank) => [bank.bankNameNormalized, bank.bankCode, bank.needsReview]),
    [
      ["BCI", "16", false],
      ["BANCO DE CHILE / EDWARDS", "1", false],
      ["BANCO SANTANDER CHILE", "37", false],
      ["ITAU", "39", false]
    ]
  );
});

test("audit timeline hides technical duplicate XML events by default", async () => {
  const auditFile = await readFile("src/components/audit/audit-timeline.tsx", "utf8");
  const eventsFile = await readFile("src/lib/audit/events.ts", "utf8");
  assert.match(auditFile, /Mostrar eventos tecnicos/);
  assert.match(auditFile, /showTechnical \|\| !event\.technical/);
  assert.match(eventsFile, /dte\.xml_duplicate_seen/);
  assert.match(eventsFile, /technical: isTechnicalEvent/);
});
