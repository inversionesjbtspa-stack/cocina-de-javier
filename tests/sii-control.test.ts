import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseSiiRegistryFile } from "../src/lib/sii/registry-parser.ts";

test("SII registry parser reads CSV rows for XML reconciliation", () => {
  const csv = Buffer.from("Tipo DTE;Folio;RUT Proveedor;Razon Social;Fecha Emision;Monto Total\n33;123;76123456-7;Proveedor Test;2026-05-20;$1.190\n");
  const { rows } = parseSiiRegistryFile({ buffer: csv, name: "registro-sii.csv" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tipoDte, "33");
  assert.equal(rows[0].folio, "123");
  assert.equal(rows[0].rutProveedor, "76123456-7");
  assert.equal(rows[0].montoTotal, 1190);
});

test("Control SII module exposes upload, comparison and missing XML claim text", async () => {
  const page = await readFile("src/app/(erp)/control-sii/page.tsx", "utf8");
  const client = await readFile("src/components/sii/sii-control-client.tsx", "utf8");
  const route = await readFile("src/app/api/sii/compare/route.ts", "utf8");
  const store = await readFile("src/lib/sii/registry-store.ts", "utf8");
  assert.match(page, /Control SII vs XML/);
  assert.match(client, /Importar y cruzar/);
  assert.match(client, /Importacion acumulativa/);
  assert.match(client, /Proveedores a reclamar XML/);
  assert.match(client, /Favor reenviar los XML correspondientes/);
  assert.match(route, /sii_purchase_registry/);
  assert.match(store, /sii\.registry_imported/);
  assert.match(store, /sii\.xml_missing_resolved/);
});
