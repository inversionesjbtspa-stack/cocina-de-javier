import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("audit page reads Supabase audit events instead of fixed timeline fixtures", async () => {
  const page = await readFile("src/app/(erp)/auditoria/page.tsx", "utf8");
  assert.match(page, /getAuditEvents/);
  assert.doesNotMatch(page, /const events = \[/);
});

test("treasury export handles validation in the UI and preserves supplier details", async () => {
  const panel = await readFile("src/components/payments/payment-nomina-panel.tsx", "utf8");
  const template = await readFile("src/lib/payments/santander-template.ts", "utf8");
  assert.match(panel, /fetch\(`\/api\/payment-template/);
  assert.match(panel, /Descargar reporte de errores/);
  assert.doesNotMatch(panel, /href=\{`\/api\/payment-template/);
  assert.match(template, /supplierName/);
  assert.match(template, /ya esta en nomina activa/);
});

test("supplier creation and payable repair routes exist and audit mutations", async () => {
  const supplierRoute = await readFile("src/app/api/suppliers/route.ts", "utf8");
  const repairRoute = await readFile("src/app/api/admin/payables/repair-suppliers/route.ts", "utf8");
  assert.match(supplierRoute, /supplier\.created/);
  assert.match(supplierRoute, /supplier_rut_exists/);
  assert.match(repairRoute, /accounts_payable\.suppliers_repaired/);
  assert.match(repairRoute, /razon_social_emisor/);
});
