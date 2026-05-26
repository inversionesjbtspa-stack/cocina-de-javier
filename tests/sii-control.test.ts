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

test("SII registry parser accepts RCV summary files for aggregate control", () => {
  const csv = Buffer.from("Tipo Documento;Total Documentos;Monto Neto;IVA Recuperable;Monto Total\nFactura Electronica;12;$10.000;$1.900;$11.900\nNota de Credito Electronica;1;$-1.000;$-190;$-1.190\n");
  const parsed = parseSiiRegistryFile({ buffer: csv, name: "RCV_RESUMEN_COMPRA_REGISTRO_79939910_202605.csv" });
  assert.equal(parsed.isSummary, true);
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.summaryRows.length, 2);
  assert.equal(parsed.summaryRows[0].periodo, "2026-05");
  assert.equal(parsed.summaryRows[0].rutEmpresa, "7993991-0");
  assert.equal(parsed.summaryRows[0].tipoDocumento, "33");
  assert.equal(parsed.summaryRows[0].cantidadDocumentos, 12);
  assert.equal(parsed.summaryRows[0].montoTotal, 11900);
  assert.equal(parsed.summaryRows[1].tipoDocumento, "61");
});

test("Control SII module exposes upload, comparison and missing XML claim text", async () => {
  const page = await readFile("src/app/(erp)/control-sii/page.tsx", "utf8");
  const client = await readFile("src/components/sii/sii-control-client.tsx", "utf8");
  const route = await readFile("src/app/api/sii/compare/route.ts", "utf8");
  const store = await readFile("src/lib/sii/registry-store.ts", "utf8");
  assert.match(page, /Control SII vs XML/);
  assert.match(client, /Importar y cruzar/);
  assert.match(client, /Importacion acumulativa/);
  assert.match(client, /Control por resumen mensual/);
  assert.match(client, /Para identificar folios faltantes sube el detalle/);
  assert.match(client, /Proveedores a reclamar XML/);
  assert.match(client, /Favor reenviar los XML correspondientes/);
  assert.match(route, /sii_purchase_registry/);
  assert.match(route, /importedSummary/);
  assert.match(store, /sii\.registry_imported/);
  assert.match(store, /sii\.summary_imported/);
  assert.match(store, /sii\.xml_missing_resolved/);
});
